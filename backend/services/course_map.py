import re

from typing import Optional
import os
from services.ai_provider import OLLAMA_EXTRACT_MODEL, generate_json
from services.concept_extractor import sanitize_concept_names

LOW_VALUE_KEYWORDS = {
    "agenda",
    "deadline",
    "logistics",
    "grading",
    "office hour",
    "course introduction",
    "course intro",
    "final project",
    "project instruction",
    "job market",
    "career",
    "our focus",
    "syllabus",
    "schedule",
    "assessment",
    "assignment policy",
    "assignment",
    "seminar",
    "conference",
    "roadmap",
    "intern",
    "fresher",
    "junior",
    "senior",
    "extra credit",
}

STRONG_LOW_VALUE_PATTERNS = [
    r"\bgrading\b",
    r"\bgrade\b.*\bassignment\b",
    r"\bassignment\s+\d+\b",
    r"\bextra credit\b",
    r"\bseminar\b",
    r"\bconference\b",
    r"\broadmap\b",
    r"\blearning roadmap\b",
    r"\bdata science levels\b",
    r"\bintern/fresher\b",
    r"\bjunior\b.*\bmid\b.*\bsenior\b",
    r"\bcs\d{3}\b",
]

LOW_VALUE_PATTERNS = [
    r"\bpurpose of the course\b",
    r"\bcourse (overview|introduction|intro)\b",
    r"\bjob market\b",
    r"\bwide range of professions\b",
    r"\bour focus\b",
    r"\bdata science skill set\b",
    r"\bfinal project\b",
    r"\bdeadline\b",
    r"\bagenda\b",
    r"\bgrading\b",
    r"\bsyllabus\b",
    r"\btypes? of data you will handle\b",
]

HIGH_VALUE_HINTS = [
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
    "embedding",
    "classification",
    "regression",
    "overfitting",
    "underfitting",
    "epoch",
    "learning rate",
    "chain rule",
    "partial derivative",
    "softmax",
    "cross entropy",
    "vanishing gradient",
]

MAX_REFINED_UNITS = 10
MAX_REFINED_CONCEPTS = 18
ENABLE_LOCAL_COURSE_MAP_REFINEMENT = os.getenv("ENABLE_LOCAL_COURSE_MAP_REFINEMENT", "false").lower() == "true"

COURSE_MAP_PROMPT = """You are an expert teaching assistant building a test review map from university course materials.

Your job is to understand the full course and separate meaningful examinable concepts from administrative material.
Synthesize concepts by merging information from different materials (e.g. use detailed explanations from study guides to expand upon slide bullet points).
Concept names and Unit titles MUST be clean, proper nouns without trailing numbers or garbage text.

Ignore low-value material:
- course introduction slides
- project instructions
- job market/career overview
- deadlines/logistics
- agenda-only slides
- generic "our focus" slides
- repeated title-only slides
- grading, assignment weights, roadmap/career ladder, conferences, seminars

Keep only concepts that could become a meaningful exam question in deep learning, machine learning, or AI.
Prefer 8-14 strong concepts over listing every slide.
Default uncertain items to ignored_material.

Return strict JSON only:
{{
  "course_title": "...",
  "units": [
    {{
      "title": "...",
      "summary": "...",
      "importance": "high|medium|low",
      "source_ids": ["..."],
      "concepts": [
        {{
          "name": "...",
          "learning_objectives": ["Explain ...", "Apply ..."],
          "prerequisites": ["..."],
          "common_misconceptions": ["..."],
          "evidence": ["short source-supported evidence"],
          "exam_likelihood": "high|medium|low"
        }}
      ]
    }}
  ],
  "ignored_material": [
    {{"source": "...", "reason": "..."}}
  ]
}}

MATERIAL:
{context}
"""


