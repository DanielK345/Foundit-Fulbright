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
- {coding} coding questions (each must include a real code snippet from the topic)

Difficulty: {difficulty}
{focus_line}

GUIDELINES:
- Test understanding and application, not rote memorization
- MCQ distractors must be plausible — avoid obviously wrong answers
- True/False statements must be unambiguous
- Short answer questions should have a concise, clear correct answer
- Coding questions MUST include a code_snippet field with actual runnable code relevant to the material
- Coding questions should ask about output, behavior, bugs, or what a function returns
- Coding questions can be MCQ-style (with options A/B/C/D) OR short-answer style (options: null)
- Cover a range of topics from across the content
- Do not generate questions if the content is insufficient — skip that type

OUTPUT (strict JSON only, no extra text):
{{
  "questions": [
    {{
      "type": "mcq",
      "question": "...",
      "code_snippet": null,
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "answer": "A",
      "explanation": "Brief explanation of why this is correct.",
      "source": "slide_3"
    }},
    {{
      "type": "true_false",
      "question": "...",
      "code_snippet": null,
      "options": ["True", "False"],
      "answer": "True",
      "explanation": "Brief explanation.",
      "source": "page_2"
    }},
    {{
      "type": "short_answer",
      "question": "...",
      "code_snippet": null,
      "options": null,
      "answer": "Expected answer (1-2 sentences).",
      "explanation": "Brief explanation.",
      "source": "page_1"
    }},
    {{
      "type": "coding",
      "question": "What is the output of the following code?",
      "code_snippet": "int x = 5;\\nx++;\\nprintf(\"%d\\\\n\", x);",
      "options": ["A) 5", "B) 6", "C) 4", "D) Compile error"],
      "answer": "B",
      "explanation": "x++ increments x from 5 to 6 before printf runs.",
      "source": "slide_2"
    }},
    {{
      "type": "coding",
      "question": "What does this function return when called with n=4?",
      "code_snippet": "int f(int n) {{\\n  if (n <= 1) return n;\\n  return f(n-1) + f(n-2);\\n}}",
      "options": null,
      "answer": "3",
      "explanation": "This is a Fibonacci function. f(4) = f(3)+f(2) = 2+1 = 3.",
      "source": "page_1"
    }}
  ]
}}
"""


IDEAS_PROMPT = """You are summarizing educational slides or notes so a student can review the core material before an exam.

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



def extract_main_ideas(chunks: list[dict]) -> str:
    """Use Gemini to extract and summarize the main ideas from document chunks."""
    context = build_context_block(chunks)
    prompt = IDEAS_PROMPT.format(context=context)

    model = genai.GenerativeModel(
        "gemini-2.0-flash",
        generation_config=genai.GenerationConfig(temperature=0.3),
    )
    response = model.generate_content(prompt)
    return response.text.strip()


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
    coding: int = 0,
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
        coding=coding,
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
