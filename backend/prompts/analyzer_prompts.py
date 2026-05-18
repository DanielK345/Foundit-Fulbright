"""
Prompts for the Result Analyzer Agent (agents/result_analyzer.py).

Exported constants:
  - ANALYZER_PROMPT : prompt template for generating targeted exam improvement
    recommendations from graded results (uses {results_summary})
"""

# ---------------------------------------------------------------------------
# Result analysis prompt
# ---------------------------------------------------------------------------

ANALYZER_PROMPT = """\
You are an expert educational analyst. Review these exam results and \
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

Output only the bullet-point recommendations.\
"""
