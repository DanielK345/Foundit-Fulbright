import os
import json
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

PROMPT_TEMPLATE = """You are an expert quiz creator with years of experience in educational assessment and instructional design.

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

Follow these principles when generating questions:
1. Progressive difficulty: Start with foundational concepts and gradually increase complexity
2. Questions should test understanding of key concepts, not trivial details or filler questions like "Which of these is covered in the context?" 
3. Cognitive levels: Include a mix of recall, understanding, application, and analysis questions
4. Clear language: Use precise, unambiguous wording that focuses on key concepts
5. Plausible options: For multiple choice, all distractors should be realistic and based on common misconceptions
6. Learning value: Each question should reinforce important concepts from the content

GUIDELINES FOR MCQ:
- Generate exactly 4 options (A, B, C, D)
- All distractors must be plausible and based on common misconceptions — avoid obviously wrong answers
- Distribute the correct answer randomly among A, B, C, D
- Ensure all options are of similar length and grammatically consistent
- The 'answer' field MUST be the letter of the correct option: "A", "B", "C", or "D"

GUIDELINES FOR TRUE/FALSE:
- The 'answer' field MUST be the string "True" or "False" — NEVER a number or index
- VALID: answer: "True" OR answer: "False"
- INVALID: answer: "0", answer: "1", answer: 0
- Set options: ["True", "False"]
- Avoid absolute statements and focus on testing understanding
- The answer must be factually accurate based on the content

GUIDELINES FOR SHORT ANSWER:
- The 'answer' field MUST be a concise string containing the expected answer — NEVER a number
- VALID: answer: "photosynthesis", answer: "Albert Einstein"
- INVALID: answer: "0", answer: "1"
- Set options: null
- The answer should be concise but complete (1-3 words or a short phrase)
- Focus on key terms, concepts, or specific values that demonstrate understanding

GUIDELINES FOR CODING:
- Each coding question MUST include a code_snippet field with actual runnable code relevant to the material
- Coding questions can be MCQ-style (with options A/B/C/D) OR short-answer style (options: null)
- Ask about output, behavior, bugs, or what a function returns
- If output is non-deterministic or depends on runtime conditions, prefer MCQ-style with options describing possible behaviors

CRITICAL: Ensure correct data types for the 'answer' field:
- MCQ: STRING letter ("A", "B", "C", or "D")
- True/False: STRING ("True" or "False") — never a number
- Short-answer: STRING of the expected answer text — never a number
- Coding MCQ-style: STRING letter ("A", "B", "C", or "D")
- Coding short-answer style: STRING of the expected answer text

ADDITIONAL REQUIREMENTS:
- Cover a range of topics from across the content
- Do not generate questions if the content is insufficient — skip that type
- Include the source (slide number or page number) where the answer can be found in the 'source' field; if the answer comes from "Page 5:" in the text, set source: "page_5"
- You must speak STRICTLY in the same language as the content provided; if there are different languages in the content, prioritize the language that appears most
{feedback_section}
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
      "answer": "Expected answer (1-3 words or short phrase).",
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


IDEAS_PROMPT = None  # Summarization is handled by agents.content_summarizer


def extract_main_ideas(chunks: list[dict]) -> str:
    """Delegate to the content summarizer agent."""
    from agents.content_summarizer import extract_main_ideas as _summarize
    return _summarize(chunks)


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
    past_feedback: list[str] = None,
    temperature: float = 0.7,
) -> list[dict]:
    """Generate exam questions using Gemini with full document context."""
    context = build_context_block(chunks)
    focus_line = f"Focus area: {focus}" if focus else ""

    if past_feedback:
        feedback_lines = "\n".join(f"- {fb}" for fb in past_feedback[-5:])
        feedback_section = f"\nADDITIONAL REQUIREMENTS (apply these improvements):\n{feedback_lines}\n"
    else:
        feedback_section = ""

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
