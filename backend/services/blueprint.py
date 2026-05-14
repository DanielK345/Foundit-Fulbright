import uuid
import re


BLOCKED_BLUEPRINT_PATTERNS = [
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

CORE_BLUEPRINT_HINTS = [
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
    "softmax",
]


def _difficulty_for(concept: dict, config_difficulty: str) -> str:
    if config_difficulty in {"easy", "medium", "hard"}:
        return config_difficulty
    likelihood = concept.get("exam_likelihood", "medium")
    return "hard" if likelihood == "high" else "medium"


def _question_sequence(config) -> list[str]:
    sequence = []
    sequence.extend(["mcq"] * max(0, int(config.mcq)))
    sequence.extend(["true_false"] * max(0, int(config.true_false)))
    sequence.extend(["short_answer"] * max(0, int(config.short_answer)))
    return sequence


def _is_blueprint_worthy(unit: dict, concept: dict) -> bool:
    text = " ".join([
        unit.get("title", ""),
        unit.get("summary", ""),
        concept.get("name", ""),
        " ".join(concept.get("learning_objectives", [])),
        " ".join(concept.get("evidence", [])),
    ]).lower()
    if any(re.search(pattern, text) for pattern in BLOCKED_BLUEPRINT_PATTERNS):
        return False
    if any(hint in text for hint in CORE_BLUEPRINT_HINTS):
        return True
    objective_text = " ".join(concept.get("learning_objectives", [])).lower()
    if any(word in objective_text for word in ["derive", "compute", "compare", "analyze", "apply", "explain how", "why"]):
        return True
    return False


def build_blueprint(document_id: str, course_map: dict, config) -> dict:
    selected_units = set(config.selected_unit_ids or [])
    selected_concepts = set(config.selected_concept_ids or [])
    bloom_levels = config.bloom_levels or ["understand", "apply"]
    question_types = _question_sequence(config)
    candidates = []

    for unit in course_map.get("units", []):
        if unit.get("included") is False:
            continue
        if selected_units and unit.get("unit_id") not in selected_units:
            continue
        if unit.get("importance") == "low" and not selected_units:
            continue
        for concept in unit.get("concepts", []):
            if concept.get("included") is False:
                continue
            if selected_concepts and concept.get("concept_id") not in selected_concepts:
                continue
            if concept.get("exam_likelihood") == "low" and not selected_concepts:
                continue
            objectives = concept.get("learning_objectives") or []
            evidence = concept.get("evidence") or []
            if not objectives or not evidence:
                continue
            if not _is_blueprint_worthy(unit, concept):
                continue
            weight = {"high": 0, "medium": 1, "low": 2}.get(concept.get("exam_likelihood", "medium"), 1)
            candidates.append((weight, unit, concept))

    candidates.sort(key=lambda item: item[0])
    question_plan = []
    if not candidates or not question_types:
        return {
            "blueprint_id": str(uuid.uuid4()),
            "document_id": document_id,
            "study_goal": config.study_goal,
            "question_style": config.question_style,
            "question_plan": [],
            "skipped": [{"reason": "No selected high-value concepts with learning objectives and evidence."}],
        }

    for index, qtype in enumerate(question_types):
        _, unit, concept = candidates[index % len(candidates)]
        objectives = concept.get("learning_objectives") or []
        objective = objectives[index % len(objectives)]
        plan_item = {
            "plan_id": f"plan_{index + 1}",
            "unit_id": unit.get("unit_id", ""),
            "unit_title": unit.get("title", ""),
            "concept_id": concept.get("concept_id", ""),
            "concept": concept.get("name", ""),
            "learning_objective": objective,
            "question_type": qtype,
            "bloom_level": bloom_levels[index % len(bloom_levels)],
            "difficulty": _difficulty_for(concept, config.difficulty),
            "source_ids": concept.get("source_ids") or unit.get("source_ids") or [],
            "source_labels": concept.get("source_labels") or concept.get("source_ids") or [],
            "evidence": concept.get("evidence", [])[:4],
            "common_misconceptions": concept.get("common_misconceptions", [])[:4],
            "question_style": config.question_style,
            "document_type": concept.get("document_type", "unknown"),
        }
        question_plan.append(plan_item)

    return {
        "blueprint_id": str(uuid.uuid4()),
        "document_id": document_id,
        "study_goal": config.study_goal,
        "question_style": config.question_style,
        "question_plan": question_plan,
        "skipped": [],
    }
