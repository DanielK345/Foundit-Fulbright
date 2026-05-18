"""
Prompts for the exam grader (services/grader.py).

Exported constants:
  - LLM_GRADING_PROMPT : fallback LLM grading prompt used when cosine-similarity
    is inconclusive (uses {question}, {reference}, {student})
"""

# ---------------------------------------------------------------------------
# Stage 2 LLM grading prompt (similarity fallback)
# ---------------------------------------------------------------------------

LLM_GRADING_PROMPT = """\
You are a strict exam grader.

QUESTION:
{question}

REFERENCE ANSWER:
{reference}

STUDENT ANSWER:
{student}

GRADING RULES:
- Grade based ONLY on correctness relative to reference
- Accept paraphrasing if meaning is equivalent
- Do NOT give credit for partially correct answers unless specified
- Be strict and objective

OUTPUT FORMAT:
{{
  "score": 0 or 1,
  "reason": "short explanation"
}}\
"""
