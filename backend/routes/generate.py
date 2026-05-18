import math
import uuid
import logging
from fastapi import APIRouter, HTTPException
from models.schema import (
    ExamConfig, ExamResponse, Question,
    GradeRequest, GradeResponse, FeedbackRequest,
    AnalysisRequest, AddRequirementRequest, RequirementsResponse,
    QuestionRatingsRequest,
)
from services.generator import generate_questions
from services.validator import validate_questions
from services.grader import grade_exam

router = APIRouter()
log = logging.getLogger(__name__)


def _hints_from_rejected(rejected: list[dict]) -> list[str]:
    """
    Translate the validator's rejection reasons into concise, actionable hints
    that the generator can act on in its next attempt.

    Duplicates now produce *surgical* per-question hints so the LLM only needs
    to replace the specific offending questions rather than regenerating the
    whole batch.  Each hint identifies the rejected question, the accepted
    question it conflicts with, and the concept_key prefix to avoid.
    """
    hints: list[str] = []
    struct_by_type: dict[str, int] = {}
    grounding_count = 0
    quality_reasons: list[str] = []
    dup_hints: list[str] = []

    for r in rejected:
        reason = r.get("reject_reason", "")
        if reason == "invalid_structure":
            qtype = r.get("type", "unknown")
            struct_by_type[qtype] = struct_by_type.get(qtype, 0) + 1
        elif reason == "answer_not_grounded":
            grounding_count += 1
        elif reason.startswith("quality:"):
            quality_reasons.append(reason[len("quality:"):].strip())
        elif reason == "duplicate":
            # Build a targeted replacement hint: tell the LLM exactly which
            # question to fix and what to avoid, without asking it to regenerate
            # the whole batch.
            new_q   = (r.get("question") or "")[:90].rstrip()
            exist_q = (r.get("duplicate_of") or "")[:90].rstrip()
            dup_key = r.get("duplicate_of_key") or ""
            prefix  = "/".join(dup_key.split("/")[:2]) if dup_key else ""

            if exist_q:
                msg = (
                    f'Rejected: "{new_q}…" — this duplicates the already-accepted '
                    f'question "{exist_q}…". '
                    f'Replace it with a question on a DIFFERENT subtopic or question type.'
                )
            else:
                msg = (
                    f'Rejected: "{new_q}…" — duplicate detected. '
                    f'Replace it with a question on a completely different subtopic.'
                )
            if prefix:
                msg += f' Do NOT reuse concept_key prefix "{prefix}".'
            dup_hints.append(msg)

    _STRUCT_HINTS = {
        "short_answer": (
            "{n} short_answer question(s) rejected: the model answer must be "
            "2-4 full sentences explaining the concept — single words, acronyms, "
            "or one-sentence answers are not accepted"
        ),
        "true_false": (
            "{n} true_false question(s) rejected: the 'answer' field must be "
            "exactly the string \"True\" or \"False\" — not a number or index"
        ),
        "mcq": (
            "{n} MCQ question(s) rejected: provide exactly 4 options "
            "(A, B, C, D) with plausible distractors"
        ),
        "coding": (
            "{n} coding question(s) rejected: each coding question must include "
            "a code_snippet field containing actual code from the source material"
        ),
    }

    for qtype, count in struct_by_type.items():
        template = _STRUCT_HINTS.get(
            qtype,
            "{n} {t} question(s) rejected for structural errors — review all required fields",
        )
        hints.append(template.format(n=count, t=qtype))

    if grounding_count:
        hints.append(
            f"{grounding_count} question(s) rejected: the answer could not be found "
            "in the source material — only generate answers directly supported by "
            "the provided content, do not hallucinate facts"
        )

    for reason in quality_reasons[:3]:   # cap at 3 to keep the prompt concise
        hints.append(f"Quality issue from previous batch: {reason}")

    # Cap duplicate hints at 5 — beyond that the prompt becomes too noisy.
    # The generator is already told which concept_keys are covered via the
    # covered_concept_keys block; these hints add the *specific* question text
    # so the LLM can surgically replace only the conflicting entries.
    hints.extend(dup_hints[:5])

    return hints


