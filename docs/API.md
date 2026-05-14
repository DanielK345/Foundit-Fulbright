# API Reference

## Health

`GET /health`

Returns backend status and CORS origins.

## Upload Documents

`POST /upload`

Multipart form field: `files`

Supported files: `pdf`, `pptx`, `docx`, `txt`, `md`

Response:

```json
{
  "document_id": "...",
  "filenames": ["lecture.pdf"],
  "num_pages": 12,
  "document_types": {"lecture.pdf": "slides"},
  "quality_report": {},
  "message": "Successfully parsed 12 sections from 1 file"
}
```

## Get Document Context

`GET /upload/{document_id}/context`

Returns merged extracted content and quality metadata.

## Get Document Sections

`GET /upload/{document_id}/sections`

Returns normalized sections with content, source labels, document type, extraction method, and quality metadata.

## Update Document Sections

`PUT /upload/{document_id}/sections`

Request:

```json
{
  "sections": [
    {
      "filename": "lecture.pdf",
      "source": "page_1",
      "source_label": "lecture.pdf - page_1",
      "document_type": "slides",
      "content": "reviewed content"
    }
  ]
}
```

Rebuilds quality metrics, concepts, concept chunks, and FAISS retrieval.
Also rebuilds the course map and clears old blueprints.

## Update Document Context

`PUT /upload/{document_id}/context`

Request:

```json
{"content": "edited study content"}
```

Rebuilds concepts and the retrieval index from the edited content.

## Get Course Map

`GET /upload/{document_id}/course-map`

Returns the structured review map used to control generation:

```json
{
  "document_id": "...",
  "course_map": {
    "course_title": "Deep Learning",
    "units": [
      {
        "unit_id": "unit_1",
        "title": "Neural Network Foundations",
        "importance": "high",
        "included": true,
        "concepts": [
          {
            "concept_id": "concept_1",
            "name": "Backpropagation",
            "learning_objectives": ["Apply the chain rule in backpropagation."],
            "exam_likelihood": "high",
            "included": true
          }
        ]
      }
    ],
    "ignored_material": [{"source": "slide_2", "reason": "course logistics"}]
  }
}
```

## Update Course Map

`PUT /upload/{document_id}/course-map`

Request:

```json
{"course_map": {"course_title": "...", "units": [], "ignored_material": []}}
```

Saves user edits such as including/excluding units, concepts, and priorities.

## Generate Blueprint

`POST /generate-blueprint`

Request:

```json
{
  "config": {
    "document_id": "...",
    "mcq": 5,
    "true_false": 3,
    "short_answer": 2,
    "difficulty": "medium",
    "study_goal": "test_review",
    "question_style": "mixed",
    "bloom_levels": ["understand", "apply"]
  }
}
```

Returns a question plan built from the selected course map.

## Get Blueprint

`GET /blueprint/{blueprint_id}`

Returns a stored blueprint from in-memory document state.

## Get Concepts

`GET /upload/{document_id}/concepts`

Returns extracted concept objects.

## Get Quality Report

`GET /upload/{document_id}/quality`

Returns section count, low-quality section count, extraction methods, file types, and warnings.

## Generate Exam

`POST /generate`

Request:

```json
{
  "document_id": "...",
  "time_limit": 30,
  "mcq": 5,
  "true_false": 3,
  "short_answer": 2,
  "difficulty": "medium",
  "focus": "threads and concurrency",
  "bloom_levels": ["understand", "apply"],
  "source_types": ["slides", "homework"],
  "study_goal": "test_review",
  "question_style": "mixed",
  "selected_unit_ids": [],
  "selected_concept_ids": []
}
```

The backend reads the course map, creates or reuses a blueprint, generates questions from blueprint items, validates grounding, and rejects low-quality generic questions.

Response includes questions with `unit_title`, `learning_objective`, `concept`, `document_type`, `bloom_level`, and `evidence`.

## Get Exam

`GET /exam/{exam_id}`

Returns a generated exam.

## Grade Exam

`POST /grade`

Request:

```json
{
  "exam_id": "...",
  "answers": {"0": "A", "1": "False"}
}
```

Response includes score, details, concept breakdown, and weak concepts.

## Generate Weak-Area Practice

`POST /practice/weak-areas`

Request:

```json
{"exam_id": "...", "count": 5}
```

Returns a new exam focused on concepts missed in the latest grading result.

## Error Format

Errors use FastAPI's standard shape:

```json
{"detail": "Human-readable error message"}
```
