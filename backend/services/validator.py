import re
from difflib import SequenceMatcher

# ---------------------------------------------------------------------------
# Common English stop words — filtered out before any similarity comparison
# so that shared filler words don't inflate Jaccard scores.
# ---------------------------------------------------------------------------

_STOP_WORDS: frozenset[str] = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "ought",
    "of", "in", "on", "at", "to", "for", "with", "by", "from", "up",
    "about", "into", "through", "before", "after", "above", "below",
    "between", "that", "this", "these", "those", "it", "its", "what",
    "which", "who", "when", "where", "why", "how", "all", "both", "each",
    "every", "not", "no", "nor", "so", "yet", "or", "and", "but", "if",
    "than", "because", "as", "until", "while", "although", "however",
    "therefore", "following", "such", "used", "use", "using", "also",
    "following", "given", "provides", "provide", "called", "known",
    "defined", "refers", "means", "mean", "way", "type", "types",
    "one", "two", "three", "four", "five", "following", "example",
    "true", "false", "correct", "answer", "question", "describe",
    "explain", "following", "statement", "term", "concept",
})


# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    """Lowercase and collapse whitespace."""
    return " ".join(text.lower().split())


def _words(text: str) -> set[str]:
    """Return the set of lowercase alphanumeric tokens in a string."""
    return set(re.findall(r"[a-zA-Z0-9]+", text.lower()))


def _content_words(text: str) -> set[str]:
    """
    Lowercase alphanumeric tokens with stop words removed.
    These are the semantically meaningful tokens used for concept-level
    similarity comparisons — domain-agnostic by design.
    """
    return _words(text) - _STOP_WORDS


def _code_snippet_grounded(code: str, context_chunks: list[dict]) -> bool:
    """
    Return True if the code snippet shares enough tokens with the source
    material to indicate it was adapted from the content rather than invented.

    Code is syntactically denser than prose, so a 20% token-overlap threshold
    is used (vs 50% for prose answers).  Snippets with ≤ 5 unique tokens are
    too short to judge and are passed.

    This check is domain-agnostic: a snippet from any subject (OS, compilers,
    algorithms, biology pseudocode …) must leave a footprint in the source.
    """
    code_words = _content_words(code)
    if len(code_words) <= 5:
        return True  # too short to assess reliably

    for chunk in context_chunks:
        chunk_words = _content_words(chunk.get("content", ""))
        overlap = len(code_words & chunk_words) / len(code_words)
        if overlap >= 0.20:
            return True

    return False


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
    coding      → check that the code snippet shares tokens with the source
                  material (catches invented snippets unrelated to the content)
    true_false  → always pass (statement is self-contained)
    """
    qtype = question.get("type", "")

    if qtype == "mcq":
        option_text = _get_correct_option_text(question)
        if not option_text:
            return True  # extraction failed — give benefit of the doubt
        return _text_in_context(option_text, context_chunks)

    if qtype == "short_answer":
        return _text_in_context(question.get("answer", ""), context_chunks)

    if qtype == "coding":
        snippet = question.get("code_snippet", "")
        if snippet:
            return _code_snippet_grounded(snippet, context_chunks)
        return True

    return True  # true_false


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
    Two-tier, domain-agnostic duplicate detection.

    Tier 1 — Surface text similarity (SequenceMatcher ≥ 0.75 on question text):
        Fast check that catches nearly-identical or lightly reworded questions.

    Tier 2 — Content-word Jaccard on question + answer + explanation (≥ 0.50):
        Catches questions that test the same underlying concept even when the
        surface phrasing is different.  Stop words are stripped before comparison
        so shared filler ("the", "is", "a") does not inflate the score.

        The explanation field is the strongest signal — the model's own
        explanation of why an answer is correct is a direct description of the
        concept being tested, making it ideal for topic-level deduplication.

        Requires ≥ 6 content words on both sides to avoid false positives on
        very short questions.
    """
    q_text = _normalize(question["question"])
    q_rich = _content_words(
        f"{question.get('question', '')} "
        f"{question.get('answer', '')} "
        f"{question.get('explanation', '')}"
    )

    for eq in existing:
        # Tier 1: surface similarity on question text
        if SequenceMatcher(None, q_text, _normalize(eq["question"])).ratio() > 0.75:
            return True

        # Tier 2: concept-level Jaccard (domain-agnostic)
        if len(q_rich) >= 6:
            eq_rich = _content_words(
                f"{eq.get('question', '')} "
                f"{eq.get('answer', '')} "
                f"{eq.get('explanation', '')}"
            )
            if len(eq_rich) >= 6:
                union = q_rich | eq_rich
                jaccard = len(q_rich & eq_rich) / len(union)
                if jaccard >= 0.50:
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

