import os
import numpy as np
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

EMBEDDING_MODEL = "models/gemini-embedding-001"


def embed_query(query: str) -> np.ndarray:
    """Generate embedding for a single query."""
    result = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=query,
        task_type="retrieval_query",
    )
    return np.array(result["embedding"], dtype=np.float32).reshape(1, -1)
