from services.ai_provider import generate_json, generate_text


def _clean_text(value: object, fallback: str = "") -> str:
    text = " ".join(str(value or fallback).replace("\n", " ").split())
    return text.strip()


def _shorten(text: str, limit: int = 180) -> str:
    text = _clean_text(text)
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(".,;:") + "..."


def _evidence_text(item: dict) -> str:
    evidence = item.get("evidence", "")
    if isinstance(evidence, list):
        evidence = " ".join(str(part) for part in evidence if part)
    return _shorten(evidence, 260) or "The uploaded course material provides the supporting context."


def _source_text(item: dict) -> str:
    labels = item.get("source_labels") or item.get("source_ids") or []
    if isinstance(labels, list):
        return ", ".join(str(label) for label in labels if label) or "course material"
    return str(labels or "course material")


def _fallback_question_from_item(item: dict) -> dict:
    """Last-resort question writer for when an LLM returns malformed JSON.

    This keeps the user flow alive while still grounding every question in the
    blueprint item. It is intentionally conservative and avoids the old generic
    RAG phrases that made the demo feel broken.
    """
    qtype = item.get("question_type") or item.get("type") or "short_answer"
    concept = _clean_text(item.get("concept"), "the selected concept")
    objective = _clean_text(item.get("learning_objective"), f"explain {concept}")
    evidence = _evidence_text(item)
    source = _source_text(item)
    bloom = item.get("bloom_level", "understand")
    difficulty = item.get("difficulty", "medium")
    base = {
        "plan_id": item.get("plan_id"),
        "type": qtype,
        "source": source,
        "evidence": evidence,
        "unit_id": item.get("unit_id", ""),
        "unit_title": item.get("unit_title", ""),
        "concept_id": item.get("concept_id", ""),
        "concept": concept,
        "learning_objective": objective,
        "document_type": item.get("document_type", "unknown"),
        "bloom_level": bloom,
        "difficulty": difficulty,
    }

    if qtype == "mcq":
        return {
            **base,
            "question": f"Given the course material about {concept}, which interpretation best supports this learning objective: {objective}?",
            "options": [
                f"A) Use the definitions, examples, and stated conditions for {concept} when reasoning about a problem.",
                f"B) Memorize the term {concept} without considering its examples or assumptions.",
                f"C) Apply {concept} the same way in every situation, even when the input conditions change.",
                f"D) Ignore the relationship between {concept} and the problem setting described in the material.",
            ],
            "answer": "A",
            "explanation": f"The objective asks students to reason about {concept}; the cited material gives the definitions, examples, or conditions needed for that reasoning.",
        }

    if qtype == "true_false":
        return {
            **base,
            "question": f"True or False: A student reviewing {concept} should use the source definitions, examples, and conditions when working toward this objective: {objective}.",
            "options": ["True", "False"],
            "answer": "True",
            "explanation": f"The material supports reviewing {concept} through the evidence connected to the stated learning objective.",
        }

    return {
        **base,
        "type": "short_answer",
        "question": f"How does the evidence about {concept} help answer this learning objective: {objective}?",
        "options": None,
        "answer": f"A strong answer explains {concept} using the relevant definition, example, or condition from the material, then links it to the learning objective.",
        "explanation": f"The answer should be grounded in the source material for {concept}.",
    }


def fallback_questions_from_blueprint(blueprint_items: list[dict]) -> dict:
    return {
        "questions": [_fallback_question_from_item(item) for item in blueprint_items],
        "skipped": [],
    }


PROMPT_TEMPLATE = """You are an expert exam writer creating practice questions for students.

RETRIEVED COURSE EVIDENCE:
{context}

TASK:
Generate questions based only on the retrieved evidence:
- {mcq} multiple choice questions
- {true_false} true/false questions
- {short_answer} short answer questions

Difficulty: {difficulty}
Bloom levels to target: {bloom_levels}
{focus_line}

QUALITY RULES:
- Test understanding and application, not rote memorization.
- Every answer must be supported by the evidence.
- MCQ distractors must be plausible and not obviously silly.
- True/false questions must be unambiguous.
- Short-answer expected answers should be concise.
- Cover different concepts when enough evidence exists.
- Skip a question if the evidence is insufficient.
- Keep all string values plain: do not use nested quotation marks inside JSON strings.
- Escape any unavoidable quotation marks inside strings.

OUTPUT strict JSON only:
{{
  "questions": [
    {{
      "type": "mcq",
      "question": "...",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "answer": "A",
      "explanation": "...",
      "source": "source label from evidence",
      "evidence": "short supporting evidence",
      "concept_id": "concept_1",
      "concept": "concept name",
      "document_type": "slides|homework|reading|notes|previous_test|unknown",
      "bloom_level": "remember|understand|apply|analyze",
      "difficulty": "easy|medium|hard"
    }}
  ]
}}
"""