@router.post("/generate", response_model=ExamResponse)
async def generate_exam(config: ExamConfig):
    from app import documents_store, exams_store, exam_doc_store, feedback_store
    from services.bm25_retriever import should_use_retrieval, retrieve_chunks

    # Validate document exists
    if config.document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found. Please upload a file first.")

    doc = documents_store[config.document_id]

    # Use original_pages for retrieval — these are preserved even when the user
    # edits the context in the review step (which overwrites doc["pages"]).
    source_pages = doc.get("original_pages") or doc["pages"]

    all_chunks = [
        {
            "source": page.get("source", ""),
            "source_label": page.get("source_label", page.get("source", "")),
            "content": page["content"],
        }
        for page in source_pages
        if page.get("content", "").strip()
    ]

    if not all_chunks:
        raise HTTPException(status_code=400, detail="No text content found in the document.")

    # Two-stage BM25 retrieval for very large documents (> 200 pages).
    # Most lecture sets are under the threshold and get full context —
    # BM25 only activates for textbooks / large reading packs.
    # When retrieval is needed, prefer user focus → stored main_ideas → stratified fallback.
    if should_use_retrieval(all_chunks):
        ideas_text = doc.get("ideas", "")
        exam_chunks = retrieve_chunks(
            pages=all_chunks,
            focus_text=config.focus or ideas_text or None,
        )
    else:
        exam_chunks = all_chunks

    # Generate + Validate (with retry)
    all_valid = []
    max_retries = 4
    temperature = 0.7
    validation_hints: list[str] = []  # rejection feedback forwarded to the generator each round

    total_needed = config.mcq + config.true_false + config.short_answer + config.coding
    log.info(
        "[generate] START  doc=%s  target=%d  "
        "(mcq=%d tf=%d sa=%d coding=%d)  difficulty=%s",
        config.document_id[:8], total_needed,
        config.mcq, config.true_false, config.short_answer, config.coding,
        config.difficulty,
    )

    for attempt in range(max_retries + 1):
        valid_by_type = {"mcq": 0, "true_false": 0, "short_answer": 0, "coding": 0}
        for q in all_valid:
            valid_by_type[q["type"]] = valid_by_type.get(q["type"], 0) + 1

        need_mcq = max(0, config.mcq - valid_by_type["mcq"])
        need_tf = max(0, config.true_false - valid_by_type["true_false"])
        need_sa = max(0, config.short_answer - valid_by_type["short_answer"])
        need_coding = max(0, config.coding - valid_by_type["coding"])

        if need_mcq + need_tf + need_sa + need_coding == 0:
            log.info("[generate] Attempt %d — all slots filled, stopping early.", attempt + 1)
            break

        log.info(
            "[generate] Attempt %d/%d  need=(mcq=%d tf=%d sa=%d coding=%d)  temp=%.2f",
            attempt + 1, max_retries + 1,
            need_mcq, need_tf, need_sa, need_coding, temperature,
        )
        if validation_hints:
            log.info("[generate] Feedback hints forwarded to generator:")
            for hint in validation_hints:
                log.info("            ⚠  %s", hint)

        past_feedback = feedback_store.get(config.document_id, [])

        # Tell the LLM which concept_keys are already satisfied so it generates
        # novel questions on retries instead of repeating covered subtopics.
        covered_keys = [q["concept_key"] for q in all_valid if q.get("concept_key")]

        # Ask for ~50 % more than the deficit so that even if the validator
        # rejects some questions, enough valid ones remain to fill all remaining
        # slots.  The trim step after the loop caps delivery to the originally
        # requested counts, so over-generation is always safe.
        gen_mcq    = math.ceil(need_mcq    * 1.5) if need_mcq    else 0
        gen_tf     = math.ceil(need_tf     * 1.5) if need_tf     else 0
        gen_sa     = math.ceil(need_sa     * 1.5) if need_sa     else 0
        gen_coding = math.ceil(need_coding * 1.5) if need_coding else 0

        try:
            questions = generate_questions(
                chunks=exam_chunks,
                mcq=gen_mcq,
                true_false=gen_tf,
                short_answer=gen_sa,
                coding=gen_coding,
                difficulty=config.difficulty,
                focus=config.focus,
                past_feedback=past_feedback,
                covered_concept_keys=covered_keys,
                validation_feedback=validation_hints,
                temperature=temperature,
            )
            _type_counts = {}
            for _q in questions:
                _type_counts[_q.get("type", "?")]  = _type_counts.get(_q.get("type", "?"), 0) + 1
            log.info(
                "[generate] Attempt %d — LLM returned %d question(s): %s",
                attempt + 1, len(questions),
                "  ".join(f"{t}={n}" for t, n in sorted(_type_counts.items())),
            )
        except Exception as e:
            log.warning("[generate] Attempt %d — generation failed: %s", attempt + 1, e)
            if attempt < max_retries:
                temperature = 0.3
                continue
            raise HTTPException(status_code=500, detail=f"Question generation failed: {str(e)}")

        # Keep concept-key dedup strict for all attempts except the very last
        # one.  Surgical feedback (see _hints_from_rejected) now tells the LLM
        # exactly which question to replace and which subtopic to avoid, so
        # earlier relaxation is no longer needed.  The last-attempt safety valve
        # still exists for documents that genuinely cover only one narrow topic.
        # On the last attempt also enable relaxed_rules (lower grounding threshold
        # + shorter short_answer minimum) to guarantee count delivery.
        strict_dedup   = attempt < max_retries
        relaxed_rules  = attempt == max_retries
        if not strict_dedup:
            log.info(
                "[generate] Attempt %d — LAST RESORT: concept-key dedup relaxed "
                "+ validation rules relaxed",
                attempt + 1,
            )
        valid, rejected = validate_questions(
            questions, exam_chunks,
            existing_questions=all_valid,
            strict_dedup=strict_dedup,
            relaxed_rules=relaxed_rules,
        )
        all_valid.extend(valid)

        # Log per-rejection-reason breakdown
        _reason_counts: dict[str, int] = {}
        for _r in rejected:
            _rsn = _r.get("reject_reason", "unknown")
            _reason_counts[_rsn] = _reason_counts.get(_rsn, 0) + 1
        _pool_by_type: dict[str, int] = {}
        for _q in all_valid:
            _pool_by_type[_q["type"]] = _pool_by_type.get(_q["type"], 0) + 1
        log.info(
            "[generate] Attempt %d — accepted=%d  rejected=%d  pool_total=%d",
            attempt + 1, len(valid), len(rejected), len(all_valid),
        )
        if rejected:
            log.info(
                "[generate]          rejection breakdown: %s",
                "  ".join(f"{r}={n}" for r, n in sorted(_reason_counts.items())),
            )
        log.info(
            "[generate]          accepted pool: %s",
            "  ".join(f"{t}={n}" for t, n in sorted(_pool_by_type.items())) or "(empty)",
        )

        # Translate this round's rejections into actionable hints for the next
        # generation attempt so the LLM corrects the exact errors that caused
        # failures rather than making a blind re-roll.
        validation_hints = _hints_from_rejected(rejected)
        if validation_hints:
            log.info(
                "[generate] Attempt %d — %d hint(s) queued for next attempt",
                attempt + 1, len(validation_hints),
            )

        # Exit only when the retry budget is exhausted; the count check at the
        # top of the loop handles the "all done" case on the next iteration.
        # (Removing the old `rejected == 0` early-exit prevents a false break
        # when the LLM generates fewer questions than requested but all pass.)
        if attempt >= max_retries:
            break

        temperature = 0.3

    if not all_valid:
        raise HTTPException(status_code=500, detail="Failed to generate valid questions. Try with different settings.")

    # Trim each type to the requested limit in case the LLM over-generated in
    # any single attempt (it sometimes returns more than asked).
    limits = {
        "mcq": config.mcq,
        "true_false": config.true_false,
        "short_answer": config.short_answer,
        "coding": config.coding,
    }
    trimmed: list = []
    count_by_type: dict = {}
    for q in all_valid:
        qtype = q["type"]
        if count_by_type.get(qtype, 0) < limits.get(qtype, 0):
            trimmed.append(q)
            count_by_type[qtype] = count_by_type.get(qtype, 0) + 1
    all_valid = trimmed

    # Final delivery summary
    _delivered = {t: 0 for t in limits}
    for q in all_valid:
        _delivered[q["type"]] = _delivered.get(q["type"], 0) + 1
    _short = {t: limits[t] - _delivered.get(t, 0) for t in limits if limits[t] > _delivered.get(t, 0)}
    if _short:
        log.warning(
            "[generate] DONE — delivered %d/%d  SHORT by: %s",
            len(all_valid), total_needed,
            "  ".join(f"{t}={n}" for t, n in _short.items()),
        )
    else:
        log.info(
            "[generate] DONE — delivered %d/%d  (%s)  ✓",
            len(all_valid), total_needed,
            "  ".join(f"{t}={n}" for t, n in sorted(_delivered.items()) if n > 0),
        )

    if not all_valid:
        raise HTTPException(status_code=500, detail="No valid questions remained after trimming. Try with different settings.")

    # Build exam
    exam_id = str(uuid.uuid4())
    exam_questions = [
        Question(
            type=q["type"],
            question=q["question"],
            options=q.get("options"),
            answer=q["answer"],
            explanation=q["explanation"],
            source=q["source"],
            code_snippet=q.get("code_snippet"),
            concept_key=q.get("concept_key"),
        )
        for q in all_valid
    ]

    exam_data = ExamResponse(
        exam_id=exam_id,
        document_id=config.document_id,
        questions=exam_questions,
        time_limit=config.time_limit,
    )

    exams_store[exam_id] = exam_data
    exam_doc_store[exam_id] = config.document_id

    return exam_data


