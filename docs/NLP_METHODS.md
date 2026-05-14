# NLP Methods

## OCR and Vision-Based Extraction

The parser first uses local text extraction. If content is sparse, OCR and vision extraction can recover text or describe visual information from diagrams and image-heavy slides.

## Concept Extraction

The system converts raw sections into concepts with summaries, definitions, examples, prerequisites, related concepts, and evidence. This gives the project a structured knowledge layer instead of treating all uploaded text as one blob.

## Embeddings and Retrieval

Concept chunks are embedded with Ollama `nomic-embed-text` by default and stored in FAISS. Exam generation retrieves the most relevant concept chunks for the user's focus, difficulty, Bloom levels, and source mix.

## Retrieval-Augmented Generation

The generator only receives retrieved concept evidence. Each question must include a concept, source, document type, Bloom level, and evidence.

## Bloom Taxonomy

Questions can target `remember`, `understand`, `apply`, and `analyze`. This makes practice more useful than simple recall quizzes.

## Semantic Similarity Grading

Short answers are graded with embeddings first. Clear matches and clear misses avoid extra LLM calls. Ambiguous answers use an LLM grading fallback.

## Weak Concept Diagnosis

Grading results are grouped by concept. Missed concepts become recommendations and can drive adaptive follow-up practice.
