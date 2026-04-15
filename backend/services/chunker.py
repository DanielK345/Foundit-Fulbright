import re


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~0.75 tokens per word for English."""
    return int(len(text.split()) * 1.3)


def _split_into_sentences(text: str) -> list[str]:
    """Split text into sentences on common delimiters."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if s.strip()]


def chunk_pages(pages: list[dict], chunk_size: int = 400, overlap: int = 50) -> list[dict]:
    """
    Split parsed pages into chunks of ~chunk_size tokens with overlap.
    Each chunk preserves its source reference.
    """
    chunks = []
    chunk_counter = 0

    for page in pages:
        source = page["source"]
        text = page["content"].strip()
        if not text:
            continue

        # Clean up whitespace noise
        text = re.sub(r'\s+', ' ', text)

        sentences = _split_into_sentences(text)
        if not sentences:
            continue

        current_chunk_sentences = []
        current_tokens = 0

        for sentence in sentences:
            sentence_tokens = _estimate_tokens(sentence)

            if current_tokens + sentence_tokens > chunk_size and current_chunk_sentences:
                # Emit current chunk
                chunk_text = " ".join(current_chunk_sentences)
                chunks.append({
                    "chunk_id": f"chunk_{chunk_counter}",
                    "filename": page.get("filename"),
                    "source": source,
                    "source_label": page.get("source_label", source),
                    "content": chunk_text,
                })
                chunk_counter += 1

                # Keep overlap: take sentences from the end of the current chunk
                overlap_sentences = []
                overlap_tokens = 0
                for s in reversed(current_chunk_sentences):
                    s_tokens = _estimate_tokens(s)
                    if overlap_tokens + s_tokens > overlap:
                        break
                    overlap_sentences.insert(0, s)
                    overlap_tokens += s_tokens

                current_chunk_sentences = overlap_sentences
                current_tokens = overlap_tokens

            current_chunk_sentences.append(sentence)
            current_tokens += sentence_tokens

        # Emit remaining chunk
        if current_chunk_sentences:
            chunk_text = " ".join(current_chunk_sentences)
            chunks.append({
                "chunk_id": f"chunk_{chunk_counter}",
                "filename": page.get("filename"),
                "source": source,
                "source_label": page.get("source_label", source),
                "content": chunk_text,
            })
            chunk_counter += 1

    return chunks