@router.get("/exam/{exam_id}", response_model=ExamResponse)
async def get_exam(exam_id: str):
    from app import exams_store

    if exam_id not in exams_store:
        raise HTTPException(status_code=404, detail="Exam not found.")

    return exams_store[exam_id]


@router.post("/feedback")
async def submit_feedback(request: FeedbackRequest):
    from app import exams_store, exam_doc_store, feedback_store

    if request.exam_id not in exam_doc_store:
        raise HTTPException(status_code=404, detail="Exam not found.")

    doc_id = exam_doc_store[request.exam_id]
    if doc_id not in feedback_store:
        feedback_store[doc_id] = []
    feedback_store[doc_id].append(request.feedback.strip())

    return {"message": "Feedback saved. It will be applied to the next exam generated from this document."}


@router.post("/exam/{exam_id}/question-ratings")
async def rate_questions(exam_id: str, request: QuestionRatingsRequest):
    """
    Accept per-question thumbs-up / thumbs-down ratings from the results page.

    Only thumbs-down entries with a non-empty reason are actionable: they are
    converted to feedback strings and appended to feedback_store[doc_id] so
    they influence the next generation for the same document.

    Thumbs-up = silence = zero bytes stored. This is the most memory-efficient
    approach — no new store, no new keys, just appending to the existing list.
    """
    from app import exams_store, exam_doc_store, feedback_store

    if exam_id not in exams_store:
        raise HTTPException(status_code=404, detail="Exam not found.")

    doc_id = exam_doc_store.get(exam_id)
    if not doc_id:
        raise HTTPException(status_code=404, detail="Exam document not found.")

    bad = [r for r in request.ratings if r.rating == "down" and r.reason.strip()]
    if bad:
        questions = exams_store[exam_id].questions
        if doc_id not in feedback_store:
            feedback_store[doc_id] = []
        for r in bad:
            idx = r.question_index
            q_text = questions[idx].question[:120] if idx < len(questions) else f"question {idx + 1}"
            feedback_store[doc_id].append(
                f"Q{idx + 1} was flagged as poor — {r.reason.strip()}"
                f' (question: "{q_text}")'
            )

    return {"accepted": len(bad)}


