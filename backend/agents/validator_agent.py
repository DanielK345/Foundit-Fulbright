"""
Validator Agent — LLM-based semantic quality checks.

Responsibility: judge whether a question that has already passed all rule-based
checks is semantically good enough to appear in a student exam.  This is the
part of the validation pipeline that requires subjective, language-level
reasoning and cannot be expressed as deterministic rules.

Only question types that benefit from semantic evaluation are sent to the LLM:
  MCQ         → distractor plausibility and common-misconception basis
  True/False  → statement clarity and unambiguity
  Short Answer → question genuinely requires a descriptive answer (not trivial)

Coding questions are excluded — their quality is structural (correct snippet,
deterministic output) and is fully handled by the rule-based validator.

Public API
----------
llm_validate_batch(questions) -> dict[int, tuple[bool, str]]
    Takes the Phase-1 survivors (rule-valid questions).
    Returns a mapping of  list_index → (passed: bool, reason: str).
    Questions whose type is not evaluated are omitted (implicit pass).
    Returns {} on any LLM / parse failure so the caller degrades gracefully.
"""

import json
from prompts.validator_prompts import VALIDATOR_SYSTEM_PROMPT, VALIDATOR_BATCH_PROMPT
from services.llm_provider import generate

# Question types that require LLM semantic evaluation
_LLM_CHECK_TYPES = {"mcq", "true_false", "short_answer"}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_questions_block(questions: list[dict], indices: list[int]) -> str:
    """
    Serialise selected questions into a compact numbered block for the prompt.
    The block index (0, 1, 2 …) maps back to the original list position via
    `indices`, so the LLM's verdicts can be aligned to the input list.
    """
    lines: list[str] = []
    for block_idx, orig_idx in enumerate(indices):
        q = questions[orig_idx]
        lines.append(f"[{block_idx}] Type: {q['type'].upper()}")
        lines.append(f"    Question : {q['question']}")
        lines.append(f"    Answer   : {q['answer']}")
        if q["type"] == "mcq" and q.get("options"):
            lines.append(f"    Options  : {'  |  '.join(q['options'])}")
        lines.append("")  # blank separator between questions
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def llm_validate_batch(questions: list[dict]) -> dict[int, tuple[bool, str]]:
    """
    Run a single batched Gemini call to semantically evaluate all eligible
    questions.

    Parameters
    ----------
    questions : list of question dicts that have already passed rule-based
                validation.  Indices are positional within this list.

    Returns
    -------
    dict mapping list index → (passed: bool, reason: str).
    Questions whose type is not in _LLM_CHECK_TYPES are omitted from the
    result; the caller treats omission as an implicit pass.
    Returns {} on any failure so the caller can degrade gracefully rather
    than silently dropping valid questions.
    """
    indices: list[int] = [
        i for i, q in enumerate(questions)
        if q.get("type") in _LLM_CHECK_TYPES
    ]
    if not indices:
        return {}

    prompt = VALIDATOR_BATCH_PROMPT.format(
        questions_block=_build_questions_block(questions, indices)
    )

    try:
        text = generate(
            prompt,
            temperature=0.1,
            use_json=True,
            system_instruction=VALIDATOR_SYSTEM_PROMPT,
        )
        verdicts: list[dict] = json.loads(text).get("verdicts", [])
    except Exception:
        # Degrade gracefully — a transient LLM error should not block an
        # otherwise valid exam from being delivered.
        return {}

    results: dict[int, tuple[bool, str]] = {}
    for verdict in verdicts:
        block_idx = verdict.get("index")
        if block_idx is None or not isinstance(block_idx, int) or block_idx >= len(indices):
            continue
        results[indices[block_idx]] = (
            bool(verdict.get("pass", True)),
            str(verdict.get("reason", "")),
        )
    return results
