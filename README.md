# Exam Generator

A full-stack web application that generates high-quality exam questions from uploaded lecture materials (PDF/PPTX) using Retrieval-Augmented Generation (RAG). Questions are strictly grounded in the uploaded content to minimize hallucination.

## Pipeline Overview

### End-to-End Flow

```mermaid
flowchart TB
    subgraph Frontend
        A["UploadPage\n(PDF / PPTX)"] -->|POST /upload| B["ConfigPage\n(exam settings)"]
        B -->|POST /generate| C["ExamPage\n(take exam)"]
        C -->|POST /grade| D["Results\n(score + feedback)"]
    end

    subgraph Backend ["Backend — RAG Pipeline"]
        direction TB
        U["Upload Route"] --> P["Parser\n(pdfplumber / python-pptx)"]
        P -->|"list of pages\n{source, content}"| CH["Chunker\n(token-based, 400 tok, 50 overlap)"]
        CH -->|"list of chunks\n{chunk_id, source, content}"| EM["Embedder\n(gemini-embedding-001)"]
        EM -->|"FAISS IndexFlatIP\n(cosine similarity)"| RE["Retriever\n(top-15 chunks)"]
        RE -->|"retrieved context"| GEN["Generator\n(gemini-2.0-flash)"]
        GEN -->|"raw questions JSON"| VAL["Validator\n(structure + grounding + dedup)"]
        VAL -->|"rejected?"| RETRY{"Retry?\n(up to 2x,\nlower temp)"}
        RETRY -->|yes| GEN
        RETRY -->|no| EXAM["Exam stored\nin memory"]
    end

    subgraph Grading ["Grading Pipeline"]
        direction TB
        GR_IN["Student answers"] --> MCQ_TF["MCQ / True-False\n(exact match)"]
        GR_IN --> SA["Short Answer"]
        SA --> S1["Stage 1: Embed + Cosine Similarity"]
        S1 -->|"> 0.85"| CORRECT["Correct"]
        S1 -->|"< 0.50"| WRONG["Incorrect"]
        S1 -->|"0.50 – 0.85"| S2["Stage 2: LLM Fallback\n(gemini-2.0-flash)"]
        S2 --> VERDICT["Correct / Incorrect\n+ feedback"]
        MCQ_TF --> SCORE["Final Score"]
        CORRECT --> SCORE
        WRONG --> SCORE
        VERDICT --> SCORE
    end

    A -->|files| U
    B -->|ExamConfig| RE
    C -->|answers| GR_IN
    EXAM --> C
    SCORE --> D
```

### Data Flow Through Services

```mermaid
flowchart LR
    PDF["PDF / PPTX\nfiles"] --> parser["parser.py\nparse_file()"]
    parser -->|"[{source, content}]"| chunker["chunker.py\nchunk_pages()"]
    chunker -->|"[{chunk_id, source, content}]"| embedder["embedder.py\nbuild_faiss_index()"]
    embedder -->|"FAISS index + chunks"| retriever["retriever.py\nretrieve_chunks()"]
    retriever -->|"top-K chunks + scores"| generator["generator.py\ngenerate_questions()"]
    generator -->|"raw questions"| validator["validator.py\nvalidate_questions()"]
    validator -->|"valid questions"| grader["grader.py\ngrade_exam()"]
    grader -->|"score + details"| result["GradeResponse"]
```

### Short Answer Grading Detail

```mermaid
flowchart TD
    INPUT["Student answer + Reference answer"] --> EMBED["Embed both\n(gemini-embedding-001)"]
    EMBED --> COS["Cosine Similarity"]
    COS --> HIGH{"sim > 0.85?"}
    HIGH -->|yes| C["CORRECT\n(no LLM call)"]
    HIGH -->|no| LOW{"sim < 0.50?"}
    LOW -->|yes| W["INCORRECT\n(no LLM call)"]
    LOW -->|no| LLM["LLM Fallback\n(gemini-2.0-flash\ntemp=0.1, JSON mode)"]
    LLM --> V["CORRECT / INCORRECT\n+ feedback"]

    style C fill:#dcfce7,stroke:#22c55e,color:#166534
    style W fill:#fef2f2,stroke:#ef4444,color:#991b1b
    style V fill:#dbeafe,stroke:#2563eb,color:#1e40af
```