@router.post("/grade", response_model=GradeResponse)
async def grade(request: GradeRequest):
    from app import exams_store

    if request.exam_id not in exams_store:
        raise HTTPException(status_code=404, detail="Exam not found.")

    exam = exams_store[request.exam_id]
    questions = [q.model_dump() for q in exam.questions]

    result = grade_exam(questions, request.answers)
    return GradeResponse(**result)


@router.post("/exam/{exam_id}/analyze")
async def analyze_exam_results(exam_id: str, request: AnalysisRequest):
    """Run the result analyzer agent and store recommendations for the next exam."""
    from app import exam_doc_store, feedback_store
    from agents.result_analyzer import analyze_results

    if exam_id not in exam_doc_store:
        raise HTTPException(status_code=404, detail="Exam not found.")

    doc_id = exam_doc_store[exam_id]

    try:
        analysis = analyze_results(request.details)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    if doc_id not in feedback_store:
        feedback_store[doc_id] = []
    feedback_store[doc_id].append(analysis)

    return {"message": "Analysis complete.", "analysis": analysis}


@router.post("/requirements/{document_id}")
async def add_requirement(document_id: str, request: AddRequirementRequest):
    """Add a single user-supplied requirement for the next exam generated from this document."""
    from app import documents_store, feedback_store

    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found.")

    req = request.requirement.strip()
    if not req:
        raise HTTPException(status_code=400, detail="Requirement text must not be empty.")

    if document_id not in feedback_store:
        feedback_store[document_id] = []
    feedback_store[document_id].append(req)

    return {"message": "Requirement added."}


@router.get("/requirements/{document_id}", response_model=RequirementsResponse)
async def get_requirements(document_id: str):
    """Return stored feedback and analysis requirements for a document."""
    from app import feedback_store

    requirements = feedback_store.get(document_id, [])
    return RequirementsResponse(document_id=document_id, requirements=requirements)


@router.delete("/requirements/{document_id}")
async def clear_requirements(document_id: str):
    """Clear all stored feedback and analysis requirements for a document."""
    from app import feedback_store

    feedback_store.pop(document_id, None)
    return {"message": "Requirements cleared."}
