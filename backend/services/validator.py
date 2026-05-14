from difflib import SequenceMatcher


def _normalize(text: str) -> str:
    """Normalize text for comparison."""
    return " ".join(text.lower().split())


def _answer_in_context(answer: str, context_chunks: list[dict]) -> bool:
    """Check if the answer (or a close paraphrase) appears in the context."""
    answer_norm = _normalize(answer)
    # For short answers like "True"/"False" or single-letter MCQ answers, skip this check
    if len(answer_norm) <= 5:
        return True

    for chunk in context_chunks:
        chunk_norm = _normalize(chunk["content"])
        # Check substring match
        if answer_norm in chunk_norm:
            return True
        # Check fuzzy match on key phrases (at least 60% overlap)
        ratio = SequenceMatcher(None, answer_norm, chunk_norm).ratio()
        if ratio > 0.3:
            return True
        # Check if answer words mostly appear in chunk
        answer_words = set(answer_norm.split())
        chunk_words = set(chunk_norm.split())
        if len(answer_words) > 2:
            overlap = len(answer_words & chunk_words) / len(answer_words)
            if overlap > 0.6:
                return True

    return False


def _is_duplicate(question: dict, existing: list[dict]) -> bool:
    """Check if a question is too similar to existing ones."""
    q_norm = _normalize(question["question"])
    for existing_q in existing:
        existing_norm = _normalize(existing_q["question"])
        ratio = SequenceMatcher(None, q_norm, existing_norm).ratio()
        if ratio > 0.75:
            return True
    return False


def _is_valid_structure(question: dict) -> bool:
    """Check that question has all required fields and valid structure."""
    required = ["type", "question", "answer", "explanation", "source"]
    for field in required:
        if field not in question or not question[field]:
            return False

    qtype = question["type"]
    if qtype == "mcq":
        if not question.get("options") or len(question["options"]) < 4:
            return False
    elif qtype == "true_false":
        if question["answer"] not in ("True", "False"):
            return False
    elif qtype == "coding":
        # MCQ-style coding needs 4 options; short-answer style needs none
        if question.get("options") and len(question["options"]) < 4:
            return False
        if not question.get("code_snippet"):
            return False
    elif qtype not in ("short_answer",):
        return False

    # Check minimum question length
    if len(question["question"].split()) < 3:
        return False

    return True


def validate_questions(
    questions: list[dict],
    context_chunks: list[dict],
) -> tuple[list[dict], list[dict]]:
    """
    Validate generated questions. Returns (valid, rejected) lists.
    """
    valid = []
    rejected = []

    for q in questions:
        # Check structure
        if not _is_valid_structure(q):
            rejected.append({**q, "reject_reason": "invalid_structure"})
            continue

        # Check for duplicates
        if _is_duplicate(q, valid):
            rejected.append({**q, "reject_reason": "duplicate"})
            continue

        # Check answer grounding (for short_answer type)
        if q["type"] == "short_answer":
            if not _answer_in_context(q["answer"], context_chunks):
                rejected.append({**q, "reject_reason": "answer_not_in_context"})
                continue

        valid.append(q)

    return valid, rejected
