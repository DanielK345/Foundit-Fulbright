import os

import numpy as np
import faiss
from services.ai_provider import embed_texts as provider_embed_texts, embed_query as provider_embed_query


def embed_texts(texts: list[str]) -> np.ndarray:
    """Generate embeddings for a list of texts using the configured provider."""
    return provider_embed_texts(texts, task_type="retrieval_document")


def embed_query(query: str) -> np.ndarray:
    """Generate embedding for a single query."""
    return provider_embed_query(query)


def build_faiss_index(chunks: list[dict], document_id: str) -> tuple[faiss.IndexFlatIP, list[dict]]:
    """Build a FAISS index from chunks and save it."""
    texts = [c["content"] for c in chunks]

    # Embed in batches of 100 (Gemini batch limit)
    all_embeddings = []
    batch_size = 100
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        embeddings = embed_texts(batch)
        all_embeddings.append(embeddings)

    embeddings_matrix = np.vstack(all_embeddings)

    # Normalize for cosine similarity
    faiss.normalize_L2(embeddings_matrix)

    # Build index
    dimension = embeddings_matrix.shape[1]
    index = faiss.IndexFlatIP(dimension)  # Inner product = cosine sim after normalization
    index.add(embeddings_matrix)

    # Save index to disk
    store_dir = "faiss_stores"
    os.makedirs(store_dir, exist_ok=True)
    faiss.write_index(index, os.path.join(store_dir, f"{document_id}.index"))

    return index, chunks
