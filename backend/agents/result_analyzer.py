"""
Exam Result Analysis Agent

Analyzes graded exam results to identify weak areas and produce targeted
improvement recommendations. The output is stored per-document and
automatically injected as Additional Requirements in the next exam generation.
"""

import os
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

ANALYZER_PROMPT = """You are an expert educational analyst. Review these exam results and \
produce specific, actionable recommendations to improve the next exam generated for this student.

RESULTS:
{results_summary}

---

TASK: Analyze the results and recommend adjustments for the next exam.

GUIDELINES:
- Identify topics/concepts where the student struggled (based on wrong answers and sources)
- Recommend specific question type changes (e.g. "Add 3 more coding questions on recursion", \
"Replace true/false on Chapter 2 with MCQ")
- If the student aced an area, suggest raising difficulty or adding trickier questions there
- Keep recommendations specific and actionable — 4 to 7 bullet points
- Do NOT include any preamble or intro line — output bullet points directly

Output only the bullet-point recommendations."""


def analyze_results(details: list[dict]) -> str:
    """
    Analyze graded exam result details and return targeted improvement recommendations.

    Each item in `details` should have at minimum:
      question, type, user_answer, correct_answer, is_correct, source
    """
    correct_count = sum(1 for d in details if d.get("is_correct") is True)
    total = len(details)

    lines = [f"Overall score: {correct_count}/{total}\n"]
    for d in details:
        if d.get("is_correct") is True:
            status = "CORRECT"
        elif d.get("is_correct") is False:
            status = "INCORRECT"
        else:
            status = "UNGRADED"

        lines.append(
            f"[{status}] [{d.get('type', '').upper()}] {d.get('question', '')}\n"
            f"  Correct: {d.get('correct_answer', '')} | "
            f"Student: {d.get('user_answer', '(none)')}\n"
            f"  Source: {d.get('source', '')}"
        )

    results_summary = "\n\n".join(lines)
    prompt = ANALYZER_PROMPT.format(results_summary=results_summary)

    model = genai.GenerativeModel(
        "gemini-2.0-flash",
        generation_config=genai.GenerationConfig(temperature=0.3),
    )
    response = model.generate_content(prompt)
    return response.text.strip()
