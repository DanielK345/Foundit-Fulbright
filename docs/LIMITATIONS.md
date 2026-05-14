# Limitations

## Current Limitations

- Data is stored in memory, so uploaded materials and exams disappear when the backend restarts.
- Source type classification is heuristic; the review page lets users correct section labels.
- Concept extraction quality depends on model output and source quality.

## Model Limitations

- Local LLM generation may be weaker than Gemini generation.
- Gemini Vision may still be needed for image-heavy slides.
- OCR can fail on low-resolution screenshots or complex diagrams.

## Data Limitations

- The project does not yet include real student answer data.
- Evaluation currently depends on team-created examples.

## Deployment Limitations

- Ollama must be installed locally for local embeddings.
- Tesseract must be installed separately for OCR support.

## Future Improvements

- Persistent database storage.
- User accounts and long-term learning history.
- Better concept graph visualization.
- URL ingestion and image uploads.
- Instructor mode for reviewing and editing generated question banks.
