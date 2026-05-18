from pydantic import BaseModel
from typing import Any, Optional


class ExamConfig(BaseModel):
    document_id: str
    time_limit: int = 30  # minutes
    mcq: int = 5
    true_false: int = 3
    short_answer: int = 2
    coding: int = 2
    difficulty: str = "medium"
    focus: Optional[str] = None


class Question(BaseModel):
    type: str  # "mcq", "true_false", "short_answer", "coding"
    question: str
    options: Optional[list[str]] = None
    answer: str
    explanation: str
    source: str
    code_snippet: Optional[str] = None


class ExamResponse(BaseModel):
    exam_id: str
    document_id: Optional[str] = None
    questions: list[Question]
    time_limit: int


class UploadResponse(BaseModel):
    document_id: str
    filenames: list[str]
    num_pages: int
    message: str


class DocumentContextResponse(BaseModel):
    document_id: str
    filenames: list[str]
    num_sections: int
    merged_content: str


class UpdateContextRequest(BaseModel):
    content: str


class IdeasResponse(BaseModel):
    ideas: str


class FeedbackRequest(BaseModel):
    exam_id: str
    feedback: str


class AnalysisRequest(BaseModel):
    details: list[dict[str, Any]]


class RequirementsResponse(BaseModel):
    document_id: str
    requirements: list[str]


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
    code_snippet: Optional[str] = None


class GradeResponse(BaseModel):
    score: int
    gradable: int
    total: int
    percentage: float
    details: list[QuestionResult]
