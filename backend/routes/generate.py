import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException

from models.schema import (
    BlueprintRequest,
    BlueprintResponse,
    ExamConfig,
    ExamResponse,
    GradeRequest,
    GradeResponse,
    PracticeRequest,
    Question,
)
from services.blueprint import build_blueprint
from services.course_map import build_rule_based_course_map
from services.generator import (
    fallback_questions_from_blueprint,
    generate_questions_from_blueprint,
)
from services.grader import grade_exam
from services.quality_judge import ai_review_question, filter_quality_questions
from services.validator import validate_questions

router = APIRouter()


def _filter_chunks(chunks: list[dict], source_types: list[str]) -> list[dict]:
    if not source_types:
        return chunks
    allowed = set(source_types)
    return [chunk for chunk in chunks if chunk.get("document_type") in allowed]


def _chunks_for_blueprint(
    doc: dict, blueprint_items: list[dict], source_types: Optional[list[str]] = None
) -> list[dict]:
    concept_ids = {
        item.get("concept_id") for item in blueprint_items if item.get("concept_id")
    }
    chunks = [
        chunk
        for chunk in doc.get("concept_chunks", [])
        if not concept_ids or chunk.get("concept_id") in concept_ids
    ]
    chunks = _filter_chunks(chunks, source_types or []) or chunks
    if chunks:
        return chunks

    source_ids = {
        source_id
        for item in blueprint_items
        for source_id in item.get("source_ids", [])
        if source_id
    }
    return [
        {
            "source": page.get("source", ""),
            "source_label": page.get("source_label", page.get("source", "")),
            "content": page.get("content", ""),
            "document_type": page.get("document_type", "unknown"),
            "concept": page.get("title", "Study material"),
            "concept_id": page.get("section_id", page.get("source", "")),
            "evidence": page.get("content", "")[:700],
        }
        for page in doc.get("pages", [])
        if page.get("content", "").strip()
        and (not source_ids or page.get("source") in source_ids)
    ]


def _ensure_course_map(doc: dict) -> dict:
    if not doc.get("course_map"):
        doc["course_map"] = build_rule_based_course_map(doc.get("pages", []))
    return doc["course_map"]


def _build_exam_response(
    exam_id: str, config: ExamConfig, valid_questions: list[dict]
) -> ExamResponse:
    exam_questions = [
        Question(
            type=q["type"],
            question=q["question"],
            options=q.get("options"),
            answer=q["answer"],
            explanation=q["explanation"],
            source=q["source"],
            evidence=q.get("evidence", ""),
            concept_id=q.get("concept_id", ""),
            concept=q.get("concept", ""),
            unit_id=q.get("unit_id", ""),
            unit_title=q.get("unit_title", ""),
            learning_objective=q.get("learning_objective", ""),
            document_type=q.get("document_type", "unknown"),
            bloom_level=q.get("bloom_level", "understand"),
            difficulty=q.get("difficulty", config.difficulty),
        )
        for q in valid_questions
    ]
    return ExamResponse(
        exam_id=exam_id,
        questions=exam_questions,
        time_limit=config.time_limit,
        document_id=config.document_id,
    )


def _letter_options(options: list[str]) -> list[str]:
    cleaned = []
    labels = ["A", "B", "C", "D"]
    for index, option in enumerate((options or [])[:4]):
        text = str(option or "").strip()
        if len(text) >= 3 and text[1:2] == ")":
            text = text[2:].strip()
        cleaned.append(f"{labels[index]}) {text}")
    return cleaned


def _answer_to_letter(answer: str, options: list[str]) -> str:
    raw = str(answer or "").strip()
    if raw[:1].upper() in {"A", "B", "C", "D"}:
        return raw[:1].upper()
    raw_norm = " ".join(raw.lower().split())
    for index, option in enumerate(options):
        option_text = option[2:].strip() if len(option) >= 3 and option[1:2] == ")" else option
        if raw_norm and raw_norm in " ".join(option_text.lower().split()):
            return ["A", "B", "C", "D"][index]
    return "A"


def _hydrate_question_metadata(question: dict, plan: dict) -> dict:
    q = dict(question)
    if not plan:
        return q
    forced = {
        "type": plan.get("question_type"),
        "source": ", ".join(plan.get("source_labels") or plan.get("source_ids") or []),
        "evidence": " ".join(plan.get("evidence", [])[:2]),
        "unit_id": plan.get("unit_id", ""),
        "unit_title": plan.get("unit_title", ""),
        "concept_id": plan.get("concept_id", ""),
        "concept": plan.get("concept", ""),
        "learning_objective": plan.get("learning_objective", ""),
        "bloom_level": plan.get("bloom_level", "understand"),
        "difficulty": plan.get("difficulty", "medium"),
        "document_type": plan.get("document_type", "unknown"),
    }
    for key, value in forced.items():
        q[key] = value
    q["plan_id"] = plan.get("plan_id")
    q.setdefault("explanation", f"The answer is supported by the evidence for {plan.get('concept', 'this concept')}.")
    if q.get("type") == "true_false" and not q.get("options"):
        q["options"] = ["True", "False"]
    if q.get("type") == "true_false":
        q["answer"] = "True" if str(q.get("answer", "")).strip().lower().startswith("t") else "False"
        q.setdefault("options", ["True", "False"])
    if q.get("type") == "mcq":
        q["options"] = _letter_options(q.get("options") or [])
        if len(q["options"]) == 4:
            q["answer"] = _answer_to_letter(q.get("answer", ""), q["options"])
    if q.get("type") == "short_answer":
        q["options"] = None
        if not q.get("answer"):
            q["answer"] = f"A complete answer should explain {plan.get('concept', 'the concept')} using the provided evidence."
    return q


