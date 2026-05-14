from difflib import SequenceMatcher


def _normalize(text: str) -> str:
    return " ".join(str(text).lower().split())


def _text_overlap(a: str, b: str) -> float:
    a_words = {w for w in _normalize(a).split() if len(w) > 2}
    b_words = {w for w in _normalize(b).split() if len(w) > 2}
    if not a_words:
        return 0.0
    return len(a_words & b_words) / len(a_words)


def _is_duplicate(question: dict, existing: list[dict]) -> bool:
    q_norm = _normalize(question.get("question", ""))
    for existing_q in existing:
        ratio = SequenceMatcher(None, q_norm, _normalize(existing_q.get("question", ""))).ratio()
        if ratio > 0.78:
            return True
    return False


def _is_valid_structure(question: dict) -> bool:
    required = ["type", "question", "answer", "explanation", "source", "evidence", "concept_id", "concept"]
    if any(not question.get(field) for field in required):
        return False

    qtype = question.get("type")
    if qtype == "mcq":
        options = question.get("options") or []
        answer = str(question.get("answer", "")).strip().upper()
        if len(options) != 4 or answer[:1] not in {"A", "B", "C", "D"}:
            return False
    elif qtype == "true_false":
        if str(question.get("answer", "")).strip() not in {"True", "False"}:
            return False
    elif qtype != "short_answer":
        return False

    return len(str(question.get("question", "")).split()) >= 5


def normalize_question(question: dict, context_chunks: list[dict]) -> dict:
    q = dict(question)
    concept_id = q.get("concept_id")
    matching = None
    if concept_id:
        matching = next((chunk for chunk in context_chunks if chunk.get("concept_id") == concept_id), None)
    if matching is None and context_chunks:
        concept = _normalize(q.get("concept", ""))
        matching = next(
            (chunk for chunk in context_chunks if concept and concept in _normalize(chunk.get("concept", ""))),
            context_chunks[0],
        )

    if matching:
        q.setdefault("concept_id", matching.get("concept_id", ""))
        q.setdefault("concept", matching.get("concept", ""))
        q.setdefault("source", matching.get("source_label", matching.get("source", "")))
        q.setdefault("document_type", matching.get("document_type", "unknown"))
        q.setdefault("evidence", matching.get("evidence", "") or matching.get("content", "")[:500])

    q.setdefault("bloom_level", "understand")
    q.setdefault("difficulty", "medium")
    if q.get("type") == "true_false" and not q.get("options"):
        q["options"] = ["True", "False"]
    if q.get("type") == "short_answer":
        q["options"] = None
    return q


def _supported_by_context(question: dict, context_chunks: list[dict]) -> bool:
    concept_id = question.get("concept_id", "")
    evidence = question.get("evidence", "")
    answer = question.get("answer", "")
    explanation = question.get("explanation", "")
    candidates = [
        chunk for chunk in context_chunks
        if not concept_id or chunk.get("concept_id") == concept_id
    ] or context_chunks

    for chunk in candidates:
        if concept_id and chunk.get("concept_id") == concept_id:
            return True
        content = " ".join([
            chunk.get("content", ""),
            chunk.get("evidence", ""),
            chunk.get("source_label", ""),
        ])
        if evidence and (_normalize(evidence) in _normalize(content) or _text_overlap(evidence, content) >= 0.35):
            return True
        if _text_overlap(answer, content) >= 0.30 or _text_overlap(explanation, content) >= 0.30:
            return True
    return False


def validate_questions(questions: list[dict], context_chunks: list[dict]) -> tuple[list[dict], list[dict]]:
    valid = []
    rejected = []

    for raw_q in questions:
        q = normalize_question(raw_q, context_chunks)
        if not _is_valid_structure(q):
            rejected.append({**q, "reject_reason": "invalid_structure"})
            continue
        if _is_duplicate(q, valid):
            rejected.append({**q, "reject_reason": "duplicate"})
            continue
        if not _supported_by_context(q, context_chunks):
            rejected.append({**q, "reject_reason": "unsupported_by_evidence"})
            continue

        evidence_score = max(
            _text_overlap(q.get("evidence", ""), chunk.get("content", ""))
            for chunk in context_chunks
        ) if context_chunks else 0
        q["quality_score"] = round(min(1.0, 0.65 + evidence_score), 2)
        valid.append(q)

    return valid, rejected