COURSE_MAP_REFINER_PROMPT = """You are a strict professor reviewing an automatically extracted course map before exam generation.

Remove anything that is not useful for studying a real test.

Reject:
- grading/assignment weights
- seminars/conferences
- job market/career/roadmap slides
- course purpose/introduction/logistics
- vague labels like "Data Types" unless the evidence contains technical definitions/examples
- raw slide text pasted as a concept

Keep only concepts that can produce a meaningful question about deep learning, machine learning, or AI.
Rewrite learning objectives into concrete, testable objectives.
Return at most {max_units} units and at most {max_concepts} concepts total.

Return strict JSON:
{{
  "course_title": "...",
  "units": [
    {{
      "unit_id": "...",
      "title": "...",
      "summary": "...",
      "importance": "high|medium|low",
      "included": true,
      "source_ids": ["..."],
      "concepts": [
        {{
          "concept_id": "...",
          "name": "...",
          "learning_objectives": ["..."],
          "prerequisites": ["..."],
          "common_misconceptions": ["..."],
          "evidence": ["..."],
          "source_ids": ["..."],
          "source_labels": ["..."],
          "document_type": "slides|homework|reading|notes|previous_test|unknown",
          "exam_likelihood": "high|medium|low",
          "included": true
        }}
      ]
    }}
  ],
  "ignored_material": [
    {{"source": "...", "source_label": "...", "reason": "..."}}
  ]
}}

COURSE MAP:
{course_map}
"""


def _norm(text: str) -> str:
    return " ".join(str(text or "").lower().split())


def _clean_name(text: str, fallback: str = "Course concept") -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
    cleaned = re.sub(r"([a-z])([A-Z])", r"\1 \2", cleaned)
    cleaned = re.sub(r"\b(\w+)(?:\s+\1\b)+", r"\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[^A-Za-z0-9 /_():,.-]", "", cleaned).strip(" -:")
    return cleaned[:90] or fallback


def _is_low_value_text(*parts: str) -> tuple[bool, str]:
    text = _norm(" ".join(str(part or "") for part in parts))
    for pattern in STRONG_LOW_VALUE_PATTERNS:
        if re.search(pattern, text):
            label = pattern.replace("\\b", "").replace(".*", " ").replace("\\d{3}", "number")
            return True, f"not exam concept: {label}"
    has_high_value_hint = any(hint in text for hint in HIGH_VALUE_HINTS)
    for pattern in LOW_VALUE_PATTERNS:
        if re.search(pattern, text) and not has_high_value_hint:
            label = pattern.replace("\\b", "").replace("(", "").replace(")", "").replace("|", "/")
            return True, f"low-value course material: {label}"
    for keyword in LOW_VALUE_KEYWORDS:
        if keyword in text and not has_high_value_hint:
            return True, f"low-value course material: {keyword}"
    return False, ""


def is_low_value_section(section: dict) -> tuple[bool, str]:
    text = _norm(
        " ".join(
            [
                section.get("title", ""),
                section.get("source_label", ""),
                section.get("content", ""),
            ]
        )
    )
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9_+-]*", text)
    unique_words = set(words)
    if len(unique_words) <= 5 and len(words) <= 16:
        return True, "title-only or too little learning content"
    low_value, reason = _is_low_value_text(text)
    if low_value:
        return True, reason
    if text.count("course") >= 2 and ("introduction" in text or "overview" in text):
        return True, "course overview rather than examinable content"
    return False, ""


def _is_low_value_course_item(*parts: str) -> tuple[bool, str]:
    text = " ".join(str(part or "") for part in parts)
    low_value, reason = _is_low_value_text(text)
    if low_value:
        return True, reason
    normed = _norm(text)
    if any(hint in normed for hint in HIGH_VALUE_HINTS):
        return False, ""
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9_+-]*", normed)
    if len(words) > 18 and not any(hint in normed for hint in HIGH_VALUE_HINTS):
        return True, "raw slide text without a focused examinable concept"
    if len(set(words)) <= 6 and len(words) <= 14:
        return True, "too little examinable learning content"
    return False, ""


def _context_from_sections(sections: list[dict], max_chars: int = 36000) -> str:
    parts = []
    total = 0
    for section in sections:
        ignored, reason = is_low_value_section(section)
        source = section.get("source", "")
        label = section.get("source_label", source)
        doc_type = section.get("document_type", "unknown")
        content = str(section.get("content", "")).strip()
        if not content:
            continue
        prefix = "IGNORE_CANDIDATE" if ignored else "LEARNING_CONTENT"
        part = f"[{prefix} | source: {source} | label: {label} | type: {doc_type} | reason: {reason}]\n{content}"
        if total + len(part) > max_chars:
            break
        parts.append(part)
        total += len(part)
    return "\n\n".join(parts)