BLUEPRINT_PROMPT = """You are an expert university teaching assistant writing high-quality practice questions.

Generate questions from the exam blueprint only. Each blueprint item contains a concept, learning objective, evidence, and expected question type.
Write like a real professor preparing students for a test. Create domain-specific questions, not generic RAG-support questions.

BLUEPRINT:
{blueprint}

QUALITY RULES:
- Do not write generic prompts such as "Which statement is best supported".
- Do not use answer options such as "unrelated to the course", "opposite without conditions", or "administrative deadlines".
- Do not write questions like "How should a student use X to meet this objective".
- Do not write answer choices like "Connect X to the mechanism described by evidence".
- Do not ask about course roadmaps, grading, assignments, seminars, conferences, careers, job market, or logistics.
- Do not copy evidence as the correct option unless the learning objective is explicitly a definition.
- MCQ distractors must be plausible misconceptions from the same topic.
- MCQ options must be concrete technical statements, formulas, interpretations, or examples.
- Questions must test understanding, application, or analysis according to the requested Bloom level.
- If an item is too weak, skip it and include a rejection reason in "skipped".
- Use only the provided evidence. Do not invent facts.
- Keep JSON valid and plain. Escape quotation marks inside strings.

OUTPUT strict JSON only:
{{
  "questions": [
    {{
      "plan_id": "plan_1",
      "type": "mcq|true_false|short_answer",
      "question": "...",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "answer": "A",
      "explanation": "...",
      "source": "source label from blueprint",
      "evidence": "short supporting evidence",
      "unit_id": "...",
      "unit_title": "...",
      "concept_id": "...",
      "concept": "...",
      "learning_objective": "...",
      "document_type": "slides|homework|reading|notes|previous_test|unknown",
      "bloom_level": "remember|understand|apply|analyze",
      "difficulty": "easy|medium|hard"
    }}
  ],
  "skipped": [
    {{"plan_id": "plan_2", "reason": "insufficient evidence"}}
  ]
}}
"""


IDEAS_PROMPT = """You are summarizing educational materials for student exam review.

CONTENT:
{context}

Extract the key ideas, definitions, processes, formulas, and examples. Group related ideas and keep it concise.
Output only the summary.
"""


def build_context_block(chunks: list[dict]) -> str:
    parts = []
    for chunk in chunks:
        source = chunk.get("source_label", chunk.get("source", "unknown"))
        concept = chunk.get("concept", "")
        doc_type = chunk.get("document_type", "unknown")
        evidence = chunk.get("evidence", "")
        header = f"[Source: {source} | Concept: {concept} | Type: {doc_type}]"
        parts.append(f"{header}\n{chunk.get('content', '')}\nEvidence: {evidence}")
    return "\n\n".join(parts)


def extract_main_ideas(chunks: list[dict]) -> str:
    context = build_context_block(chunks)
    return generate_text(IDEAS_PROMPT.format(context=context), temperature=0.3)


def generate_questions(
    chunks: list[dict],
    mcq: int,
    true_false: int,
    short_answer: int,
    difficulty: str,
    focus: str = None,
    bloom_levels: list[str] = None,
    temperature: float = 0.7,
) -> list[dict]:
    context = build_context_block(chunks)
    focus_line = f"Focus area: {focus}" if focus else ""
    bloom_line = ", ".join(bloom_levels or ["understand", "apply"])
    prompt = PROMPT_TEMPLATE.format(
        context=context,
        mcq=mcq,
        true_false=true_false,
        short_answer=short_answer,
        difficulty=difficulty,
        bloom_levels=bloom_line,
        focus_line=focus_line,
    )
    parsed = generate_json(prompt, temperature=temperature)
    return parsed.get("questions", [])


def generate_questions_from_blueprint(
    blueprint_items: list[dict],
    temperature: float = 0.35,
) -> dict:
    compact_items = []
    for item in blueprint_items:
        compact_items.append({
            "plan_id": item.get("plan_id"),
            "type": item.get("question_type"),
            "unit_id": item.get("unit_id"),
            "unit_title": item.get("unit_title"),
            "concept_id": item.get("concept_id"),
            "concept": item.get("concept"),
            "learning_objective": item.get("learning_objective"),
            "bloom_level": item.get("bloom_level"),
            "difficulty": item.get("difficulty"),
            "question_style": item.get("question_style"),
            "source": ", ".join(item.get("source_labels") or item.get("source_ids") or []),
            "evidence": item.get("evidence", []),
            "common_misconceptions": item.get("common_misconceptions", []),
        })
    prompt = BLUEPRINT_PROMPT.format(blueprint=compact_items)
    try:
        parsed = generate_json(prompt, temperature=temperature)
    except Exception:
        try:
            parsed = generate_json(prompt, temperature=0)
        except Exception:
            return fallback_questions_from_blueprint(blueprint_items)
    return {
        "questions": parsed.get("questions", []),
        "skipped": parsed.get("skipped", []),
    }
