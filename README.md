# Exam Generator

A full-stack web application that generates high-quality exam questions from uploaded lecture materials (PDF / PPTX). Questions are strictly grounded in the uploaded content. A Two-Stage BM25 pipeline handles long documents efficiently without GPU embeddings, while a pair of LLM agents handle content summarization and post-exam result analysis.

## Pipeline Overview

### End-to-End Flow

```mermaid
flowchart TB
    subgraph Frontend
        A["UploadPage\n(PDF / PPTX)"] -->|POST /upload| B["ReviewIdeasPage\n(review & edit context)"]
        B -->|POST /generate| C["ConfigPage\n(exam settings)"]
        C -->|POST /generate| D["ExamPage\n(take exam)"]
        D -->|POST /grade| E["Results\n(score + analysis)"]
        E -->|"Re-generate\n(same materials)"| C
    end

    subgraph Backend ["Backend — Generation Pipeline"]
        direction TB
        U["Upload Route"] --> P["Parser\n(pdfplumber / python-pptx)"]
        P -->|"pages + original_pages\n{source, content}"| STORE["documents_store\n(in-memory)"]
        STORE -->|"> 15 pages?"| BM25{"BM25 Retrieval?"}
        BM25 -->|"yes — long doc"| R1["Stage 1: Structural\n(regex homework detection)"]
        R1 --> R2["Stage 2: BM25 per topic\n(rank_bm25, CPU-only)"]
        R2 -->|"top-20 pages\n(source order)"| GEN
        BM25 -->|"no — short doc\nfull context"| GEN["Generator\n(gemini-2.0-flash)"]
        GEN -->|"raw questions JSON"| VAL["Validator\n(structure + grounding + dedup)"]
        VAL -->|"rejected?"| RETRY{"Retry?\n(up to 2x,\nlower temp)"}
        RETRY -->|yes| GEN
        RETRY -->|no| EXAM["Exam stored\nin memory"]
    end

    subgraph Agents ["LLM Agents"]
        direction LR
        CS["Content Summarizer\ncontent_summarizer.py"]
        RA["Result Analyzer\nresult_analyzer.py"]
    end

    subgraph Grading ["Grading Pipeline"]
        direction TB
        GR_IN["Student answers"] --> MCQ_TF["MCQ / True-False\n(exact match)"]
        GR_IN --> SA["Short Answer"]
        SA --> S1["Stage 1: Embed + Cosine Similarity\n(gemini-embedding-001)"]
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
    B -->|GET ideas| CS
    C -->|ExamConfig + focus| BM25
    D -->|answers| GR_IN
    EXAM --> D
    SCORE --> E
    E -->|POST analyze| RA
    RA -->|"recommendations\n→ feedback_store"| C
```

### BM25 Retrieval Detail

Activated automatically when a document exceeds 15 pages (e.g. textbooks, homework sets).

```mermaid
flowchart LR
    PAGES["All original pages"] --> S1["Stage 1 — Structural\n(regex: problem / exercise / question + number)"]
    S1 -->|"always included"| MERGE
    PAGES --> S2["Stage 2 — BM25 per topic\n(topics extracted from focus text)"]
    S2 -->|"top-3 per topic, max 20 total"| MERGE["Deduplicate + restore\nsource order"]
    MERGE -->|"≥ 5 chunks?"| OK["Pass to Generator"]
    MERGE -->|"< 5 (sparse match)"| FB["Fallback: all pages"]
    FB --> OK
```

### Data Flow Through Services

