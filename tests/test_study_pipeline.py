import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from services.concept_extractor import concepts_to_chunks
from services.ai_provider import _extract_json_text, _parse_json_text
from services.blueprint import build_blueprint
from services.course_map import build_course_map, is_low_value_section
from services.evaluator import evaluate_document, evaluate_exam
from services.grader import grade_exam
from services.parser import infer_document_type
from services.quality_judge import judge_question_quality
from services.validator import normalize_question, validate_questions
from models.schema import ExamConfig


def test_infer_document_type_homework():
    sections = [{"content": "Homework 2 asks students to solve synchronization exercises."}]
    assert infer_document_type("assignment_2.docx", sections) == "homework"


def test_concepts_to_chunks_preserves_metadata():
    concepts = [{
        "concept_id": "concept_1",
        "name": "Race condition",
        "summary": "Race conditions happen with unsafe concurrent access.",
        "definition": "A race condition depends on timing between threads.",
        "examples": ["two threads update a counter"],
        "source_ids": ["slide_4"],
        "source_labels": ["lecture.pdf - slide_4"],
        "evidence": ["Threads can access shared data without synchronization."],
        "document_type": "slides",
    }]

    chunks = concepts_to_chunks(concepts)

    assert chunks[0]["concept_id"] == "concept_1"
    assert chunks[0]["concept"] == "Race condition"
    assert chunks[0]["document_type"] == "slides"
    assert "Threads can access shared data" in chunks[0]["evidence"]


def test_validator_accepts_grounded_question():
    chunks = [{
        "concept_id": "concept_1",
        "content": "A mutex protects a critical section so only one thread enters.",
        "evidence": "A mutex protects a critical section.",
        "source_label": "lecture.pdf - slide_8",
    }]
    questions = [{
        "type": "mcq",
        "question": "What is the purpose of a mutex in thread synchronization?",
        "options": ["A) Protect a critical section", "B) Delete a process", "C) Compile code", "D) Allocate a disk"],
        "answer": "A",
        "explanation": "A mutex protects critical sections from concurrent entry.",
        "source": "lecture.pdf - slide_8",
        "evidence": "A mutex protects a critical section.",
        "concept_id": "concept_1",
        "concept": "Mutex",
    }]

    valid, rejected = validate_questions(questions, chunks)

    assert len(valid) == 1
    assert rejected == []
    assert valid[0]["quality_score"] >= 0.65


def test_normalize_question_fills_missing_grounding_metadata():
    chunks = [{
        "concept_id": "concept_1",
        "concept": "Mutex",
        "content": "A mutex protects a critical section.",
        "evidence": "A mutex protects a critical section.",
        "source_label": "lecture.pdf - slide_8",
        "document_type": "slides",
    }]
    question = {
        "type": "true_false",
        "question": "A mutex protects a critical section from concurrent access.",
        "answer": "True",
        "explanation": "The source says a mutex protects critical sections.",
        "concept": "Mutex",
    }

    normalized = normalize_question(question, chunks)

    assert normalized["concept_id"] == "concept_1"
    assert normalized["source"] == "lecture.pdf - slide_8"
    assert normalized["evidence"] == "A mutex protects a critical section."


def test_grader_returns_weak_concepts_for_wrong_mcq():
    questions = [{
        "type": "mcq",
        "question": "What protects a critical section?",
        "options": ["A) Mutex", "B) Compiler", "C) Router", "D) Cache"],
        "answer": "A",
        "explanation": "A mutex protects a critical section.",
        "source": "slide_8",
        "concept_id": "concept_1",
        "concept": "Mutex",
        "evidence": "A mutex protects a critical section.",
        "bloom_level": "understand",
    }]

    result = grade_exam(questions, {"0": "B"})

    assert result["score"] == 0
    assert result["weak_concepts"][0]["concept"] == "Mutex"
    assert result["concept_breakdown"][0]["missed"] == 1


def test_evaluator_document_metrics():
    doc = {
        "pages": [
            {"content_quality": "high"},
            {"content_quality": "medium"},
            {"content_quality": "low"},
        ],
        "concepts": [{"concept_id": "concept_1"}],
        "concept_chunks": [{"chunk_id": "concept_1_chunk"}],
        "document_types": {"notes.txt": "notes"},
    }

    result = evaluate_document(doc)

    assert result["total_sections"] == 3
    assert result["usable_sections"] == 2
    assert result["extraction_coverage"] == 66.7


def test_evaluator_exam_metrics():
    chunks = [{
        "concept_id": "concept_1",
        "content": "A mutex protects a critical section.",
        "evidence": "A mutex protects a critical section.",
    }]
    questions = [{
        "type": "true_false",
        "question": "A mutex can protect a critical section from concurrent access.",
        "options": ["True", "False"],
        "answer": "True",
        "explanation": "A mutex protects critical sections.",
        "source": "slide_8",
        "evidence": "A mutex protects a critical section.",
        "concept_id": "concept_1",
        "concept": "Mutex",
    }]

    result = evaluate_exam(questions, chunks)

    assert result["total_questions"] == 1
    assert result["grounding_rate"] == 100.0


def test_extract_json_text_handles_markdown_and_trailing_commas():
    text = """```json
    {
      "questions": [
        {"type": "mcq", "question": "What is a mutex?",}
      ],
    }
    ```"""

    cleaned = _extract_json_text(text)

    assert cleaned.startswith("{")
    assert ",}" not in cleaned
    assert ",]" not in cleaned


def test_parse_json_text_keeps_first_object_when_model_adds_extra_data():
    parsed = _parse_json_text('{"questions": []}\n{"note": "extra"}')

    assert parsed == {"questions": []}


