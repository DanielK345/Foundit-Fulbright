# Evaluation

## Evaluation Goals

Evaluate whether the system produces grounded, useful practice questions from mixed course materials.

## Dataset

Use CS211 lecture slides, syllabus/readings, homework-style prompts, and at least one image-heavy slide deck.

## Metrics

- Extraction coverage: percentage of sections with usable content.
- Low-quality section rate: percentage flagged for review.
- Question grounding rate: percentage of questions with valid evidence.
- Duplicate question rate: percentage rejected as near-duplicates.
- Concept coverage: number of concepts represented in an exam.
- Short-answer grading accuracy: agreement with manually labeled examples.
- Latency and API use: local embeddings compared with Gemini embeddings.

## Baselines

- Old full-context Gemini generation.
- Current concept-aware RAG pipeline.

## Results Table

| Experiment | Grounding Rate | Duplicate Rate | Concept Coverage | Notes |
| --- | ---: | ---: | ---: | --- |
| Full-context generation | TBD | TBD | TBD | Baseline |
| Concept-aware RAG | TBD | TBD | TBD | Improved pipeline |

## Local Evaluation Helper

Use `backend/services/evaluator.py` to compute document and exam metrics from backend state. The standalone script can print metrics for ids available in the current backend memory.

```bash
cd backend
python evaluate_demo.py --document-id DOCUMENT_ID
python evaluate_demo.py --exam-id EXAM_ID
```

Because the demo backend stores data in memory, these ids must exist in the running process.

## Error Analysis

Track common failures:

- weak OCR on visual slides
- vague concepts from sparse materials
- unsupported generated questions
- overly easy distractors
- short-answer false positives

## Discussion

The expected improvement is not just more questions, but better traceability: every question should connect back to a concept and evidence from student-provided materials.
