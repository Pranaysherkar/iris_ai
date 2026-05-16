"""O(1) per-token domain spell corrections (hash map)."""

from __future__ import annotations

import re

# Whole-word replacements — extend as you discover common typos.
TOKEN_SPELL_MAP: dict[str, str] = {
    "temprature": "temperature",
    "temperture": "temperature",
    "tempature": "temperature",
    "wether": "weather",
    "weater": "weather",
    "forcast": "forecast",
    "forcaste": "forecast",
    "humdity": "humidity",
    "exchage": "exchange",
    "curreny": "currency",
}

_WORD_RE = re.compile(r"\b[\w']+\b", re.UNICODE)


def apply_spell_map(text: str) -> str:
    """Replace known misspellings token-by-token. Preserves non-word characters."""
    if not text or not TOKEN_SPELL_MAP:
        return text

    def repl(match: re.Match[str]) -> str:
        token = match.group(0)
        lower = token.lower()
        fixed = TOKEN_SPELL_MAP.get(lower)
        if not fixed:
            return token
        if token.isupper():
            return fixed.upper()
        if token[0].isupper():
            return fixed.capitalize()
        return fixed

    return _WORD_RE.sub(repl, text)