def test_course_map_marks_logistics_as_ignored():
    section = {
        "title": "Final project deadlines",
        "source": "slide_7",
        "source_label": "lecture.pdf - slide_7",
        "content": "Final project deadline is Friday. Submit slides and demo.",
    }

    ignored, reason = is_low_value_section(section)

    assert ignored is True
    assert "low-value" in reason


def test_course_map_fallback_keeps_deep_learning_concepts():
    sections = [
        {
            "title": "Course introduction",
            "source": "slide_1",
            "source_label": "dl.pdf - slide_1",
            "content": "Course introduction Deep Learning for Artificial Intelligence",
        },
        {
            "title": "Backpropagation",
            "source": "slide_20",
            "source_label": "dl.pdf - slide_20",
            "content": "Backpropagation computes gradients through layers using the chain rule.",
            "document_type": "slides",
        },
    ]
    concepts = [{
        "concept_id": "concept_1",
        "name": "Backpropagation",
        "summary": "Backpropagation computes gradients through layers.",
        "definition": "Backpropagation uses the chain rule to compute gradients.",
        "evidence": ["Backpropagation computes gradients through layers using the chain rule."],
        "source_ids": ["slide_20"],
        "source_labels": ["dl.pdf - slide_20"],
        "difficulty": "medium",
        "document_type": "slides",
    }]

    course_map = build_course_map(sections, concepts)

    assert course_map["units"][0]["concepts"][0]["name"] == "Backpropagation"
    assert course_map["ignored_material"][0]["source"] == "slide_1"


def test_blueprint_selects_high_value_concepts_only():
    course_map = {
        "course_title": "Deep Learning",
        "units": [{
            "unit_id": "unit_1",
            "title": "Neural Networks",
            "importance": "high",
            "included": True,
            "concepts": [
                {
                    "concept_id": "concept_1",
                    "name": "Backpropagation",
                    "included": True,
                    "exam_likelihood": "high",
                    "learning_objectives": ["Apply the chain rule in backpropagation."],
                    "evidence": ["Backpropagation uses the chain rule to compute gradients."],
                    "source_ids": ["slide_20"],
                },
                {
                    "concept_id": "concept_2",
                    "name": "Course policy",
                    "included": True,
                    "exam_likelihood": "low",
                    "learning_objectives": ["Recall the deadline."],
                    "evidence": ["The deadline is Friday."],
                    "source_ids": ["slide_2"],
                },
            ],
        }],
        "ignored_material": [{"source": "slide_2", "reason": "deadline"}],
    }
    config = ExamConfig(document_id="doc_1", mcq=1, true_false=0, short_answer=0)

    blueprint = build_blueprint("doc_1", course_map, config)

    assert len(blueprint["question_plan"]) == 1
    assert blueprint["question_plan"][0]["concept"] == "Backpropagation"


def test_quality_judge_rejects_generic_fallback_question():
    question = {
        "type": "mcq",
        "question": "Which statement is best supported about Course introductionDeep Learning?",
        "options": [
            "A) Course introduction Deep Learning",
            "B) The material says this concept is unrelated to the course.",
            "C) The source states the opposite without conditions.",
            "D) The material only discusses administrative deadlines.",
        ],
        "answer": "A",
        "explanation": "The answer is supported by the source evidence.",
        "evidence": "Course introduction Deep Learning",
        "concept_id": "concept_1",
        "concept": "Course introduction",
        "bloom_level": "understand",
    }

    result = judge_question_quality(question, {"concept_id": "concept_1", "learning_objective": "Explain backpropagation."})

    assert result["valid"] is False
    assert any("low-quality pattern" in reason or "generic" in reason for reason in result["reasons"])


def test_blueprint_rejects_roadmap_and_grading_items():
    course_map = {
        "course_title": "Deep Learning",
        "units": [{
            "unit_id": "unit_1",
            "title": "Course Admin",
            "importance": "high",
            "included": True,
            "concepts": [{
                "concept_id": "concept_admin",
                "name": "Data Science Levels",
                "included": True,
                "exam_likelihood": "high",
                "learning_objectives": ["Explain learning roadmap data science and AI levels."],
                "evidence": ["Intern/Fresher Junior Mid-level Senior CS103 CS208 CS313."],
                "source_ids": ["slide_3"],
            }],
        }, {
            "unit_id": "unit_2",
            "title": "Backpropagation",
            "importance": "high",
            "included": True,
            "concepts": [{
                "concept_id": "concept_bp",
                "name": "Backpropagation",
                "included": True,
                "exam_likelihood": "high",
                "learning_objectives": ["Apply the chain rule to compute gradients."],
                "evidence": ["Backpropagation uses the chain rule to compute gradients through layers."],
                "source_ids": ["slide_20"],
            }],
        }],
        "ignored_material": [],
    }
    config = ExamConfig(document_id="doc_1", mcq=2, true_false=0, short_answer=0)

    blueprint = build_blueprint("doc_1", course_map, config)
    concepts = {item["concept"] for item in blueprint["question_plan"]}

    assert "Backpropagation" in concepts
    assert "Data Science Levels" not in concepts


def test_quality_judge_rejects_repair_template_question():
    question = {
        "type": "mcq",
        "question": "How should a student use Deep Learning to meet this objective?",
        "options": [
            "A) Connect Deep Learning to the mechanism described by the source evidence.",
            "B) Treat Deep Learning as only a vocabulary term without applying it.",
            "C) Deep Learning works without the conditions described in the material.",
            "D) Use Deep Learning without checking assumptions.",
        ],
        "answer": "A",
        "explanation": "The source evidence supports this.",
        "evidence": "Deep Learning",
        "concept_id": "concept_1",
        "concept": "Deep Learning",
        "bloom_level": "apply",
    }

    result = judge_question_quality(question, {"concept_id": "concept_1", "learning_objective": "Apply backpropagation."})

    assert result["valid"] is False
