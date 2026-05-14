# Test Cases

## Backend Unit Tests

- Parser accepts `pdf`, `pptx`, `docx`, `txt`, and `md`.
- Parser returns normalized sections with `content`, `source_label`, `document_type`, and `content_quality`.
- Concept extractor returns concepts with evidence and source ids.
- Course map ignores logistics, project instructions, course intros, agenda-only slides, and job-market sections.
- Course map extracts units, concepts, learning objectives, and ignored material from course slides.
- Blueprint generator selects included high-value concepts only.
- Embedder returns vectors through Ollama or Gemini fallback.
- FAISS retrieval returns relevant concept chunks.
- Validator rejects questions with missing evidence, missing concept, malformed MCQ options, or duplicate wording.
- Quality judge rejects generic prompts such as `Which statement is best supported`.
- Quality judge rejects generic distractors such as `unrelated to the course`.
- Grader returns score, details, concept breakdown, and weak concepts.

## Backend Integration Tests

- Upload a lecture PDF and generate a broad review exam.
- Upload homework plus readings and generate homework-focused practice.
- Edit extracted context and confirm concepts are rebuilt.
- Update reviewed sections and confirm concepts are rebuilt.
- Grade an exam with correct MCQ, wrong true/false, and paraphrased short answer.
- Generate weak-area practice after grading.

## Frontend Manual Tests

- Upload mixed files and confirm accepted extensions.
- Review course map units, concepts, learning objectives, ignored material, and quality warnings.
- Relabel a section from `unknown` to `homework` and save review.
- Include/exclude a unit or concept and save the course map.
- Select Bloom levels, study goal, question style, and source mix in config.
- Confirm exam questions show unit, concept, learning objective, source type, and Bloom level.
- Submit answers and confirm evidence and weak concepts appear.
- Click `Practice Weak Areas` and confirm a new exam loads.

## NLP Quality Tests

- Question grounding rate: each generated question should include supporting evidence.
- Concept coverage: generated questions should cover multiple concepts when available.
- Duplicate rate: repeated questions should be rejected.
- Short-answer grading: correct paraphrases should score higher than unrelated answers.

## Failure Case Tests

- Unsupported upload extension returns a clear error.
- Low-text slides produce quality warnings.
- Reviewed sections can be saved and used for generation.
- Missing Ollama falls back to Gemini embeddings when a Gemini key exists.
- Missing document or exam id returns `404`.
