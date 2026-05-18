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


# Common English suffixes stripped to approximate word stems.
# Ordered longest-first so "tions" is tried before "s".  Minimum stem
# length of 3 prevents over-stripping short words.
_STEM_SUFFIXES = (
    "tions", "tion", "ings", "ing", "ness", "ments", "ment",
    "ities", "ity", "ers", "er", "ed", "es", "s",
)


def _stem(word: str) -> str:
    """Strip the longest matching common suffix to produce an approximate stem."""
    for sfx in _STEM_SUFFIXES:
        if word.endswith(sfx) and len(word) - len(sfx) >= 3:
            return word[:-len(sfx)]
    return word


def _words(text: str) -> set[str]:
    """Return the set of lowercase alphanumeric tokens in a string."""
    return set(re.findall(r"[a-zA-Z0-9]+", text.lower()))


def _content_words(text: str) -> set[str]:
    """
    Stemmed, stop-word-filtered tokens used for concept-level similarity.
    Stemming ensures morphological variants ("condition"/"conditions",
    "decrement"/"decrements") are treated as the same word.
    """
    return {_stem(w) for w in _words(text) if w not in _STOP_WORDS and len(w) > 1}


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


def _text_in_context(text: str, context_chunks: list[dict], threshold: float = 0.50) -> bool:
    """
    Return True if `text` is sufficiently represented in any context chunk.

    Two complementary checks:
      1. Direct substring match after normalisation.
      2. Word-level overlap: ≥ threshold of the text's tokens appear in the chunk.
         (Default 0.50 tolerates paraphrasing while still catching hallucinations;
         a lower threshold can be passed for last-resort relaxed validation.)
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
        if overlap >= threshold:
            return True

    return False


def _answer_grounded(question: dict, context_chunks: list[dict], relaxed: bool = False) -> bool:
    """
    Dispatch grounding checks by question type.

    MCQ         → check the correct option's full text (not just the letter)
    short_answer → check the expected answer text
    coding      → check that the code snippet shares tokens with the source
                  material (catches invented snippets unrelated to the content)
    true_false  → always pass (statement is self-contained)

    relaxed=True lowers the word-overlap threshold from 50 % to 35 % so that
    lightly paraphrased answers can still pass on the last retry attempt.
    """
    qtype = question.get("type", "")
    threshold = 0.35 if relaxed else 0.50

    if qtype == "mcq":
        option_text = _get_correct_option_text(question)
        if not option_text:
            return True  # extraction failed — give benefit of the doubt
        return _text_in_context(option_text, context_chunks, threshold=threshold)

    if qtype == "short_answer":
        return _text_in_context(question.get("answer", ""), context_chunks, threshold=threshold)

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


def _is_valid_structure(question: dict, relaxed: bool = False) -> bool:
    """
    Rule-based structural and type-specific checks.

    relaxed=True loosens the short_answer minimum word count from 12 to 8
    so that a persistent borderline answer doesn't leave an exam slot empty
    on the final retry attempt.

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
        # Reject answers that are too short to demonstrate understanding.
        # Normal mode: ≥ 12 words (~2 sentences).
        # Relaxed mode (last-resort): ≥ 8 words — prevents a persistently
        # borderline answer from leaving an empty slot in the exam.
        min_words = 8 if relaxed else 12
        if len(answer.split()) < min_words:
            return False
        # Reject trivia-style question stems that invite a one-word answer.
        q_lower = question.get("question", "").lower().strip()
        _TRIVIA_STEMS = (
            "what is the term for",
            "what is the name of",
            "what hardware component",
            "what software component",
            "name the ",
            "which component ",
            "which hardware ",
            "which data structure ",
        )
        if any(q_lower.startswith(stem) for stem in _TRIVIA_STEMS):
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

    # Reject questions that expose source document internals to the student.
    # (e.g. "...from Homework 2, Question 5" or "in the provided code snippet")
    q_lower = question["question"].lower()
    _SOURCE_LEAKS = (
        "homework ",
        "provided code snippet",
        "provided snippet",
        "according to the",
        "based on the context",
        "from the context",
        "in the context",
        "from the lecture",
        "from the reading",
        "from the slides",
        "the above code",
        "above snippet",
    )
    if any(phrase in q_lower for phrase in _SOURCE_LEAKS):
        return False

    return True