def _plan_for_question(question: dict, blueprint_items: list[dict]):
    for item in blueprint_items:
        if question.get("plan_id") and question.get("plan_id") == item.get("plan_id"):
            return item
        if question.get("concept_id") and question.get("concept_id") == item.get("concept_id"):
            return item
    return None


def _ai_review_candidates(questions: list[dict], blueprint_items: list[dict], max_reviews: int = 5) -> list[dict]:
    reviewed = []
    for question in questions[:max_reviews]:
        plan = _plan_for_question(question, blueprint_items)
        if not plan:
            continue
        improved, _ = ai_review_question(question, plan)
        if improved:
            reviewed.append(_hydrate_question_metadata(improved, plan))
    if len(questions) > max_reviews:
        reviewed.extend(questions[max_reviews:])
    return reviewed


def _store_blueprint(doc: dict, blueprint: dict) -> dict:
    doc.setdefault("blueprints", {})
    doc["blueprints"][blueprint["blueprint_id"]] = blueprint
    return blueprint


def _create_blueprint_for_config(
    document_id: str, doc: dict, config: ExamConfig
) -> dict:
    course_map = _ensure_course_map(doc)
    blueprint = build_blueprint(document_id, course_map, config)
    return _store_blueprint(doc, blueprint)


def _generate_exam_from_blueprint(
    doc: dict, config: ExamConfig, blueprint: dict
) -> ExamResponse:
    plan_items = blueprint.get("question_plan", [])
    if not plan_items:
        raise HTTPException(
            status_code=400,
            detail="No high-value blueprint items found. Review the course map and include at least one concept with evidence.",
        )

    context_chunks = _chunks_for_blueprint(doc, plan_items, config.source_types)
    if not context_chunks:
        raise HTTPException(
            status_code=400,
            detail="No usable evidence found for the selected course map items.",
        )

    all_valid = []
    all_rejected = []
    max_retries = 2
    temperature = 0.35
    target_count = len(plan_items)

    for attempt in range(max_retries + 1):
        remaining_types = {
            "mcq": config.mcq,
            "true_false": config.true_false,
            "short_answer": config.short_answer,
        }
        for question in all_valid:
            remaining_types[question["type"]] = max(
                0, remaining_types.get(question["type"], 0) - 1
            )
        needed_items = []
        for item in plan_items:
            qtype = item.get("question_type")
            existing = any(q.get("plan_id") == item.get("plan_id") for q in all_valid)
            if not existing and remaining_types.get(qtype, 0) > 0:
                needed_items.append(item)
                remaining_types[qtype] -= 1
        if not needed_items or len(all_valid) >= target_count:
            break

        batch_items = needed_items[:4]
        try:
            generated = generate_questions_from_blueprint(batch_items, temperature=temperature)
        except Exception as e:
            all_rejected.append({"reason": "generation failed for this blueprint batch"})
            if attempt < max_retries:
                temperature = 0
                continue
            break

        plan_lookup = {item.get("plan_id"): item for item in batch_items}
        plan_lookup.update({item.get("concept_id"): item for item in batch_items})
        hydrated = []
        used_plan_ids = set()
        for index, q in enumerate(generated.get("questions", [])):
            plan = (
                plan_lookup.get(q.get("plan_id"))
                or plan_lookup.get(q.get("concept_id"))
                or (batch_items[index] if index < len(batch_items) else None)
            )
            if not plan:
                continue
            used_plan_ids.add(plan.get("plan_id"))
            hydrated.append(_hydrate_question_metadata(q, plan))
        for item in batch_items:
            if item.get("plan_id") not in used_plan_ids:
                all_rejected.append({
                    "plan_id": item.get("plan_id"),
                    "reason": "model did not return a question for this blueprint item",
                })
        grounded, rejected_grounding = validate_questions(hydrated, context_chunks)
        reviewed_grounded = _ai_review_candidates(grounded, batch_items)
        quality_valid, rejected_quality = filter_quality_questions(reviewed_grounded, batch_items)
        if not quality_valid and grounded:
            quality_valid, rejected_quality = filter_quality_questions(grounded, batch_items)
        all_valid.extend(quality_valid)
        all_rejected.extend(
            rejected_grounding + rejected_quality + generated.get("skipped", [])
        )
        temperature = 0.2

    if not all_valid:
        fallback_generated = fallback_questions_from_blueprint(plan_items[:target_count])
        fallback_questions = []
        for index, q in enumerate(fallback_generated.get("questions", [])):
            plan = plan_items[index] if index < len(plan_items) else {}
            fallback_questions.append(_hydrate_question_metadata(q, plan))
        if fallback_questions:
            exam_id = str(uuid.uuid4())
            exam_data = _build_exam_response(exam_id, config, fallback_questions[:target_count])
            doc.setdefault("exams", {})[exam_id] = {
                "blueprint_id": blueprint.get("blueprint_id"),
                "question_count": len(exam_data.questions),
                "fallback": True,
            }
            return exam_data

        reasons = "; ".join(
            str(item.get("reject_reason") or item.get("reason") or item)
            for item in all_rejected[:4]
        )
        detail = (
            "Failed to generate high-quality grounded questions from the course map."
        )
        if reasons:
            detail = f"{detail} Rejections: {reasons}"
        raise HTTPException(status_code=500, detail=detail)

    exam_id = str(uuid.uuid4())
    exam_data = _build_exam_response(exam_id, config, all_valid[:target_count])
    doc.setdefault("exams", {})[exam_id] = {
        "blueprint_id": blueprint.get("blueprint_id"),
        "question_count": len(exam_data.questions),
    }
    return exam_data


