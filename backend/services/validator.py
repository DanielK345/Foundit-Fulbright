import re
from difflib import SequenceMatcher


# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    """Lowercase and collapse whitespace."""
    return " ".join(text.lower().split())


def _words(text: str) -> set[str]:
    """Return the set of lowercase alphanumeric tokens in a string."""
    return set(re.findall(r"[a-zA-Z0-9]+", text.lower()))


# ---------------------------------------------------------------------------
# Answer grounding helpers
# ---------------------------------------------------------------------------

def _get_correct_option_text(question: dict) -> str:
    """
    Extract the full text of the correct MCQ option.

    Options are expected in formats like "A) text" or "A. text".
    Returns an empty string if extraction fails.
    """
    letter = question.get("answer", "").strip().upper()
    if not letter:
        return ""
    for opt in (question.get("options") or []):
        stripped = opt.strip()
        if len(stripped) >= 2 and stripped[0].upper() == letter and stripped[1] in ").":
            return stripped[2:].strip()
    return ""


def _text_in_context(text: str, context_chunks: list[dict]) -> bool:
    """
    Return True if `text` is sufficiently represented in any context chunk.

    Two complementary checks:
      1. Direct substring match after normalisation.
      2. Word-level overlap: ≥ 50 % of the text's tokens appear in the chunk.
         (50 % tolerates paraphrasing while still catching hallucinations.)
    """
    norm = _normalize(text)
    text_words = _words(norm)

    # Single-word / numeric-only texts cannot be reliably grounded — pass them
    if len(text_words) <= 1:
        return True

    for chunk in context_chunks:
        chunk_norm = _normalize(chunk.get("content", ""))
        if norm in chunk_norm:
            return True
        chunk_words = _words(chunk_norm)
        overlap = len(text_words & chunk_words) / len(text_words)
        if overlap >= 0.50:
            return True

    return False


def _answer_grounded(question: dict, context_chunks: list[dict]) -> bool:
    """
    Dispatch grounding checks by question type.

    MCQ         → check the correct option's full text (not just the letter)
    short_answer → check the expected answer text
    true_false / coding → always pass (answers are "True"/"False" or computed)
    """
    qtype = question.get("type", "")

    if qtype == "mcq":
        option_text = _get_correct_option_text(question)
        if not option_text:
            return True  # extraction failed — give benefit of the doubt
        return _text_in_context(option_text, context_chunks)

    if qtype == "short_answer":
        return _text_in_context(question.get("answer", ""), context_chunks)

    return True  # true_false, coding


# ---------------------------------------------------------------------------
# Structure validation
# ---------------------------------------------------------------------------

_NUMERIC_PATTERN = re.compile(r"^[\d\s\.\,\+\-\*\/\(\)]+$")


def _is_valid_structure(question: dict) -> bool:
    """
    Rule-based structural and type-specific checks.

    Rejects when:
    - Required fields are missing or empty.
    - MCQ has fewer than 4 options.
    - True/False answer is not the exact string "True" or "False".
    - Coding question has no code_snippet, or MCQ-style coding has < 4 options.
    - Short-answer expected answer is a bare number, single character, or
      a purely symbolic / mathematical string  (e.g. "42", "A", "3.14").
    - Question text is fewer than 3 words.
    """
    required = ["type", "question", "answer", "explanation", "source"]
    for field in required:
        if field not in question or not question[field]:
            return False

    qtype = question["type"]
    answer = str(question["answer"]).strip()

    if qtype == "mcq":
        if not question.get("options") or len(question["options"]) < 4:
            return False

    elif qtype == "true_false":
        if answer not in ("True", "False"):
            return False

    elif qtype == "short_answer":
        # Reject purely numeric / symbolic answers (e.g. "42", "3.14", "+∞")
        if _NUMERIC_PATTERN.fullmatch(answer):
            return False
        # Reject single-character answers ("A", "x", "0")
        if len(answer) <= 1:
            return False

    elif qtype == "coding":
        if not question.get("code_snippet"):
            return False
        # MCQ-style coding must have 4 options; short-answer style has none
        if question.get("options") and len(question["options"]) < 4:
            return False

    else:
        return False  # unknown type

    if len(question["question"].split()) < 3:
        return False

    return True


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------

def _is_duplicate(question: dict, existing: list[dict]) -> bool:
    """
    Return True if the question text is ≥ 75 % similar (SequenceMatcher) to
    any already-accepted question.
    """
    q_norm = _normalize(question["question"])
    for eq in existing:
        ratio = SequenceMatcher(None, q_norm, _normalize(eq["question"])).ratio()
        if ratio > 0.75:
            return True
    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate_questions(
    questions: list[dict],
    context_chunks: list[dict],
) -> tuple[list[dict], list[dict]]:
    """
    Two-phase validation pipeline.

    Phase 1 — Rule-based (fast, no LLM):
        • Structure / field presence
        • Type-specific constraints (MCQ options, T/F string, coding snippet,
          short-answer non-numeric answer)
        • Duplicate detection (SequenceMatcher ≥ 0.75)
        • Answer grounding via word-overlap against context chunks

    Phase 2 — Batched LLM semantic check (single Gemini call on survivors):
        • MCQ   : distractor plausibility and common-misconception basis
        • T/F   : statement clarity and unambiguity
        • SA    : question genuinely requires a descriptive answer (not numeric)
        Coding questions are skipped in this phase (structural checks suffice).
        If the LLM call fails for any reason, all Phase-1 survivors are passed.

    Returns
    -------
    (valid, rejected)
        valid    — questions that passed both phases
        rejected — questions that failed either phase, each with 'reject_reason'
    """
    # ── Phase 1: Rule-based ───────────────────────────────────────────────
    rule_valid: list[dict] = []
    rejected: list[dict] = []

    for q in questions:
        if not _is_valid_structure(q):
            rejected.append({**q, "reject_reason": "invalid_structure"})
        elif _is_duplicate(q, rule_valid):
            rejected.append({**q, "reject_reason": "duplicate"})
        elif not _answer_grounded(q, context_chunks):
            rejected.append({**q, "reject_reason": "answer_not_grounded"})
        else:
            rule_valid.append(q)

    if not rule_valid:
        return [], rejected

    # ── Phase 2: Batched LLM semantic check ──────────────────────────────
    # Lazy import keeps Gemini credentials out of module-load time and lets
    # the fallback (empty dict → pass all through) work cleanly on any error.
    try:
        from agents.validator_agent import llm_validate_batch
        llm_results = llm_validate_batch(rule_valid)
    except Exception:
        llm_results = {}

    final_valid: list[dict] = []
    for i, q in enumerate(rule_valid):
        verdict = llm_results.get(i)
        if verdict is not None:
            passed, reason = verdict
            if not passed:
                rejected.append({**q, "reject_reason": f"quality: {reason}"})
                continue
        final_valid.append(q)

    return final_valid, rejected