def _concept_key_duplicate(key_a: str | None, key_b: str | None) -> bool:
    """
    Return True when two concept_keys share the same broad_topic/subtopic prefix,
    meaning both questions test the same subject area.

    Examples that fire:
        "deadlock/coffman-conditions/mutual-exclusion"
        "deadlock/coffman-conditions/no-preemption"
        → same "deadlock/coffman-conditions" prefix → duplicate

        "synchronization/semaphore/down-p-operation"
        "synchronization/semaphore/up-v-operation"
        → same "synchronization/semaphore" prefix → duplicate

    Examples that do NOT fire:
        "synchronization/semaphore/down-p-operation"
        "synchronization/mutex/lock-acquire"
        → different subtopics → allowed
    """
    if not key_a or not key_b:
        return False
    parts_a = key_a.lower().split("/")
    parts_b = key_b.lower().split("/")
    # Need at least broad + subtopic (2 levels) to compare
    if len(parts_a) < 2 or len(parts_b) < 2:
        return parts_a[0] == parts_b[0]  # same broad topic only
    return parts_a[0] == parts_b[0] and parts_a[1] == parts_b[1]


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------

def _find_duplicate(question: dict, existing: list[dict], strict: bool = True) -> dict | None:
    """
    Four-tier, domain-agnostic duplicate detection.

    Returns the first existing question that conflicts with `question`, or
    ``None`` if no duplicate is found.  The returned entry is used by the
    caller to build surgical feedback for the generator ("your question about X
    duplicates accepted question Y — try a different subtopic/type").

    Tier 0 — Concept-key hierarchy match  [strict mode only]:
        Skipped when strict=False so that the very last retry attempt can fill
        remaining slots when the document's topic space is truly exhausted.
        When enabled, two questions sharing the same broad_topic/subtopic
        prefix are treated as duplicates regardless of wording — this is
        the strongest signal and catches cross-type duplicates (T/F + MCQ).

    Tier 1 — Surface text similarity (SequenceMatcher ≥ 0.65 on question text):
        Fast check that catches nearly-identical or lightly reworded questions.

    Tier 1b — MCQ option overlap (≥ 3 of 4 identical options):
        Two MCQ questions that share at least 3 answer options are almost
        certainly testing the same concept, even when the stems are worded
        differently.

    Tier 2 — Stemmed content-word Jaccard on question + answer + explanation
              + options (≥ 0.40):
        Catches questions that test the same underlying concept even when the
        surface phrasing is different.  Words are stemmed before comparison so
        morphological variants ("condition"/"conditions", "decrement"/"decrements")
        count as identical.  MCQ options are included because they encode the
        concept directly.

        Requires ≥ 6 content words on both sides to avoid false positives on
        very short questions.
    """
    q_key  = question.get("concept_key")
    q_text = _normalize(question["question"])
    q_opts = {o.strip().lower() for o in (question.get("options") or [])}
    q_rich = _content_words(
        f"{question.get('question', '')} "
        f"{question.get('answer', '')} "
        f"{question.get('explanation', '')} "
        f"{' '.join(question.get('options') or [])}"
    )

    for eq in existing:
        # Tier 0: concept_key hierarchy — skipped in relaxed mode
        if strict and _concept_key_duplicate(q_key, eq.get("concept_key")):
            return eq

        # Tier 1: surface similarity on question text
        if SequenceMatcher(None, q_text, _normalize(eq["question"])).ratio() >= 0.65:
            return eq

        # Tier 1b: MCQ option overlap — ≥ 3 identical options = same concept skeleton
        if q_opts and question.get("type") == "mcq" and eq.get("type") == "mcq":
            eq_opts = {o.strip().lower() for o in (eq.get("options") or [])}
            if eq_opts and len(q_opts & eq_opts) >= 3:
                return eq

        # Tier 2: stemmed concept-level Jaccard including options (threshold 0.40)
        if len(q_rich) >= 6:
            eq_rich = _content_words(
                f"{eq.get('question', '')} "
                f"{eq.get('answer', '')} "
                f"{eq.get('explanation', '')} "
                f"{' '.join(eq.get('options') or [])}"
            )
            if len(eq_rich) >= 6:
                union = q_rich | eq_rich
                jaccard = len(q_rich & eq_rich) / len(union)
                if jaccard >= 0.40:
                    return eq

    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate_questions(
    questions: list[dict],
    context_chunks: list[dict],
    existing_questions: list[dict] | None = None,
    strict_dedup: bool = True,
    relaxed_rules: bool = False,
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
        Phase 2 is also skipped when relaxed_rules=True (last-resort attempt).

    relaxed_rules=True (last attempt only):
        • Reduces short_answer minimum word count from 12 to 8
        • Reduces answer-grounding overlap threshold from 50 % to 35 %
        • Skips Phase 2 LLM check
        This prevents a persistently borderline question from leaving an empty
        slot in the exam when the document's content is genuinely thin.

    Returns
    -------
    (valid, rejected)
        valid    — questions that passed both phases
        rejected — questions that failed either phase, each with 'reject_reason'
    """
    # ── Phase 1: Rule-based ───────────────────────────────────────────────
    rule_valid: list[dict] = []
    rejected: list[dict] = []
    # Seed the seen-questions pool with any questions already accepted from
    # previous retry attempts.  This prevents the duplicate check from
    # missing cross-retry collisions AND stops retry batches from wasting
    # slots on questions that would later collide with already-accepted ones.
    already_accepted: list[dict] = list(existing_questions or [])

    for q in questions:
        # Coding questions with a code_snippet are "pre-grounded": the snippet
        # IS the source-material reference, so the grounding check is skipped.
        # Tier-0 concept-key dedup is also skipped so a coding question on the
        # same subtopic as an already-accepted conceptual question is allowed
        # through — a code exercise and a theory MCQ on the same topic serve
        # different pedagogical purposes.  Text-similarity dedup (Tiers 1/2)
        # still runs to prevent exact-duplicate coding questions.
        is_coding_with_snippet = q.get("type") == "coding" and bool(q.get("code_snippet"))

        if not _is_valid_structure(q, relaxed=relaxed_rules):
            rejected.append({**q, "reject_reason": "invalid_structure"})
        elif (conflict := _find_duplicate(
            q, already_accepted + rule_valid,
            strict=strict_dedup and not is_coding_with_snippet,
        )) is not None:
            # Store the conflicting question so the generator can receive
            # surgical feedback: exactly which accepted question each rejected
            # question duplicates, and which concept_key prefix to avoid.
            rejected.append({
                **q,
                "reject_reason": "duplicate",
                "duplicate_of": conflict.get("question", ""),
                "duplicate_of_key": conflict.get("concept_key", ""),
            })
        elif not is_coding_with_snippet and not _answer_grounded(q, context_chunks, relaxed=relaxed_rules):
            rejected.append({**q, "reject_reason": "answer_not_grounded"})
        else:
            rule_valid.append(q)

    if not rule_valid:
        return [], rejected

    # ── Phase 2: LLM semantic check (validator agent) ────────────────────
    # Imported here to keep rule-based logic free of LLM dependencies and to
    # degrade gracefully when the agent call fails.
    # Skipped in relaxed_rules mode (last-resort attempt) — it's expensive
    # and occasionally over-strict on borderline content from thin documents.
    if relaxed_rules:
        llm_results: dict = {}
    else:
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