## Features

- **File Upload** — Accepts PDF and PPTX files; extracts text at page/slide level
- **RAG Pipeline** — Chunks documents, embeds with Gemini, stores in FAISS, retrieves relevant context before generating questions
- **Question Generation** — Produces MCQ, True/False, and Short Answer questions using a strict prompt template with anti-hallucination constraints
- **Validation & Regeneration** — Validates every generated question against source context; retries with lower temperature on failure (up to 2 retries)
- **Interactive Exam UI** — Countdown timer, question navigation, and submit functionality
- **Hybrid Grading** — MCQ/True-False graded by exact match; Short answers graded via a two-stage pipeline (cosine similarity fast filter + LLM fallback)
- **Results Review** — Score, percentage, correct answers, explanations, and grading feedback

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python, FastAPI |
| LLM | Google Gemini (`gemini-2.0-flash`) |
| Embeddings | Gemini `gemini-embedding-001` |
| Vector DB | FAISS (in-memory, cosine similarity) |
| File Parsing | pdfplumber (PDF), python-pptx (PPTX) |
| Frontend | React, React Router, Axios |

## Project Structure

```
backend/
  app.py                  # FastAPI app entry point
  .env                    # GEMINI_API_KEY (not committed)
  requirements.txt
  routes/
    upload.py             # POST /upload
    generate.py           # POST /generate, GET /exam/:id, POST /grade
  services/
    parser.py             # PDF + PPTX text extraction
    chunker.py            # Token-based chunking with overlap
    embedder.py           # Gemini embeddings + FAISS index
    retriever.py          # FAISS similarity search
    generator.py          # Question generation via Gemini
    validator.py          # Question validation (grounding, duplicates)
    grader.py             # Hybrid grading pipeline
  models/
    schema.py             # Pydantic request/response models

frontend/
  src/
    App.js                # Router
    App.css               # Styles
    pages/
      UploadPage.jsx      # File upload with drag-and-drop
      ConfigPage.jsx      # Exam configuration form
      ExamPage.jsx        # Exam taking, grading, results
    components/
      Timer.jsx           # Countdown timer
      Question.jsx        # Question renderer (MCQ, T/F, Short Answer)
```

## Prerequisites

- Python 3.10+
- Node.js 16+
- A Google Gemini API key — get one at https://aistudio.google.com/apikey

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/DanielK345/Exam-generator.git
cd Exam-generator
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file (or edit the existing one) with your API key:

```
GEMINI_API_KEY=your-api-key-here
```

Start the server:

```bash
python -m uvicorn app:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. You can verify with:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

### 3. Frontend

```bash
cd frontend
npm install
npm start
```

The app will open at `http://localhost:3000`.

## Usage

1. **Upload** — Open the app and upload a PDF or PPTX file
2. **Configure** — Set the number of MCQ, True/False, and Short Answer questions, difficulty level, time limit, and optionally a focus area
3. **Generate** — Click "Generate Exam" and wait for the RAG pipeline to process
4. **Take the Exam** — Answer questions before the timer runs out
5. **Submit** — Get your score, correct answers, explanations, and grading feedback

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/upload` | Upload PDF/PPTX, returns `document_id` |
| `POST` | `/generate` | Generate exam from document + config |
| `GET` | `/exam/{exam_id}` | Retrieve a generated exam |
| `POST` | `/grade` | Grade an exam submission |

## Short Answer Grading

Short answers use a hybrid two-stage pipeline to balance accuracy and cost:

1. **Stage 1 — Semantic Similarity (fast filter):**
   Embeds both student and reference answers, computes cosine similarity.
   - `> 0.85` — marked correct (no LLM call)
   - `< 0.50` — marked incorrect (no LLM call)
   - `0.50–0.85` — inconclusive, sent to Stage 2

2. **Stage 2 — LLM Grading (fallback):**
   Calls Gemini with a strict grading prompt. Only used when similarity is inconclusive.

## License

MIT
