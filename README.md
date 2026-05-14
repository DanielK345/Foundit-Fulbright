# Adaptive Exam Practice Generator

An AI-assisted study system for students. The app turns course materials into grounded practice exams, grades responses, diagnoses weak concepts, and generates follow-up practice.

Unlike a generic quiz prompt, this project builds a structured course map first: uploaded files are parsed, classified, filtered, grouped into units and concepts, converted into an exam blueprint, and then used as evidence for question generation.

## Key Features

- Upload mixed study materials: `pdf`, `pptx`, `docx`, `txt`, and `md`
- Classify files as slides, homework, readings, notes, previous tests, or unknown
- Extract concepts and source evidence from all materials
- Build a course map with units, learning objectives, priorities, and ignored logistics
- Generate an exam blueprint before writing questions
- Use local Ollama embeddings with FAISS retrieval
- Generate grounded MCQ, true/false, and short-answer questions from learning objectives
- Reject generic or unsupported questions with a quality judge
- Tag questions by unit, concept, learning objective, source type, difficulty, and Bloom level
- Grade answers and diagnose weak concepts
- Generate adaptive practice from weak areas

## Tech Stack

- Backend: FastAPI, Pydantic, FAISS, pdfplumber, python-pptx, python-docx, Tesseract OCR
- AI: Gemini for generation/vision, Ollama for local embeddings and optional local text generation
- Frontend: React, React Router, Axios

## Installation

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_key
AI_TEXT_PROVIDER=gemini
AI_EMBED_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=bge-m3
OLLAMA_TEXT_MODEL=llama3.1:8b
OLLAMA_EXTRACT_MODEL=llama3.1:8b
OLLAMA_QUESTION_MODEL=llama3.1:8b
OLLAMA_JUDGE_MODEL=llama3.1:8b
OLLAMA_NUM_CTX=4096
OLLAMA_KEEP_ALIVE=10m
ENABLE_LOCAL_COURSE_MAP_REFINEMENT=false
GEMINI_MODEL=gemini-2.0-flash
CORS_ORIGINS=http://localhost:3000
```

Install local Ollama models:

```bash
ollama pull bge-m3
ollama pull qwen3:14b
```

For a 12GB RTX 3080, `qwen3:14b` is the stronger local text model to try first. If it is too slow, use `llama3.1:8b` for the text/extract/judge models and keep `bge-m3` for embeddings.

Run the API:

```bash
cd backend
python -m uvicorn app:app --host 0.0.0.0 --reload --port 8010
```

### Frontend

```bash
cd frontend
npm install
npm start
```

Open `http://localhost:3000`.

## Usage

1. Upload slides, homework, readings, notes, or previous tests.
2. Review the course map: units, important concepts, learning objectives, and ignored material.
3. Configure question counts, difficulty, Bloom levels, study goal, question style, and source mix.
4. Take the generated practice exam.
5. Review score, evidence, explanations, and weak concepts.
6. Generate weak-area practice.

## Testing

Backend:

```bash
cd backend
python -m pytest ../tests -v
```

Frontend:

```bash
cd frontend
npm test
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Test Cases](docs/TEST_CASES.md)
- [NLP Methods](docs/NLP_METHODS.md)
- [Evaluation](docs/EVALUATION.md)
- [Demo Script](docs/DEMO_SCRIPT.md)
- [Limitations](docs/LIMITATIONS.md)