def _fallback_course_map(sections: list[dict], concepts: list[dict]) -> dict:
    ignored = []
    usable_sources = set()
    for section in sections:
        is_ignored, reason = is_low_value_section(section)
        if is_ignored:
            ignored.append(
                {
                    "source": section.get("source", ""),
                    "source_label": section.get(
                        "source_label", section.get("source", "")
                    ),
                    "reason": reason,
                }
            )
        else:
            usable_sources.add(section.get("source", ""))

    units = []
    for concept in concepts:
        source_ids = [
            sid for sid in concept.get("source_ids", []) if sid in usable_sources
        ]
        if not source_ids and concept.get("source_ids"):
            continue
        name = _clean_name(concept.get("name"))
        is_ignored_concept, reason = _is_low_value_course_item(
            name,
            concept.get("summary", ""),
            " ".join(concept.get("evidence", [])),
        )
        if is_ignored_concept:
            ignored.append({
                "source": ", ".join(concept.get("source_ids", [])),
                "source_label": ", ".join(concept.get("source_labels", [])),
                "reason": reason,
            })
            continue
        objective = f"Explain and apply {name} using course evidence."
        if concept.get("definition"):
            objective = (
                f"Explain {name} and identify how it is used in the course material."
            )
        concept_item = {
            "concept_id": concept.get("concept_id", f"concept_{len(units) + 1}"),
            "name": name,
            "learning_objectives": [objective],
            "prerequisites": concept.get("prerequisites", []),
            "common_misconceptions": concept.get("related_concepts", [])[:2],
            "evidence": concept.get("evidence", [])[:3],
            "source_ids": source_ids or concept.get("source_ids", []),
            "source_labels": concept.get("source_labels", []),
            "exam_likelihood": (
                "high" if concept.get("difficulty") in {"medium", "hard"} else "medium"
            ),
            "included": True,
        }
        units.append(
            {
                "unit_id": f"unit_{len(units) + 1}",
                "title": name,
                "summary": concept.get("summary", ""),
                "importance": (
                    "high" if concept_item["exam_likelihood"] == "high" else "medium"
                ),
                "source_ids": concept_item["source_ids"],
                "included": True,
                "concepts": [concept_item],
            }
        )

    if not units:
        for section in sections:
            is_ignored, _ = is_low_value_section(section)
            if is_ignored:
                continue
            title = _clean_name(
                section.get("title") or section.get("source_label"), "Course unit"
            )
            evidence = str(section.get("content", ""))[:500]
            units.append(
                {
                    "unit_id": f"unit_{len(units) + 1}",
                    "title": title,
                    "summary": evidence[:220],
                    "importance": "medium",
                    "source_ids": [section.get("source", "")],
                    "included": True,
                    "concepts": [
                        {
                            "concept_id": f"concept_{len(units) + 1}",
                            "name": title,
                            "learning_objectives": [
                                f"Explain the main learning content in {title}."
                            ],
                            "prerequisites": [],
                            "common_misconceptions": [],
                            "evidence": [evidence],
                            "source_ids": [section.get("source", "")],
                            "source_labels": [
                                section.get("source_label", section.get("source", ""))
                            ],
                            "exam_likelihood": "medium",
                            "included": True,
                        }
                    ],
                }
            )

    return {
        "course_title": "Uploaded Course Materials",
        "units": units[:24],
        "ignored_material": ignored,
    }


