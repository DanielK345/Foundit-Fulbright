from pydantic import BaseModel
from typing import Optional


class ExamConfig(BaseModel):
    document_id: str
    time_limit: int = 30  # minutes
    mcq: int = 5
    true_false: int = 3
    short_answer: int = 2
    difficulty: str = "medium"
    focus: Optional[str] = None


class Question(BaseModel):
    type: str  # "mcq", "true_false", "short_answer"
    question: str
    options: Optional[list[str]] = None
    answer: str
    explanation: str
    source: str


class ExamResponse(BaseModel):
    exam_id: str
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


class GradeResponse(BaseModel):
    score: int
    gradable: int
    total: int
    percentage: float
    details: list[QuestionResult]
