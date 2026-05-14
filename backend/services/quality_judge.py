from difflib import SequenceMatcher
from typing import Optional
import re

from services.ai_provider import generate_json

BAD_PATTERNS = [
    "which statement is best supported",
    "uploaded material supports this idea",
    "unrelated to the course",
    "opposite without conditions",
    "only discusses administrative deadlines",
    "administrative deadlines",
    "course introduction",
    "job market",
    "our focus",
    "final project",
    "how should a student use",
    "connect ",
    "mechanism described by the source evidence",
    "only a vocabulary term",
    "works without the conditions described",
    "roadmap",
    "conference",
    "seminar",
    "grading",
    "assignment",
    "extra credit",
]


def _norm(text: str) -> str:
    return " ".join(str(text or "").lower().split())


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _option_text(option: str) -> str:
    text = str(option or "").strip()
    if len(text) >= 3 and text[1:2] == ")":
        return text[2:].strip()
    return text


def judge_question_quality(
    question: dict, blueprint_item: Optional[dict] = None
) -> dict:
    reasons = []
    q_text = _norm(question.get("question", ""))
    answer = str(question.get("answer", "")).strip()
    explanation = _norm(question.get("explanation", ""))
    evidence = " ".join(
        question.get("evidence", [])
        if isinstance(question.get("evidence"), list)
        else [str(question.get("evidence", ""))]
    )
    evidence_norm = _norm(evidence)
    objective = _norm(
        (blueprint_item or {}).get(
            "learning_objective", question.get("learning_objective", "")
        )
    )

    combined = " ".join([q_text, explanation, evidence_norm])
    for pattern in BAD_PATTERNS:
        if pattern in combined:
            reasons.append(f"contains low-quality pattern: {pattern}")

    # Check for garbage concept names spilling into the question
    if blueprint_item:
        concept_name = blueprint_item.get("concept_name", "")
        # A concept name like "Data science skill setOur focusOur focusOur focus3" will fail this check
        if re.search(r"[a-z][A-Z][a-z]|[A-Za-z]{3}\d{1,2}$", concept_name):
            if concept_name.lower() in q_text.lower():
                reasons.append(
                    "uses badly formatted/garbled concept name in question text"
                )

    if "this concept" in q_text or "this idea" in q_text:
        reasons.append("generic wording")

    if blueprint_item:
        if question.get("concept_id") and question.get(
            "concept_id"
        ) != blueprint_item.get("concept_id"):
            reasons.append("does not match blueprint concept")
        if (
            objective
            and _similarity(q_text, objective) < 0.08
            and _similarity(explanation, objective) < 0.08
        ):
            reasons.append("does not clearly target the learning objective")

    if question.get("type") == "mcq":
        options = question.get("options") or []
        if len(options) != 4:
            reasons.append("mcq does not have four options")
        generic_distractors = 0
        for option in options:
            opt = _norm(option)
            if any(pattern in opt for pattern in BAD_PATTERNS):
                generic_distractors += 1
        if generic_distractors:
            reasons.append("mcq has generic distractors")

        correct_letter = answer[:1].upper()
        index = {"A": 0, "B": 1, "C": 2, "D": 3}.get(correct_letter)
        if index is not None and index < len(options):
            correct_text = _option_text(options[index])
            if (
                evidence_norm
                and len(correct_text.split()) > 8
                and _similarity(correct_text, evidence_norm) > 0.78
            ):
                if "define" not in q_text and "definition" not in q_text:
                    reasons.append("correct option is copied from evidence")

    if question.get("type") == "true_false" and len(q_text.split()) < 10:
        reasons.append("true/false question is too shallow")

    if (
        question.get("type") == "short_answer"
        and len(str(question.get("answer", "")).split()) < 5
    ):
        reasons.append("short answer key is too thin")

    if question.get("bloom_level") in {"apply", "analyze"}:
        if not any(
            word in q_text
            for word in [
                "why",
                "how",
                "given",
                "scenario",
                "compare",
                "compute",
                "apply",
                "predict",
                "analyze",
            ]
        ):
            reasons.append("too easy for selected Bloom level")

    return {"valid": not reasons, "reasons": reasons}


def filter_quality_questions(
    questions: list[dict], blueprint_items: list[dict]
) -> tuple[list[dict], list[dict]]:
    by_plan = {item.get("plan_id"): item for item in blueprint_items}
    by_concept = {item.get("concept_id"): item for item in blueprint_items}
    valid = []
    rejected = []
    for question in questions:
        item = (
            by_plan.get(question.get("plan_id"))
            or by_concept.get(question.get("concept_id"))
            or (blueprint_items[0] if blueprint_items else {})
        )
        result = judge_question_quality(question, item)
        if result["valid"]:
            valid.append(question)
        else:
            rejected.append({**question, "reject_reason": "; ".join(result["reasons"])})
    return valid, rejected


AI_QUESTION_REVIEW_PROMPT = """You are a strict professor and exam-quality reviewer.

Review and improve the question for this learning objective.

Reject the question if it is about logistics, roadmap/career, grading, assignments, seminars, conferences, vague source support, or generic RAG wording.
If the concept/evidence is weak, return valid=false.
If the question is salvageable, rewrite it into a concrete, technical, useful study question.

Rules:
- MCQ options must be plausible technical choices from the same topic.
- Do not use options like "connect to evidence", "vocabulary term", "unrelated", or "opposite".
- Keep the question grounded in evidence.
- The correct answer must be supported by evidence.
- For apply/analyze, include reasoning, comparison, scenario, computation, or mechanism.

Return strict JSON:
{{
  "valid": true,
  "reason": "...",
  "question": {{
    "plan_id": "...",
    "type": "mcq|true_false|short_answer",
    "question": "...",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "answer": "A",
    "explanation": "...",
    "source": "...",
    "evidence": "...",
    "unit_id": "...",
    "unit_title": "...",
    "concept_id": "...",
    "concept": "...",
    "learning_objective": "...",
    "document_type": "slides|homework|reading|notes|previous_test|unknown",
    "bloom_level": "remember|understand|apply|analyze",
    "difficulty": "easy|medium|hard"
  }}
}}

BLUEPRINT ITEM:
{blueprint_item}

QUESTION:
{question}
"""


def ai_review_question(question: dict, blueprint_item: dict):
    try:
        reviewed = generate_json(
            AI_QUESTION_REVIEW_PROMPT.format(
                blueprint_item=blueprint_item,
                question=question,
            ),
            temperature=0.05,
            prefer_local=False,
        )
    except Exception as exc:
        return None, f"ai_review_failed: {exc}"

    if reviewed.get("valid") is not True:
        return None, str(reviewed.get("reason", "AI judge rejected question"))
    improved = reviewed.get("question") or {}
    if not improved:
        return None, "AI judge returned no question"
    return improved, str(reviewed.get("reason", "AI reviewed"))
