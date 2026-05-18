import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Exam Generator API")

allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
origins = [o.strip().rstrip("/") for o in allowed_origins.split(",")]
use_wildcard = origins == ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=not use_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure required directories exist
os.makedirs("uploads", exist_ok=True)

# In-memory stores
documents_store = {}       # document_id -> parsed data
exams_store = {}           # exam_id -> exam data
exam_doc_store = {}        # exam_id -> document_id
feedback_store = {}        # document_id -> list[str]

from routes.upload import router as upload_router
from routes.generate import router as generate_router

app.include_router(upload_router, prefix="/upload", tags=["upload"])
app.include_router(generate_router, tags=["generate"])


@app.get("/health")
def health():
    return {"status": "ok", "allowed_origins": origins}
