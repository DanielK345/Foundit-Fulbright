# Demo Script

## Demo Goal

Show that this is a student practice system, not only a quiz generator.

## Before the Demo

- Start Ollama.
- Start backend on `http://localhost:8010`.
- Start frontend on `http://localhost:3000`.
- Prepare mixed materials: slides, homework, notes, and a reading.

## Step 1: Upload Materials

Upload multiple file types and explain that the app accepts mixed academic sources.

## Step 2: Review Extraction

Show extraction quality, low-content warnings, section source types, editable extracted text, and concept count.

## Step 3: Configure Practice

Select source mix, Bloom levels, difficulty, and question counts.

## Step 4: Take Exam

Answer some questions correctly and intentionally miss a few.

## Step 5: Review Results

Show score, evidence, explanations, and weak concepts.

## Step 6: Adaptive Practice

Click `Practice Weak Areas` and show the new targeted practice set.

## Talking Points

- The system combines slides, readings, homework, notes, and previous tests through a concept layer.
- Local embeddings reduce API usage.
- Questions are grounded with evidence.
- Weak concept diagnosis makes it useful for students studying for tests.

## Backup Plan

If Gemini is slow, show previously generated outputs and explain the local embedding/RAG architecture.
