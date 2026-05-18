import os
import json
from prompts.generator_prompts import GENERATOR_PROMPT_TEMPLATE
from services.llm_provider import generate

# Prompt moved to prompts/generator_prompts.py
PROMPT_TEMPLATE = GENERATOR_PROMPT_TEMPLATE  # kept as alias for compatibility

IDEAS_PROMPT = None  # Summarization is handled by agents.content_summarizer


def extract_main_ideas(chunks: list[dict]) -> str:
    """Delegate to the content summarizer agent."""
    from agents.content_summarizer import extract_main_ideas as _summarize
    return _summarize(chunks)


_HW_KEYWORDS = ("hw", "homework", "assignment", "problem_set", "pset", "exercise")
_READING_KEYWORDS = ("reading", "read", "chapter", "textbook", "reference", "material")


def _classify_source_type(chunk: dict) -> str:
    """Heuristically classify a chunk's source as LECTURE SLIDES, HOMEWORK, or READING."""
    filename = (chunk.get("filename") or "").lower()
    if filename.endswith(".pptx"):
        return "LECTURE SLIDES"
    if any(kw in filename for kw in _HW_KEYWORDS):
        return "HOMEWORK"
    if any(kw in filename for kw in _READING_KEYWORDS):
        return "READING"
    return "LECTURE NOTES"


def build_context_block(chunks: list[dict]) -> str:
    """Build a context string from retrieved chunks, annotated by source type."""
    parts = []
    for chunk in chunks:
        source = chunk.get("source_label", chunk["source"])
        source_type = _classify_source_type(chunk)
        parts.append(f"[Source: {source}] [Type: {source_type}]\n{chunk['content']}")
    return "\n\n".join(parts)


def generate_questions(
    chunks: list[dict],
    mcq: int,
    true_false: int,
    short_answer: int,
    difficulty: str,
    coding: int = 0,
    focus: str = None,
    past_feedback: list[str] = None,
    covered_concept_keys: list[str] = None,
    validation_feedback: list[str] = None,
    temperature: float = 0.7,
) -> list[dict]:
    """Generate exam questions using Gemini with full document context."""
    context = build_context_block(chunks)
    focus_line = f"Focus area: {focus}" if focus else ""

    # Build each section independently, then assemble in priority order:
    #   1. ADDITIONAL REQUIREMENTS  — user's permanent intent, always topmost
    #   2. CORRECTIONS REQUIRED     — retry-specific validator errors
    #   3. CONCEPTS ALREADY COVERED — technical dedup constraint (lowest priority)
    # LLMs weight early tokens heavily, so the ordering determines what gets
    # honoured when context is long.

    req_block = ""
    if past_feedback:
        feedback_lines = "\n".join(f"- {fb}" for fb in past_feedback[-5:])
        req_block = (
            f"\nADDITIONAL REQUIREMENTS (apply throughout ALL generated questions):\n"
            f"{feedback_lines}\n"
        )

    correction_block = ""
    if validation_feedback:
        correction_lines = "\n".join(f"  \u26a0 {h}" for h in validation_feedback)
        correction_block = (
            f"\nCORRECTIONS REQUIRED (the following question types were rejected "
            f"by the validator in the previous attempt — do NOT repeat these errors):\n"
            f"{correction_lines}\n"
        )

    covered_block = ""
    if covered_concept_keys:
        covered_lines = "\n".join(f"  - {k}" for k in covered_concept_keys)
        covered_block = (
            f"\nCONCEPTS ALREADY COVERED — do NOT generate questions on these "
            f"subtopics (they will be rejected as duplicates):\n{covered_lines}\n"
        )

    feedback_section = req_block + correction_block + covered_block



    prompt = PROMPT_TEMPLATE.format(
        context=context,
        mcq=mcq,
        true_false=true_false,
        short_answer=short_answer,
        coding=coding,
        difficulty=difficulty,
        focus_line=focus_line,
        feedback_section=feedback_section,
    )

    text = generate(prompt, temperature=temperature, use_json=True)

    # Parse JSON response
    parsed = json.loads(text)
    questions = parsed.get("questions", [])

    return questions
