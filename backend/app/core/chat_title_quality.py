"""Defer low-value first turns; filter generic LLM titles; extractive fallbacks."""

from __future__ import annotations

import re
from typing import Optional

from app.core.greeting import is_likely_greeting_only_user_message
from app.core.text_normalize import normalize_text

# User message looks like idle chat / rapport — defer title until a later turn.
_SUBSTANTIVE_HINT = re.compile(
    r"\b("
    r"write|explain|code|implement|difference|versus|vs\.?|essay|tutorial|problem|debug|fix|compare|solve|formula|error|crash|degree|MBA|MCA|B\.?Tech|M\.?Tech"
    r"|salary|interview|project|deploy|Docker|Kubernetes|database|algorithm|regex|REST|graphql|React|Vue|Angular|Python|Java|Rust|typescript|kubernetes"
    r"|bug|feature|architecture|lesson|quiz|exam|study|derivative|calculate|analyze|diagram|research|summarize"
    r")\b",
    re.IGNORECASE,
)

_SMALLTALK_PHRASES = (
    "how are you",
    "how're you",
    "how r you",
    "how are u",
    "how was your day",
    "how's your day",
    "how is your day",
    "hope you had",
    "good day",
    "nice to meet",
    "who are you",
    "what are you",
    "what can you do",
    "tell me about yourself",
    "introduce yourself",
    "tell me something",
)


def should_defer_title_from_first_exchange(user_text: str) -> bool:
    """
    First user + first assistant reply: skip title generation for small-talk openers.

    Covers short greetings and longer lines like \"hey how are you\" without blocking
    real questions like \"after MCA which job role\".
    """
    if is_likely_greeting_only_user_message(user_text):
        return True
    t = normalize_text(user_text).strip()
    if not t:
        return True
    if _SUBSTANTIVE_HINT.search(t):
        return False
    low = t.lower()
    for phrase in _SMALLTALK_PHRASES:
        if phrase in low:
            return True
    wc = len(t.split())
    if wc <= 18 and len(t) <= 220:
        return True
    return False


_GENERIC_TITLE_SUBSTRINGS = (
    "introduction to assistant",
    "introduction to ai",
    "introducing",
    "general greeting",
    "general conversation",
    "conversation start",
    "start of conversation",
    "meet the assistant",
    "meet the ai",
    "chat assistant",
    "chat with assistant",
    "hello and welcome",
    "welcoming dialogue",
)


def _is_generic_fragment(tl: str) -> bool:
    for s in _GENERIC_TITLE_SUBSTRINGS:
        if s in tl:
            return True
    if tl in frozenset(
        (
            "assistant",
            "introduction",
            "greeting exchange",
            "small talk",
            "general chat",
            "how can i help",
        )
    ):
        return True
    return False


def is_low_quality_generated_title(title: str) -> bool:
    """Reject meta / boilerplate sidebar titles."""
    tl = normalize_text(title).lower().strip()
    if len(tl) < 3:
        return True
    if _is_generic_fragment(tl):
        return True
    # Only meta words (no topic)
    stop = frozenset(
        {
            "the",
            "a",
            "an",
            "to",
            "and",
            "or",
            "of",
            "for",
            "assistant",
            "assistant.",
            "ai",
            "bot",
            "chat",
            "conversation",
            "greeting",
            "introduction",
            "general",
            "help",
            "with",
            "you",
            "your",
            "my",
            "welcome",
            "iris",
            "hello",
            "hey",
            "today",
        }
    )
    words = [w.strip(".,:;!?") for w in tl.split() if w.strip(".,:;!?")]
    if not words:
        return True
    if len(words) <= 5 and sum(1 for w in words if w in stop or len(w) <= 3) >= len(words):
        return True  # shallow / meta-heavy short titles only
    return False


def extractive_title_from_user_question(
    text: str,
    *,
    max_words: int,
    max_chars: int,
) -> Optional[str]:
    """Fallback: first sentence clipped to words/characters."""
    mw = max(2, max_words)
    t = normalize_text(text)
    if not t:
        return None
    first = re.split(r"[.?!\n]\s*", t, maxsplit=1)[0].strip()
    if not first:
        first = t
    parts = first.split()
    if len(parts) > mw:
        parts = parts[:mw]
    out = " ".join(parts)
    if len(out) > max_chars:
        out = out[: max_chars - 1].rstrip() + "…"
    return out.strip() or None
