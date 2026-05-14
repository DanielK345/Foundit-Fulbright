import json
import numpy as np
from services.embedder import embed_query
from services.ai_provider import generate_json

# Stage 2 LLM prompt — used ONLY when similarity is inconclusive
LLM_GRADING_PROMPT = """You are a strict exam grader.

QUESTION:
{question}

REFERENCE ANSWER:
{reference}

STUDENT ANSWER:
{student}

GRADING RULES:
- Grade based ONLY on correctness relative to reference
- Accept paraphrasing if meaning is equivalent
- Do NOT give credit for partially correct answers unless specified
- Be strict and objective

OUTPUT FORMAT:
{{
  "score": 0 or 1,
  "reason": "short explanation"
}}"""

# Similarity thresholds
SIM_CORRECT_THRESHOLD = 0.85
SIM_INCORRECT_THRESHOLD = 0.5


def _cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    dot = np.dot(vec_a.flatten(), vec_b.flatten())
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def _llm_grade(question: str, reference: str, student: str) -> dict:
    """Stage 2: LLM grading fallback for inconclusive similarity."""
    prompt = LLM_GRADING_PROMPT.format(
        question=question,
        reference=reference,
        student=student,
    )

    parsed = generate_json(prompt, temperature=0.1)
    return {
        "is_correct": parsed.get("score", 0) == 1,
        "feedback": parsed.get("reason", ""),
    }


def _grade_short_answer(question: str, correct_answer: str, user_answer: str) -> dict:
    """
    Hybrid two-stage grading pipeline:
      Stage 1: Cosine similarity (fast filter)
      Stage 2: LLM grading (fallback for inconclusive cases)
    """
    if not user_answer or not user_answer.strip():
        return {"is_correct": False, "feedback": "No answer provided."}

    # Stage 1: Semantic similarity
    student_emb = embed_query(user_answer)
    reference_emb = embed_query(correct_answer)
    sim = _cosine_similarity(student_emb, reference_emb)
    if sim > SIM_CORRECT_THRESHOLD:
        return {"is_correct": True, "feedback": f"High semantic similarity ({sim:.2f})."}

    if sim < SIM_INCORRECT_THRESHOLD:
        return {"is_correct": False, "feedback": f"Low semantic similarity ({sim:.2f})."}

    # Stage 2: LLM fallback for inconclusive range
    result = _llm_grade(question, correct_answer, user_answer)
    result["feedback"] = f"Similarity {sim:.2f} (inconclusive). LLM verdict: {result['feedback']}"
    return result


def grade_exam(questions: list[dict], answers: dict[str, str]) -> dict:
    """
    Grade an exam submission.
      - MCQ / True-False: exact match
      - Short answer: hybrid pipeline (similarity → LLM fallback)
    """
    score = 0
    gradable = 0
    details = []
    concept_stats = {}

    for i, q in enumerate(questions):
        user_answer = answers.get(str(i), "")
        q_type = q.get("type", "")
        correct_answer = q.get("answer", "")
        is_correct = None
        feedback = ""
        concept_id = q.get("concept_id", "")
        concept = q.get("concept", "")
        unit_id = q.get("unit_id", "")
        unit_title = q.get("unit_title", "")
        learning_objective = q.get("learning_objective", "")
        diagnosis = ""

        if q_type == "mcq":
            gradable += 1
            is_correct = (
                user_answer.strip().upper().startswith(correct_answer.strip().upper())
                if user_answer
                else False
            )
            if is_correct:
                score += 1

        elif q_type == "true_false":
            gradable += 1
            is_correct = (
                user_answer.strip().lower() == correct_answer.strip().lower()
                if user_answer
                else False
            )
            if is_correct:
                score += 1

        elif q_type == "short_answer":
            gradable += 1
            result = _grade_short_answer(
                question=q.get("question", ""),
                correct_answer=correct_answer,
                user_answer=user_answer,
            )
            is_correct = result["is_correct"]
            feedback = result["feedback"]
            if is_correct:
                score += 1
            elif user_answer:
                diagnosis = f"Review {concept or 'this concept'} and compare your answer with the source evidence."

        if concept_id or concept:
            key = concept_id or concept
            if key not in concept_stats:
                concept_stats[key] = {
                    "concept_id": concept_id,
                    "concept": concept or concept_id,
                    "total": 0,
                    "missed": 0,
                    "recommended_sources": set(),
                    "unit_id": unit_id,
                    "unit_title": unit_title,
                    "learning_objective": learning_objective,
                }
            concept_stats[key]["total"] += 1
            if is_correct is False:
                concept_stats[key]["missed"] += 1
                if q.get("source"):
                    concept_stats[key]["recommended_sources"].add(q.get("source"))

        details.append({
            "question_index": i,
            "question": q.get("question", ""),
            "type": q_type,
            "user_answer": user_answer,
            "correct_answer": correct_answer,
            "explanation": q.get("explanation", ""),
            "source": q.get("source", ""),
            "is_correct": is_correct,
            "feedback": feedback,
            "concept_id": concept_id,
            "concept": concept,
            "unit_id": unit_id,
            "unit_title": unit_title,
            "learning_objective": learning_objective,
            "evidence": q.get("evidence", ""),
            "bloom_level": q.get("bloom_level", ""),
            "diagnosis": diagnosis,
        })

    concept_breakdown = []
    weak_concepts = []
    for item in concept_stats.values():
        item["recommended_sources"] = sorted(item["recommended_sources"])
        accuracy = round(((item["total"] - item["missed"]) / item["total"]) * 100, 1) if item["total"] else 0
        breakdown = {**item, "accuracy": accuracy}
        concept_breakdown.append(breakdown)
        if item["missed"] > 0:
            weak_concepts.append({
                **item,
                "diagnosis": f"You missed {item['missed']} of {item['total']} question(s) about {item['concept']}.",
            })

    return {
        "score": score,
        "gradable": gradable,
        "total": len(questions),
        "percentage": round((score / gradable * 100), 1) if gradable > 0 else 0,
        "details": details,
        "weak_concepts": weak_concepts,
        "concept_breakdown": concept_breakdown,
    }
