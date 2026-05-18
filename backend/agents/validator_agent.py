"""
Validator Agent — semantic quality checks via a single batched LLM call.

Only question types that benefit from semantic evaluation are sent to the LLM:
  MCQ         → distractor plausibility
  True/False  → statement clarity and unambiguity
  Short Answer → question requires descriptive answer (not numeric/symbolic)

Coding questions are intentionally excluded — their quality is structural
(code compiles, output is deterministic) and better handled by rule-based checks.

Public API
----------
llm_validate_batch(questions) -> dict[int, tuple[bool, str]]
    Takes a list of questions that have already passed rule-based validation.
    Returns a mapping of  original_index → (passed, reason).
    On any LLM or parse failure the function returns {} so the caller
    can pass all questions through rather than silently dropping them.
"""

import os
import json
import google.generativeai as genai
from prompts.validator_prompts import VALIDATOR_SYSTEM_PROMPT, VALIDATOR_BATCH_PROMPT

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Question types that require semantic LLM evaluation
_LLM_CHECK_TYPES = {"mcq", "true_false", "short_answer"}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_questions_block(questions: list[dict], indices: list[int]) -> str:
    """
    Serialise the selected questions into a compact numbered block for the prompt.
    The block index (0, 1, 2 …) is what the LLM uses in its verdict; it maps
    back to the original list position via `indices`.
    """
    lines: list[str] = []
    for block_idx, orig_idx in enumerate(indices):
        q = questions[orig_idx]
        qtype = q["type"].upper()
        lines.append(f"[{block_idx}] Type: {qtype}")
        lines.append(f"    Question : {q['question']}")
        lines.append(f"    Answer   : {q['answer']}")
        if q["type"] == "mcq" and q.get("options"):
            opts_str = "  |  ".join(q["options"])
            lines.append(f"    Options  : {opts_str}")
        lines.append("")          # blank separator between questions
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def llm_validate_batch(questions: list[dict]) -> dict[int, tuple[bool, str]]:
    """
    Run a single batched Gemini call to semantically validate all eligible
    questions in the list.

    Parameters
    ----------
    questions : list of question dicts that have already passed rule-based checks.
                Indices are positional within this list.

    Returns
    -------
    dict mapping original list index → (passed: bool, reason: str).
    Questions whose type is not in _LLM_CHECK_TYPES are omitted from the result,
    which the caller treats as an implicit pass.
    Returns {} on any failure so the caller can degrade gracefully.
    """
    # Select only the question types that need semantic checking
    indices: list[int] = [
        i for i, q in enumerate(questions)
        if q.get("type") in _LLM_CHECK_TYPES
    ]

    if not indices:
        return {}

    questions_block = _build_questions_block(questions, indices)
    prompt = VALIDATOR_BATCH_PROMPT.format(questions_block=questions_block)

    model = genai.GenerativeModel(
        "gemini-2.0-flash",
        system_instruction=VALIDATOR_SYSTEM_PROMPT,
        generation_config=genai.GenerationConfig(
            temperature=0.1,
            response_mime_type="application/json",
        ),
    )

    try:
        response = model.generate_content(prompt)
        parsed = json.loads(response.text.strip())
        verdicts: list[dict] = parsed.get("verdicts", [])
    except Exception:
        # Degrade gracefully: treat all questions as passed rather than
        # blocking generation because the validator had a transient error.
        return {}

    # Map block-local index → original question index
    results: dict[int, tuple[bool, str]] = {}
    for verdict in verdicts:
        block_idx = verdict.get("index")
        if block_idx is None or not isinstance(block_idx, int):
            continue
        if block_idx >= len(indices):
            continue
        orig_idx = indices[block_idx]
        results[orig_idx] = (
            bool(verdict.get("pass", True)),
            str(verdict.get("reason", "")),
        )

    return results
