"""Normalize user-visible text before persistence and model calls."""

import unicodedata


def normalize_text(content: str) -> str:
    """Trim whitespace and apply Unicode NFC (stable, deterministic)."""
    if not content:
        return ""
    return unicodedata.normalize("NFC", content.strip())