def _normalize_course_map(
    raw: dict, sections: list[dict], concepts: list[dict]
) -> dict:
    fallback = _fallback_course_map(sections, concepts)
    ignored_sources = {item.get("source") for item in fallback["ignored_material"]}
    ignored = list(fallback["ignored_material"])
    seen_ignored = {item.get("source") for item in ignored}
    for item in raw.get("ignored_material", []) or []:
        source = str(item.get("source", "")).strip()
        if source and source not in seen_ignored:
            ignored.append(
                {
                    "source": source,
                    "reason": str(item.get("reason", "low-value material")),
                }
            )
            seen_ignored.add(source)

    units = []
    concept_lookup = {_norm(c.get("name")): c for c in concepts}
    for unit in raw.get("units", []) or []:
        title = _clean_name(unit.get("title"), "Course unit")
        low_unit, unit_reason = _is_low_value_course_item(
            title,
            unit.get("summary", ""),
            " ".join(unit.get("source_ids", [])),
        )
        if low_unit:
            ignored.append({
                "source": ", ".join(unit.get("source_ids", [])),
                "reason": unit_reason,
            })
            continue
        raw_concepts = unit.get("concepts", []) or []
        normalized_concepts = []
        for item in raw_concepts:
            name = _clean_name(item.get("name"))
            low_concept, concept_reason = _is_low_value_course_item(
                name,
                " ".join(item.get("learning_objectives", []) or []),
                " ".join(item.get("evidence", []) or []),
            )
            if low_concept:
                ignored.append({
                    "source": ", ".join(item.get("source_ids") or unit.get("source_ids") or []),
                    "reason": concept_reason,
                })
                continue
            matched = concept_lookup.get(_norm(name), {})
            source_ids = (
                item.get("source_ids")
                or matched.get("source_ids")
                or unit.get("source_ids")
                or []
            )
            source_ids = [
                sid for sid in source_ids if sid and sid not in ignored_sources
            ]
            evidence = item.get("evidence") or matched.get("evidence") or []
            objectives = [
                str(obj).strip()
                for obj in item.get("learning_objectives", [])
                if str(obj).strip()
            ]
            if not objectives:
                objectives = [f"Explain and apply {name} in a course problem."]
            if not evidence:
                continue
            normalized_concepts.append(
                {
                    "concept_id": matched.get(
                        "concept_id",
                        f"concept_{len(units) + 1}_{len(normalized_concepts) + 1}",
                    ),
                    "name": name,
                    "learning_objectives": objectives[:4],
                    "prerequisites": item.get("prerequisites")
                    or matched.get("prerequisites")
                    or [],
                    "common_misconceptions": item.get("common_misconceptions") or [],
                    "evidence": evidence[:4],
                    "source_ids": source_ids,
                    "source_labels": matched.get("source_labels", source_ids),
                    "document_type": matched.get("document_type", "unknown"),
                    "exam_likelihood": item.get("exam_likelihood", "medium"),
                    "included": bool(item.get("included", True)),
                }
            )
        if normalized_concepts:
            units.append(
                {
                    "unit_id": f"unit_{len(units) + 1}",
                    "title": title,
                    "summary": str(unit.get("summary", "")).strip(),
                    "importance": unit.get("importance", "medium"),
                    "source_ids": [
                        sid
                        for sid in unit.get("source_ids", [])
                        if sid not in ignored_sources
                    ],
                    "included": bool(unit.get("included", True)),
                    "concepts": normalized_concepts,
                }
            )

    return {
        "course_title": _clean_name(
            raw.get("course_title") or fallback["course_title"],
            "Uploaded Course Materials",
        ),
        "units": units or fallback["units"],
        "ignored_material": ignored,
    }


def prune_course_map(course_map: dict) -> dict:
    ignored = list(course_map.get("ignored_material", []))
    pruned_units = []
    for unit in course_map.get("units", []):
        unit_low, unit_reason = _is_low_value_course_item(
            unit.get("title", ""),
            unit.get("summary", ""),
            " ".join(unit.get("source_ids", [])),
        )
        if unit_low:
            ignored.append({
                "source": ", ".join(unit.get("source_ids", [])),
                "source_label": unit.get("title", ""),
                "reason": unit_reason,
            })
            continue

        concepts = []
        for concept in unit.get("concepts", []):
            concept_low, concept_reason = _is_low_value_course_item(
                concept.get("name", ""),
                " ".join(concept.get("learning_objectives", [])),
                " ".join(concept.get("evidence", [])),
            )
            if concept_low:
                ignored.append({
                    "source": ", ".join(concept.get("source_ids", [])),
                    "source_label": concept.get("name", ""),
                    "reason": concept_reason,
                })
                continue
            concept = dict(concept)
            concept["name"] = _clean_name(concept.get("name"))
            concept["learning_objectives"] = [
                _clean_name(objective, objective)
                for objective in concept.get("learning_objectives", [])
                if str(objective).strip()
            ][:4] or [f"Explain and apply {concept['name']} in a course problem."]
            concepts.append(concept)
        if concepts:
            unit = dict(unit)
            unit["title"] = _clean_name(unit.get("title"), "Course unit")
            unit["concepts"] = concepts
            pruned_units.append(unit)

    course_map = dict(course_map)
    course_map["units"] = pruned_units
    course_map["ignored_material"] = ignored
    return course_map


