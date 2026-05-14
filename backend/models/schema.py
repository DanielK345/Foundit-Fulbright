from pydantic import BaseModel, Field
from typing import Optional


class ExamConfig(BaseModel):
    document_id: str
    time_limit: int = 30  # minutes
    mcq: int = 5
    true_false: int = 3
    short_answer: int = 2
    difficulty: str = "medium"
    focus: Optional[str] = None
    bloom_levels: list[str] = Field(default_factory=lambda: ["understand", "apply"])
    source_types: list[str] = Field(default_factory=list)
    study_goal: str = "test_review"
    question_style: str = "mixed"
    selected_unit_ids: list[str] = Field(default_factory=list)
    selected_concept_ids: list[str] = Field(default_factory=list)


class Question(BaseModel):
    type: str  # "mcq", "true_false", "short_answer"
    question: str
    options: Optional[list[str]] = None
    answer: str
    explanation: str
    source: str
    evidence: str = ""
    concept_id: str = ""
    concept: str = ""
    unit_id: str = ""
    unit_title: str = ""
    learning_objective: str = ""
    document_type: str = "unknown"
    bloom_level: str = "understand"
    difficulty: str = "medium"


class ExamResponse(BaseModel):
    exam_id: str
    questions: list[Question]
    time_limit: int
    document_id: Optional[str] = None


class UploadResponse(BaseModel):
    document_id: str
    filenames: list[str]
    num_pages: int
    document_types: dict[str, str] = Field(default_factory=dict)
    quality_report: dict = Field(default_factory=dict)
    message: str


class DocumentContextResponse(BaseModel):
    document_id: str
    filenames: list[str]
    num_sections: int
    merged_content: str
    quality_report: dict = Field(default_factory=dict)
    sections: list[dict] = Field(default_factory=list)


class UpdateContextRequest(BaseModel):
    content: str


class UpdateSectionsRequest(BaseModel):
    sections: list[dict]


class IdeasResponse(BaseModel):
    ideas: str


class ConceptsResponse(BaseModel):
    document_id: str
    concepts: list[dict]


class QualityResponse(BaseModel):
    document_id: str
    quality_report: dict


class SectionsResponse(BaseModel):
    document_id: str
    sections: list[dict]


class CourseMapResponse(BaseModel):
    document_id: str
    course_map: dict


class UpdateCourseMapRequest(BaseModel):
    course_map: dict


class BlueprintRequest(BaseModel):
    config: ExamConfig


class BlueprintResponse(BaseModel):
    blueprint_id: str
    document_id: str
    blueprint: dict


class GradeRequest(BaseModel):
    exam_id: str
    answers: dict[str, str]  # question index (str) -> user answer


class QuestionResult(BaseModel):
    question_index: int
    question: str
    type: str
    user_answer: str
    correct_answer: str
    explanation: str
    source: str
    is_correct: Optional[bool]
    feedback: str = ""
    concept_id: str = ""
    concept: str = ""
    unit_id: str = ""
    unit_title: str = ""
    learning_objective: str = ""
    evidence: str = ""
    bloom_level: str = ""
    diagnosis: str = ""


class GradeResponse(BaseModel):
    score: int
    gradable: int
    total: int
    percentage: float
    details: list[QuestionResult]
    weak_concepts: list[dict] = Field(default_factory=list)
    concept_breakdown: list[dict] = Field(default_factory=list)


class PracticeRequest(BaseModel):
    exam_id: str
    count: int = 5
