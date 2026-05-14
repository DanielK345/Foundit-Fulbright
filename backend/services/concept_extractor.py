import re

from services.ai_provider import generate_json


NON_EXAM_PATTERNS = [
    r"\bgrading\b",
    r"\bgrade\b.*\bassignment\b",
    r"\bassignment\s+\d+\b",
    r"\bextra credit\b",
    r"\bseminar\b",
    r"\bconference\b",
    r"\broadmap\b",
    r"\blearning roadmap\b",
    r"\bdata science levels\b",
    r"\bjob market\b",
    r"\bour focus\b",
    r"\bpurpose of the course\b",
    r"\bcourse introduction\b",
    r"\bintern/fresher\b",
    r"\bjunior\b.*\bsenior\b",
    r"\bcs\d{3}\b",
]

CORE_HINTS = [
    "backpropagation",
    "gradient",
    "loss",
    "activation",
    "neural network",
    "convolution",
    "recurrent",
    "transformer",
    "attention",
    "optimization",
    "regularization",
    "dropout",
    "batch normalization",
    "chain rule",
    "cross entropy",
]

CONCEPT_PROMPT = """You are an expert professor building a comprehensive study knowledge base from multiple course materials.

You will be provided with context from different document types (e.g., Slides, Study Guides, Homework).
Your goal is to synthesize these sources into rich, fully explained concepts instead of just copying fragmented bullet points.

RULES FOR SYNTHESIS:
1. Identify the core concepts (usually introduced in 'slides').
2. EXPAND on those slide bullet points using the detailed explanations found in the 'study_guide' or 'homework' context.
3. GROUNDING STRICTNESS: Do not invent outside knowledge. Combine fragments into coherent paragraphs.
4. NAMING STRICTNESS: Concept names MUST be clean, professional proper nouns. NO slide numbers, file names, or concatenated phrases (e.g. use "Predictive Analytics", NOT "Course intro Deep Learning 1 Predictive Analytics").
5. EXAM WORTHINESS: Ignore grading, assignments, seminars, conferences, roadmaps, careers, job market, course purpose, and logistics.
6. Prefer fewer strong concepts over many weak slide fragments.

Return strict JSON:
{{
  "concepts": [
    {{
      "name": "Clean, professional concept name",
      "summary": "A rich, synthesized paragraph combining the sources.",
      "definition": "...",
      "examples": ["Specific examples found in the materials"],
      "source_ids": ["..."],
      "evidence": ["short exact evidence or faithful extracted description"],
      "prerequisites": ["..."],
      "related_concepts": ["..."],
      "difficulty": "easy|medium|hard"
    }}
  ]
}}

MATERIAL:
{context}
"""

SANITIZE_PROMPT = """You are a taxonomy editor cleaning up concept names extracted from raw slides.
The names often accidentally include slide numbers, course titles, or headers mashed together (e.g., "Deep Learning Introduction Backpropagation 4").
Clean these into concise, professional, proper noun concepts.

Return strict JSON:
{{
  "cleaned_concepts": [
    {{"original": "...", "clean": "..."}}
  ]
}}

MESSY NAMES:
{names}
"""


def sanitize_concept_names(concepts: list[dict]) -> list[dict]:
    if not concepts:
        return concepts
    names = [c.get("name", "") for c in concepts if c.get("name")]
    if not names:
        return concepts
    try:
        response = generate_json(SANITIZE_PROMPT.format(names=names), temperature=0.1)
        cleaned_map = {
            item["original"]: item["clean"]
            for item in response.get("cleaned_concepts", [])
        }
        for concept in concepts:
            orig = concept.get("name", "")
            if orig in cleaned_map and cleaned_map[orig]:
                concept["name"] = cleaned_map[orig]
    except Exception as e:
        print(f"Sanitization failed: {e}")
    return concepts


def _looks_non_examinable(text: str) -> bool:
    normed = " ".join(str(text or "").lower().split())
    if any(re.search(pattern, normed) for pattern in NON_EXAM_PATTERNS):
        return True
    if len(normed.split()) > 18 and not any(hint in normed for hint in CORE_HINTS):
        return True
    return False


def build_quality_report(sections: list[dict], document_types: dict[str, str]) -> dict:
    low = [s for s in sections if s.get("content_quality") == "low"]
    methods = {}
    for section in sections:
        method = section.get("extraction_method", "text")
        methods[method] = methods.get(method, 0) + 1
    return {
        "total_sections": len(sections),
        "low_quality_sections": len(low),
        "needs_review": len(low) > 0,
        "extraction_methods": methods,
        "document_types": document_types,
        "warnings": (
            [
                f"{len(low)} section(s) have little extractable content. Review or add notes."
            ]
            if low
            else []
        ),
    }


