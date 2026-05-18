"""
Two-Stage BM25 Retrieval Service

For long documents (textbooks, homework sets, external readings) this service
avoids sending the entire document to the LLM by selecting only the most
relevant chunks.

Stage 1 — Structural pass:
    Always include pages that contain numbered problems / exercises so that
    homework-style exam questions are never missed.

Stage 2 — BM25 topic pass:
    Topics are extracted from the content summarizer output (or the user's
    focus text) and used as BM25 queries. Top-k chunks per topic are merged
    and deduplicated.

For short documents (≤ FULL_CONTEXT_THRESHOLD pages) the caller should send
the full context directly — this service is only for long-form material.
"""

import re
from rank_bm25 import BM25Okapi
from config import (
    BM25_FULL_CONTEXT_THRESHOLD as FULL_CONTEXT_THRESHOLD,
    BM25_MIN_RETRIEVAL_CHUNKS as MIN_RETRIEVAL_CHUNKS,
    BM25_TOP_K_PER_TOPIC,
    BM25_MAX_TOTAL,
)

# Regex that matches homework / exercise block headers.
_HW_PATTERN = re.compile(
    r"\b(problem|exercise|question|q\.?|hw|homework|assignment|task)\s*\d+",
    re.IGNORECASE,
)

# Broad fallback queries when no focus text is available.
_DEFAULT_QUERIES = [
    "key concept definition theorem",
    "important formula algorithm equation",
    "example application method",
    "procedure step process",
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> list[str]:
    """Lowercase alphanumeric tokenizer — fast and sufficient for BM25."""
    return re.findall(r"[a-zA-Z0-9]+", text.lower())


def _extract_topics(focus_text: str) -> list[str]:
    """
    Parse a block of focus text (typically the content summarizer output or
    the user's focus field) into individual query strings.

    Handles:
    - Bullet / dash / numbered lists
    - Plain paragraphs (split on sentence boundaries)
    """
    if not focus_text or not focus_text.strip():
        return []

    topics: list[str] = []
    for line in focus_text.splitlines():
        # Strip leading bullet markers, numbering, and whitespace.
        clean = re.sub(r"^[\s\-\*\u2022\u2023\u25e6\d\.:\)]+", "", line).strip()
        if len(clean) > 8:
            topics.append(clean)

    # If the text has no bullet structure, split on sentence boundaries.
    if not topics:
        topics = [
            s.strip()
            for s in re.split(r"[.;]\s+", focus_text)
            if len(s.strip()) > 8
        ]

    return topics[:20]  # cap to keep query count reasonable


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def should_use_retrieval(pages: list[dict]) -> bool:
    """Return True when the document is long enough to benefit from BM25."""
    return len(pages) > FULL_CONTEXT_THRESHOLD


def retrieve_chunks(
    pages: list[dict],
    focus_text: str | None = None,
    top_k_per_topic: int = BM25_TOP_K_PER_TOPIC,
    max_total: int = BM25_MAX_TOTAL,
) -> list[dict]:
    """
    Return the most relevant pages for exam generation.

    Parameters
    ----------
    pages:
        The original parsed pages (before any user edits).
    focus_text:
        Text from the content summarizer or user's focus field.
        Used to extract BM25 query topics.
    top_k_per_topic:
        How many chunks to pull per query topic.
    max_total:
        Hard cap on the total number of chunks returned.

    Returns
    -------
    A deduplicated, source-order-sorted list of relevant chunks, or the
    original pages list if retrieval yields too few results (fallback).
    """
    if not pages:
        return pages

    corpus = [_tokenize(p.get("content", "")) for p in pages]
    bm25 = BM25Okapi(corpus)

    seen: set[int] = set()
    selected: list[dict] = []

    # ── Stage 1: structural homework / exercise detection ──────────────────
    for i, page in enumerate(pages):
        if _HW_PATTERN.search(page.get("content", "")):
            seen.add(i)
            selected.append(page)

    # ── Stage 2: BM25 per topic ────────────────────────────────────────────
    topics = _extract_topics(focus_text or "") or _DEFAULT_QUERIES

    for topic in topics:
        query_tokens = _tokenize(topic)
        if not query_tokens:
            continue

        scores = bm25.get_scores(query_tokens)
        # Sort indices by descending score; only keep chunks with a positive score.
        for idx in scores.argsort()[::-1]:
            if len(selected) - len(seen) >= top_k_per_topic:
                break
            idx = int(idx)
            if idx not in seen and scores[idx] > 0:
                seen.add(idx)
                selected.append(pages[idx])

    # ── Fallback: too few results → return all pages ───────────────────────
    if len(selected) < MIN_RETRIEVAL_CHUNKS:
        return pages

    # Restore reading order so the LLM sees content sequentially.
    page_order = {id(p): i for i, p in enumerate(pages)}
    selected.sort(key=lambda p: page_order.get(id(p), 0))

    return selected[:max_total]
