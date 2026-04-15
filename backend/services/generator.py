import os
import json
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

PROMPT_TEMPLATE = """You are an expert exam writer. Your goal is to create high-quality exam questions that genuinely test a student's understanding of the material.

CONTENT:
{context}

---

TASK: Generate the following questions based ONLY on the content above:
- {mcq} multiple choice questions (MCQ)
- {true_false} true/false questions
- {short_answer} short answer questions

Difficulty: {difficulty}
{focus_line}

GUIDELINES:
- Test understanding and application, not rote memorization
- MCQ distractors must be plausible — avoid obviously wrong answers
- True/False statements must be unambiguous
- Short answer questions should have a concise, clear correct answer
- Cover a range of topics from across the content
- Do not generate questions if the content is insufficient — skip that type

OUTPUT (strict JSON only, no extra text):
{{
  "questions": [
    {{
      "type": "mcq",
      "question": "...",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "answer": "A",
      "explanation": "Brief explanation of why this is correct.",
      "source": "slide_3"
    }},
    {{
      "type": "true_false",
      "question": "...",
      "options": ["True", "False"],
      "answer": "True",
      "explanation": "Brief explanation.",
      "source": "page_2"
    }},
    {{
      "type": "short_answer",
      "question": "...",
      "options": null,
      "answer": "Expected answer (1-2 sentences).",
      "explanation": "Brief explanation.",
      "source": "page_1"
    }}
  ]
}}
"""


def build_context_block(chunks: list[dict]) -> str:
    """Build a context string from retrieved chunks."""
    parts = []
    for chunk in chunks:
        source = chunk.get("source_label", chunk["source"])
        parts.append(f"[Source: {source}]\n{chunk['content']}")
    return "\n\n".join(parts)


def generate_questions(
    chunks: list[dict],
    mcq: int,
    true_false: int,
    short_answer: int,
    difficulty: str,
    focus: str = None,
    temperature: float = 0.7,
) -> list[dict]:
    """Generate exam questions using Gemini with full document context."""
    context = build_context_block(chunks)
    focus_line = f"Focus area: {focus}" if focus else ""

    prompt = PROMPT_TEMPLATE.format(
        context=context,
        mcq=mcq,
        true_false=true_false,
        short_answer=short_answer,
        difficulty=difficulty,
        focus_line=focus_line,
    )

    model = genai.GenerativeModel(
        "gemini-2.0-flash",
        generation_config=genai.GenerationConfig(
            temperature=temperature,
            response_mime_type="application/json",
        ),
    )

    response = model.generate_content(prompt)
    text = response.text.strip()

    # Parse JSON response
    parsed = json.loads(text)
    questions = parsed.get("questions", [])

    return questions
