"""Split streaming LLM tokens into TTS-ready sentence chunks."""

from __future__ import annotations

_SENTENCE_ENDINGS = (".", "!", "?", "。", "！", "？")


def sentence_complete(buffer: str, *, min_chars: int = 15) -> bool:
    stripped = buffer.strip()
    if len(stripped) < min_chars:
        return False
    return any(stripped.endswith(end) for end in _SENTENCE_ENDINGS)


def flush_sentence(buffer: str, *, min_chars: int = 15) -> tuple[str | None, str]:
    """Return (completed_sentence_or_none, remaining_buffer)."""
    stripped = buffer.strip()
    if not stripped:
        return None, ""

    if sentence_complete(buffer, min_chars=min_chars):
        return stripped, ""

    if len(stripped) >= min_chars and stripped[-1] in ",;:":
        return stripped.rstrip(",;:") + ".", ""

    return None, buffer


def flush_remainder(buffer: str, *, min_chars: int = 8) -> str | None:
    """Flush trailing text at end of LLM stream."""
    stripped = buffer.strip()
    if len(stripped) < min_chars:
        return None
    return stripped
