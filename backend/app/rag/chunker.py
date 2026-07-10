"""
Sliding-window document chunker with semantic boundary preference.

Algorithm (greedy + backtrack):
1. Advance a window of ~chunk_size chars with ~overlap.
2. Prefer cut at paragraph (\\n\\n), then sentence (.!?), then whitespace.
3. Overlap is taken from the end of the previous chunk (suffix).
"""

from __future__ import annotations

from typing import List

from app.rag.types import TextChunk

# Approximate tokens ≈ chars / 4 for English-ish prose (used for metadata only).
_CHARS_PER_TOKEN = 4.0

_SENTENCE_END = frozenset(".!?;")


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, int(round(len(text) / _CHARS_PER_TOKEN)))


def _best_cut(text: str, start: int, hard_end: int, min_end: int) -> int:
    """
    Find the best split point in [min_end, hard_end] looking backward from hard_end.
    Prefer paragraph break, then sentence end, then whitespace.
    """
    if hard_end >= len(text):
        return len(text)
    window = text[start:hard_end]
    # Paragraph: last double newline in the second half of the window
    search_from = max(0, (hard_end - start) // 2)
    para = window.rfind("\n\n", search_from)
    if para != -1 and start + para + 2 >= min_end:
        return start + para + 2

    # Sentence end near the end of the window
    for i in range(len(window) - 1, search_from - 1, -1):
        ch = window[i]
        if ch in _SENTENCE_END:
            nxt = i + 1
            if nxt < len(window) and (window[nxt].isspace() or window[nxt] == "\n"):
                abs_pos = start + nxt + 1
                if abs_pos >= min_end:
                    return min(abs_pos, hard_end)

    # Whitespace
    for i in range(len(window) - 1, search_from - 1, -1):
        if window[i].isspace():
            abs_pos = start + i + 1
            if abs_pos >= min_end:
                return abs_pos

    return hard_end


def chunk_text(
    text: str,
    *,
    chunk_size: int = 1800,
    overlap: int = 220,
) -> List[TextChunk]:
    """
    Split ``text`` into overlapping windows.

    Complexity: O(n) character scans with small constant backtracks per chunk.
    """
    if not text or not text.strip():
        return []
    if chunk_size < 200:
        raise ValueError("chunk_size must be >= 200")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be in [0, chunk_size)")

    n = len(text)
    chunks: List[TextChunk] = []
    start = 0
    index = 0
    # Minimum progress per iteration to avoid infinite loops on pathological input.
    min_advance = max(1, chunk_size - overlap)

    while start < n:
        # Skip leading whitespace on a new window (except first char of doc already trimmed).
        while start < n and text[start] in " \t":
            start += 1
        if start >= n:
            break

        hard_end = min(start + chunk_size, n)
        min_end = start + min(min_advance, hard_end - start)
        end = _best_cut(text, start, hard_end, min_end) if hard_end < n else n

        content = text[start:end].strip()
        if content:
            chunks.append(
                TextChunk(
                    index=index,
                    content=content,
                    char_start=start,
                    char_end=end,
                    token_estimate=estimate_tokens(content),
                )
            )
            index += 1

        if end >= n:
            break

        # Next window starts overlap chars before end (suffix reuse).
        next_start = max(0, end - overlap)
        if next_start <= start:
            next_start = start + min_advance
        start = next_start

    return chunks
