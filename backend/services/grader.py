import os
import json
import numpy as np
import google.generativeai as genai
from services.embedder import embed_query

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

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

    model = genai.GenerativeModel(
        "gemini-2.0-flash",
        generation_config=genai.GenerationConfig(
            temperature=0.1,
            response_mime_type="application/json",
        ),
    )

    response = model.generate_content(prompt)
    parsed = json.loads(response.text.strip())
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

    for i, q in enumerate(questions):
        user_answer = answers.get(str(i), "")
        q_type = q.get("type", "")
        correct_answer = q.get("answer", "")
        is_correct = None
        feedback = ""

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
        })

    return {
        "score": score,
        "gradable": gradable,
        "total": len(questions),
        "percentage": round((score / gradable * 100), 1) if gradable > 0 else 0,
        "details": details,
    }
