"""Detect trivial first messages so we defer sidebar title until a substantive exchange."""

from __future__ import annotations

import re

from app.core.text_normalize import normalize_text

_GREETING_ONLY = re.compile(
    r"^(hi|hey|hello+|hii|hola|yo|sup|howdy|greetings)[\s!.,?]*$"
    r"|^(good\s+(morning|afternoon|evening|night))[\s!.,?]*$"
    r"|^(what'?s\s+up)[\s!.,?]*$"
    r"|^(gm|ga|ge)[\s!.,?]*$",
    re.IGNORECASE,
)


def is_likely_greeting_only_user_message(text: str) -> bool:
    """
    True for very short, greeting-style openers (e.g. "hey", "hi", "hello").
    Substantive one-liners should return False.
    """
    t = normalize_text(text).strip()
    if not t or len(t) > 60:
        return False
    if _GREETING_ONLY.search(t):
        return True
    if len(t) <= 3 and t.lower() in {"hi", "yo", "👋"}:
        return True
    return False