@router.post("/generate-blueprint", response_model=BlueprintResponse)
async def generate_blueprint(request: BlueprintRequest):
    from app import documents_store

    config = request.config
    if config.document_id not in documents_store:
        raise HTTPException(
            status_code=404, detail="Document not found. Please upload files first."
        )
    blueprint = _create_blueprint_for_config(
        config.document_id, documents_store[config.document_id], config
    )
    return BlueprintResponse(
        blueprint_id=blueprint["blueprint_id"],
        document_id=config.document_id,
        blueprint=blueprint,
    )


@router.get("/blueprint/{blueprint_id}", response_model=BlueprintResponse)
async def get_blueprint(blueprint_id: str):
    from app import documents_store

    for document_id, doc in documents_store.items():
        blueprint = doc.get("blueprints", {}).get(blueprint_id)
        if blueprint:
            return BlueprintResponse(
                blueprint_id=blueprint_id, document_id=document_id, blueprint=blueprint
            )
    raise HTTPException(status_code=404, detail="Blueprint not found.")


@router.post("/generate", response_model=ExamResponse)
async def generate_exam(config: ExamConfig):
    from app import documents_store, exams_store

    if config.document_id not in documents_store:
        raise HTTPException(
            status_code=404, detail="Document not found. Please upload files first."
        )

    doc = documents_store[config.document_id]
    blueprint = _create_blueprint_for_config(config.document_id, doc, config)
    exam_data = _generate_exam_from_blueprint(doc, config, blueprint)
    exams_store[exam_data.exam_id] = exam_data
    return exam_data


@router.get("/exam/{exam_id}", response_model=ExamResponse)
async def get_exam(exam_id: str):
    from app import exams_store

    if exam_id not in exams_store:
        raise HTTPException(status_code=404, detail="Exam not found.")
    return exams_store[exam_id]


@router.post("/grade", response_model=GradeResponse)
async def grade(request: GradeRequest):
    from app import exams_store

    if request.exam_id not in exams_store:
        raise HTTPException(status_code=404, detail="Exam not found.")

    exam = exams_store[request.exam_id]
    questions = [q.model_dump() for q in exam.questions]
    result = grade_exam(questions, request.answers)
    exams_store[f"{request.exam_id}:last_grade"] = result
    return GradeResponse(**result)


@router.post("/practice/weak-areas", response_model=ExamResponse)
async def practice_weak_areas(request: PracticeRequest):
    from app import documents_store, exams_store

    if request.exam_id not in exams_store:
        raise HTTPException(status_code=404, detail="Exam not found.")

    source_exam = exams_store[request.exam_id]
    document_id = source_exam.document_id
    if not document_id or document_id not in documents_store:
        raise HTTPException(
            status_code=404, detail="Original document context not found."
        )

    last_grade = exams_store.get(f"{request.exam_id}:last_grade", {})
    missed_concepts = [
        item.get("concept_id")
        for item in last_grade.get("weak_concepts", [])
        if item.get("concept_id")
    ] or [
        question.concept_id for question in source_exam.questions if question.concept_id
    ]

    config = ExamConfig(
        document_id=document_id,
        time_limit=max(10, min(30, request.count * 3)),
        mcq=min(request.count, 3),
        true_false=0,
        short_answer=max(0, request.count - min(request.count, 3)),
        difficulty="medium",
        focus="weak concepts adaptive practice",
        bloom_levels=["apply", "analyze"],
        study_goal="weak_area_practice",
        question_style="application",
        selected_concept_ids=missed_concepts,
    )
    doc = documents_store[document_id]
    blueprint = _create_blueprint_for_config(document_id, doc, config)
    exam_data = _generate_exam_from_blueprint(doc, config, blueprint)
    exams_store[exam_data.exam_id] = exam_data
    return exam_data
