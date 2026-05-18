"""
Content Summarizer Agent

Summarizes uploaded educational content into key concepts that serve as the
main context displayed in the review step and fed to the exam generator.
"""

import os
import google.generativeai as genai
from prompts.summarizer_prompts import SUMMARIZER_PROMPT

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

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

    model = genai.GenerativeModel(
        "gemini-2.0-flash",
        generation_config=genai.GenerationConfig(temperature=0.3),
    )
    response = model.generate_content(prompt)
    return response.text.strip()
