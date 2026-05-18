"""
Prompts for the exam question generator (services/generator.py).

Exported constants:
  - GENERATOR_PROMPT_TEMPLATE : full generation prompt (uses {context}, {mcq},
    {true_false}, {short_answer}, {coding}, {difficulty}, {focus_line},
    {feedback_section})
"""

# ---------------------------------------------------------------------------
# Main generation prompt
# ---------------------------------------------------------------------------

GENERATOR_PROMPT_TEMPLATE = """\
You are an expert quiz creator with years of experience in educational assessment and instructional design.

CONTENT:
{context}

---

TASK: Generate the following questions grounded in the content above. Do not introduce facts,
formulas, or concepts that are absent from every provided source.
- {mcq} multiple choice questions (MCQ)
- {true_false} true/false questions
- {short_answer} short answer questions
- {coding} coding questions (each must include a real code snippet from the topic)

Difficulty: {difficulty}
{focus_line}

SOURCE-AWARE SYNTHESIS STRATEGY:
The content above may come from multiple source types — LECTURE SLIDES, LECTURE NOTES,
HOMEWORK, and READING material. Apply the following rules based on source type:

  LECTURE SLIDES / NOTES:
    - Primary source. Most questions should test concepts, definitions, and applications
      found here.

  HOMEWORK sections (tagged [Type: HOMEWORK]):
    - Do NOT copy or closely paraphrase any homework question verbatim.
    - Use homework problems as inspiration only: change numerical values, reframe the
      scenario, alter the difficulty level, or require the student to apply the same
      concept from a different angle or in a new context.
    - This ensures students cannot pass by memorizing model solutions.

  READING / REFERENCE MATERIAL (tagged [Type: READING]):
    - Concepts and terminology from readings may appear in questions even if not explicitly
      covered in the lecture slides.
    - Cross-source synthesis is encouraged: generate questions that connect a concept
      introduced in a reading with a related concept from the lecture slides.

  CROSS-SOURCE QUESTIONS:
    - When multiple source types are present, at least some questions should require
      knowledge from more than one source. For such questions, list all relevant sources
      in the 'source' field separated by commas, e.g., "slide_5, hw2_page_3".

Follow these general principles when generating questions:
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
      "code_snippet": "int x = 5;\\nx++;\\nprintf(\\"%d\\\\n\\", x);",
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
