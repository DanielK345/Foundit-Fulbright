"""
Content Summarizer Agent

Summarizes uploaded educational content into key concepts that serve as the
main context displayed in the review step and fed to the exam generator.
"""

import os
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

SUMMARIZER_PROMPT = """You are a content summarization agent specializing in educational material. \
Your goal is to extract the core concepts from slides and notes so a student can \
review the material before an exam and so a question generator can produce \
high-quality, targeted questions.

CONTENT:
{context}

---

TASK: Extract the key main ideas, core concepts, and important topics from this material.

GUIDELINES:
- Use bullet points or short paragraphs — make it scannable
- Include important definitions, processes, formulas, or frameworks
- Group related ideas together if it helps clarity
- Aim for a thorough but concise overview (300–600 words)
- Do NOT include any intro line like "Here are the main ideas" — output the content directly

Output only the summary."""


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
