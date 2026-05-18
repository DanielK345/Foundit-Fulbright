"""
Content Summarizer Agent

Summarizes uploaded educational content into key concepts that serve as the
main context displayed in the review step and fed to the exam generator.
"""

from prompts.summarizer_prompts import SUMMARIZER_PROMPT
from services.llm_provider import generate

# Prompt moved to prompts/summarizer_prompts.py


def _build_context_block(chunks: list[dict]) -> str:
    parts = []
    for chunk in chunks:
        source = chunk.get("source_label", chunk.get("source", ""))
        parts.append(f"[Source: {source}]\n{chunk['content']}")
    return "\n\n".join(parts)


def extract_main_ideas(chunks: list[dict]) -> str:
    """Summarize educational content chunks into key concepts for review and exam generation."""
    context = _build_context_block(chunks)
    prompt = SUMMARIZER_PROMPT.format(context=context)

    return generate(prompt, temperature=0.3)
