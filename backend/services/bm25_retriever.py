"""
Two-Stage BM25 Retrieval Service

Only activates for documents exceeding FULL_CONTEXT_THRESHOLD pages (default: 200).
Typical lecture sets fit under the threshold and receive full context.

For large documents (textbooks, comprehensive reading packs) two strategies apply:

Strategy A — Topic-guided (preferred):
    When `focus_text` is provided (user focus field or stored main_ideas from the
    review step), topics are extracted from it and used as BM25 queries.
    Top-k chunks per topic are merged and deduplicated.

Strategy B — Source-stratified (fallback when no focus_text):
    Divide the budget equally across source files so every uploaded file
    contributes proportionally to the context.  Within each file, BM25 ranks
    chunks by generic informativeness and the top-k are selected.
    This prevents any single file from dominating the context window.
"""

import re
from collections import defaultdict
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

# Generic informativeness queries used within each file for source-stratified mode.
# These are intentionally broad so BM25 ranks by content density, not topic bias.
_INFORMATIVENESS_QUERIES = [
    "definition concept key term",
    "algorithm process method steps",
    "example illustration case",
    "formula equation property rule",
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

    When `focus_text` is provided → topic-guided BM25 (Strategy A).
    When `focus_text` is absent  → source-stratified selection (Strategy B).

    In both cases:
    - Pages matching homework/exercise patterns are always included first.
    - Results are capped at `max_total` and returned in original reading order.
    - Falls back to the full page list if retrieval yields too few results.
    """
    if not pages:
        return pages

    seen: set[int] = set()
    selected: list[dict] = []

    # ── Stage 1: always include exercise / homework pages ─────────────────
    for i, page in enumerate(pages):
        if _HW_PATTERN.search(page.get("content", "")):
            seen.add(i)
            selected.append(page)

    remaining_budget = max_total - len(selected)
    if remaining_budget <= 0:
        return _restore_order(selected, pages)[:max_total]

    # ── Stage 2: topic-guided vs source-stratified ────────────────────────
    topics = _extract_topics(focus_text or "")

    if topics:
        # Strategy A: BM25 queries from focus text / stored ideas
        selected += _topic_guided(pages, seen, topics, top_k_per_topic, remaining_budget)
    else:
        # Strategy B: proportional per-file selection
        selected += _source_stratified(pages, seen, remaining_budget)

    # ── Fallback ──────────────────────────────────────────────────────────
    if len(selected) < MIN_RETRIEVAL_CHUNKS:
        return pages

    return _restore_order(selected, pages)[:max_total]


def _topic_guided(
    pages: list[dict],
    seen: set[int],
    topics: list[str],
    top_k_per_topic: int,
    budget: int,
) -> list[dict]:
    """BM25 retrieval driven by extracted topic queries."""
    corpus = [_tokenize(p.get("content", "")) for p in pages]
    bm25 = BM25Okapi(corpus)
    result: list[dict] = []

    for topic in topics:
        query_tokens = _tokenize(topic)
        if not query_tokens:
            continue
        scores = bm25.get_scores(query_tokens)
        added = 0
        for idx in scores.argsort()[::-1]:
            if added >= top_k_per_topic or len(result) >= budget:
                break
            idx = int(idx)
            if idx not in seen and scores[idx] > 0:
                seen.add(idx)
                result.append(pages[idx])
                added += 1

    return result


def _source_stratified(
    pages: list[dict],
    seen: set[int],
    budget: int,
) -> list[dict]:
    """
    Divide `budget` equally across source files, then within each file
    rank pages by BM25 informativeness and take the top allocation.

    This guarantees every uploaded file contributes to the context regardless
    of how BM25 scores compare across files — preventing topic bias.
    """
    # Group unseen pages by source file
    groups: dict[str, list[tuple[int, dict]]] = defaultdict(list)
    for i, page in enumerate(pages):
        if i not in seen:
            key = page.get("filename") or page.get("source_label", "unknown")
            groups[key].append((i, page))

    if not groups:
        return []

    per_file = max(1, budget // len(groups))
    result: list[dict] = []

    for filename, indexed_pages in groups.items():
        file_pages = [p for _, p in indexed_pages]
        corpus = [_tokenize(p.get("content", "")) for p in file_pages]

        if not any(corpus):
            continue

        bm25_file = BM25Okapi(corpus)
        # Score each page against all informativeness queries combined
        combined_scores = [0.0] * len(file_pages)
        for q in _INFORMATIVENESS_QUERIES:
            qtokens = _tokenize(q)
            if qtokens:
                scores = bm25_file.get_scores(qtokens)
                for j, s in enumerate(scores):
                    combined_scores[j] += s

        # Take top `per_file` by combined score
        ranked = sorted(range(len(file_pages)), key=lambda j: combined_scores[j], reverse=True)
        added = 0
        for j in ranked:
            if added >= per_file:
                break
            orig_idx, page = indexed_pages[j]
            if orig_idx not in seen:
                seen.add(orig_idx)
                result.append(page)
                added += 1

    return result


def _restore_order(selected: list[dict], pages: list[dict]) -> list[dict]:
    """Sort selected pages back into their original reading order."""
    page_order = {id(p): i for i, p in enumerate(pages)}
    return sorted(selected, key=lambda p: page_order.get(id(p), 0))