```mermaid
flowchart LR
    PDF["PDF / PPTX\nfiles"] --> parser["parser.py\nparse_file()"]
    parser -->|"[{source, content}]"| bm25["bm25_retriever.py\nretrieve_chunks()"]
    bm25 -->|"relevant pages"| generator["generator.py\ngenerate_questions()"]
    generator -->|"raw questions"| validator["validator.py\nvalidate_questions()"]
    validator -->|"valid questions"| grader["grader.py\ngrade_exam()"]
    grader -->|"score + details"| result["GradeResponse"]
    grader -->|"graded details"| analyzer["result_analyzer.py\nanalyze_results()"]
    analyzer -->|"recommendations"| feedback_store["feedback_store\n(in-memory)"]
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

- **File Upload** — Accepts PDF and PPTX files (single or multiple); extracts text at page/slide level
- **Content Review** — Content Summarizer agent extracts key ideas before exam configuration; user can edit context
- **Two-Stage BM25 Retrieval** — For documents > 15 pages: Stage 1 targets structural homework/problem blocks via regex; Stage 2 uses BM25 (CPU-only, no GPU) to rank pages by topic relevance. Short documents use full context.
- **Question Generation** — Produces MCQ, True/False, Short Answer, and Coding questions via a strict prompt with per-type guidelines and anti-hallucination constraints; language always matches source material
- **Validation & Retry** — Every question is validated for structure, source grounding, and duplicates; retries with lower temperature on failure (up to 2×)
- **Hybrid Grading** — MCQ/True-False: exact match; Short Answer: cosine similarity fast filter → LLM fallback for inconclusive cases
- **Result Analysis Agent** — After grading, a Result Analyzer agent produces targeted improvement recommendations stored for the next exam
- **Additional Requirements** — Stored recommendations are shown on the config page and injected into the next generation prompt
- **Re-generate** — One-click re-generate from the same uploaded materials after reviewing results
- **Export JSON** — Download the full exam (questions, answers, grading details) as a JSON file
- **Interactive Exam UI** — Countdown timer, question navigation, coding question support

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python, FastAPI |
| LLM | Google Gemini (`gemini-2.0-flash`) |
| Embeddings | Gemini `gemini-embedding-001` (grading only) |
| Retrieval | BM25 via `rank-bm25` (CPU-only, no vector DB) |
| File Parsing | pdfplumber (PDF), python-pptx (PPTX) |
| Frontend | React, React Router, Axios |

## Project Structure

```
backend/
  app.py                  # FastAPI app entry point
  .env                    # GEMINI_API_KEY (not committed)
  requirements.txt
  routes/
    upload.py             # POST /upload, context management, ideas
    generate.py           # POST /generate, grading, analysis, requirements
  services/
    parser.py             # PDF + PPTX text extraction
    bm25_retriever.py     # Two-stage BM25 retrieval for long documents
    embedder.py           # Gemini embeddings (used by grader only)
    generator.py          # Question generation via Gemini
    validator.py          # Question validation (grounding, duplicates)
    grader.py             # Hybrid grading pipeline
  agents/
    content_summarizer.py # Extracts key concepts from uploaded material
    result_analyzer.py    # Analyzes graded results, produces recommendations
  models/
    schema.py             # Pydantic request/response models

frontend/
  src/
    App.js                # Router
    pages/
      UploadPage.jsx          # File upload
      UploadDashboardPage.jsx  # Upload history / dashboard
      ReviewIdeasPage.jsx      # Review & edit extracted content
      ConfigStudioPage.jsx     # Exam configuration + requirements sidebar
      ExamStudioPage.jsx       # Exam taking, grading, results, export
    components/
      Timer.jsx           # Countdown timer
      Question.jsx        # Question renderer (MCQ, T/F, Short Answer, Coding)
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

1. **Upload** — Upload one or more PDF / PPTX files
2. **Review** — The Content Summarizer agent extracts key ideas; edit the context if needed
3. **Configure** — Set question types, counts, difficulty, time limit, and an optional focus area
4. **Generate** — BM25 retrieval selects the most relevant pages; Gemini generates and validates questions
5. **Take the Exam** — Answer questions before the timer runs out
6. **Submit** — Get your score, correct answers, explanations, and grading feedback
7. **Analyze** — The Result Analyzer agent stores improvement recommendations for the next exam
8. **Re-generate or Export** — Re-run with the same materials, or download the exam as JSON

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/upload` | Upload PDF/PPTX files, returns `document_id` |
| `GET` | `/upload/{document_id}` | Get parsed document context |
| `PUT` | `/upload/{document_id}/context` | Update document context (post-review edit) |
| `GET` | `/upload/{document_id}/ideas` | Run Content Summarizer agent |
| `POST` | `/generate` | Generate exam from document + config |
| `GET` | `/exam/{exam_id}` | Retrieve a generated exam |
| `POST` | `/grade` | Grade an exam submission |
| `POST` | `/feedback` | Submit manual feedback for next exam |
| `POST` | `/exam/{exam_id}/analyze` | Run Result Analyzer agent, store recommendations |
| `GET` | `/requirements/{document_id}` | Get stored requirements for a document |
| `DELETE` | `/requirements/{document_id}` | Clear stored requirements |

## Short Answer Grading

Short answers use a hybrid two-stage pipeline to balance accuracy and cost:

1. **Stage 1 — Semantic Similarity (fast filter):**
   Embeds both student and reference answers using `gemini-embedding-001`, computes cosine similarity.
   - `> 0.85` — marked correct (no LLM call)
   - `< 0.50` — marked incorrect (no LLM call)
   - `0.50–0.85` — inconclusive, sent to Stage 2

2. **Stage 2 — LLM Grading (fallback):**
   Calls Gemini with a strict grading prompt. Only used when similarity is inconclusive.

## License

MIT