def _context_from_sections(sections: list[dict], max_chars: int = 24000) -> str:
    parts = []
    total = 0
    for section in sections:
        content = section.get("content", "").strip()
        if not content:
            continue
        sample = " ".join([section.get("title", ""), content[:900]])
        if _looks_non_examinable(sample):
            continue
        source = section.get("source_label", section.get("source", "unknown"))
        doc_type = section.get("document_type", "unknown")
        part = f"[{source} | type: {doc_type}]\n{content}"
        if total + len(part) > max_chars:
            break
        parts.append(part)
        total += len(part)
    return "\n\n".join(parts)


def _fallback_concepts(sections: list[dict]) -> list[dict]:
    concepts = []
    seen = set()
    for section in sections:
        content = section.get("content", "")
        sentences = re.split(r"(?<=[.!?])\s+", content)
        useful = [s.strip() for s in sentences if len(s.split()) >= 8]
        if not useful:
            continue
        title = section.get("title") or useful[0][:70]
        name = re.sub(r"[^A-Za-z0-9 /_-]", "", title).strip()[:70] or "Course concept"
        if _looks_non_examinable(" ".join([name, useful[0]])):
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        concepts.append(
            {
                "concept_id": f"concept_{len(concepts) + 1}",
                "name": name,
                "summary": useful[0],
                "definition": useful[0],
                "examples": useful[1:3],
                "source_ids": [section.get("source", "")],
                "source_labels": [
                    section.get("source_label", section.get("source", ""))
                ],
                "evidence": useful[:2],
                "prerequisites": [],
                "related_concepts": [],
                "difficulty": "medium",
                "document_type": section.get("document_type", "unknown"),
            }
        )
    return concepts[:20]


def extract_concepts(sections: list[dict]) -> list[dict]:
    context = _context_from_sections(sections)
    if not context:
        return []

    try:
        parsed = generate_json(CONCEPT_PROMPT.format(context=context), temperature=0.2)
        raw_concepts = parsed.get("concepts", [])
    except Exception:
        return _fallback_concepts(sections)

    concepts = []
    source_lookup = {s.get("source"): s for s in sections}
    for item in raw_concepts:
        name = str(item.get("name", "")).strip()
        evidence = item.get("evidence") or []
        source_ids = item.get("source_ids") or []
        if not name or not evidence:
            continue
        if _looks_non_examinable(" ".join([name, str(item.get("summary", "")), " ".join(evidence)])):
            continue
        source_labels = []
        document_type = "unknown"
        for source_id in source_ids:
            section = source_lookup.get(source_id)
            if section:
                source_labels.append(section.get("source_label", source_id))
                document_type = section.get("document_type", document_type)
        concepts.append(
            {
                "concept_id": f"concept_{len(concepts) + 1}",
                "name": name,
                "summary": str(item.get("summary", "")).strip(),
                "definition": str(item.get("definition", "")).strip(),
                "examples": item.get("examples") or [],
                "source_ids": source_ids,
                "source_labels": source_labels or source_ids,
                "evidence": evidence,
                "prerequisites": item.get("prerequisites") or [],
                "related_concepts": item.get("related_concepts") or [],
                "difficulty": item.get("difficulty", "medium"),
                "document_type": document_type,
            }
        )

    concepts = concepts or _fallback_concepts(sections)
    return sanitize_concept_names(concepts)


def concepts_to_chunks(concepts: list[dict]) -> list[dict]:
    chunks = []
    for concept in concepts:
        evidence = "\n".join(concept.get("evidence", []))
        content = "\n".join(
            [
                f"Concept: {concept.get('name', '')}",
                f"Summary: {concept.get('summary', '')}",
                f"Definition: {concept.get('definition', '')}",
                f"Examples: {'; '.join(concept.get('examples', []))}",
                f"Evidence: {evidence}",
            ]
        ).strip()
        chunks.append(
            {
                "chunk_id": f"{concept.get('concept_id')}_chunk",
                "concept_id": concept.get("concept_id", ""),
                "concept": concept.get("name", ""),
                "document_type": concept.get("document_type", "unknown"),
                "source": ", ".join(concept.get("source_ids", [])),
                "source_label": ", ".join(concept.get("source_labels", [])),
                "evidence": evidence,
                "content": content,
            }
        )
    return chunks