def build_rule_based_course_map(sections: list[dict]) -> dict:
    ignored = []
    units = []
    concept_index = 1
    for section in sections:
        content = str(section.get("content", "")).strip()
        if not content:
            continue
        ignored_section, reason = is_low_value_section(section)
        if ignored_section:
            ignored.append({
                "source": section.get("source", ""),
                "source_label": section.get("source_label", section.get("source", "")),
                "reason": reason,
            })
            continue

        title = _clean_name(section.get("title") or section.get("source_label") or "Course concept")
        evidence = content[:500]
        objective_name = title
        if len(objective_name.split()) > 8:
            objective_name = " ".join(objective_name.split()[:8])
        unit = {
            "unit_id": f"unit_{len(units) + 1}",
            "title": title,
            "summary": content[:260],
            "importance": "medium",
            "source_ids": [section.get("source", "")],
            "included": True,
            "concepts": [{
                "concept_id": f"fast_concept_{concept_index}",
                "name": title,
                "learning_objectives": [f"Explain and apply {objective_name} using the course evidence."],
                "prerequisites": [],
                "common_misconceptions": [],
                "evidence": [evidence],
                "source_ids": [section.get("source", "")],
                "source_labels": [section.get("source_label", section.get("source", ""))],
                "document_type": section.get("document_type", "unknown"),
                "exam_likelihood": "medium",
                "included": True,
            }],
        }
        units.append(unit)
        concept_index += 1

    return prune_course_map({
        "course_title": "Uploaded Course Materials",
        "units": units[:18],
        "ignored_material": ignored,
    })


def refine_course_map_with_ai(course_map: dict) -> dict:
    pruned = prune_course_map(course_map)
    if not ENABLE_LOCAL_COURSE_MAP_REFINEMENT:
        return pruned
    if not pruned.get("units"):
        return pruned
    try:
        refined = generate_json(
            COURSE_MAP_REFINER_PROMPT.format(
                course_map=pruned,
                max_units=MAX_REFINED_UNITS,
                max_concepts=MAX_REFINED_CONCEPTS,
            ),
            temperature=0.05,
            prefer_local=True,
            local_model=OLLAMA_EXTRACT_MODEL,
        )
        if refined.get("units"):
            return prune_course_map(refined)
    except Exception:
        pass
    return pruned


def build_course_map(
    sections: list[dict], concepts: Optional[list[dict]] = None
) -> dict:
    concepts = concepts or []
    context = _context_from_sections(sections)
    course_map = None
    if context:
        try:
            parsed = generate_json(
                COURSE_MAP_PROMPT.format(context=context), temperature=0.15
            )
            course_map = _normalize_course_map(parsed, sections, concepts)
        except Exception:
            pass

    if not course_map:
        course_map = _fallback_course_map(sections, concepts)

    # Apply AI sanitization to unit titles and concept names
    all_items_to_clean = []
    for unit in course_map.get("units", []):
        all_items_to_clean.append(
            unit
        )  # Has 'title' instead of 'name', we'll handle this
        for concept in unit.get("concepts", []):
            all_items_to_clean.append(concept)

    # Normalize keys for the sanitizer (which expects 'name')
    for item in all_items_to_clean:
        if "title" in item and "name" not in item:
            item["name"] = item["title"]

    sanitize_concept_names(all_items_to_clean)

    # Restore 'title' for units
    for item in all_items_to_clean:
        if "title" in item:
            item["title"] = item["name"]

    return refine_course_map_with_ai(course_map)
