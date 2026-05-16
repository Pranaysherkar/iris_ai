"""Extract user-stated facts with compiled regex — O(patterns) per message."""

from __future__ import annotations

import re
from typing import List, Tuple

FactPair = Tuple[str, str]

# (fact_key, pattern) — first capture group is value.
_FACT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "name",
        re.compile(
            r"\b(?:my name is|i am|i'm|im|call me|this is)\s+([A-Za-z]+(?:\s+[A-Za-z]+){0,3})\b",
            re.I,
        ),
    ),
    (
        "preferred_name",
        re.compile(r"\b(?:call me|nickname is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b", re.I),
    ),
    (
        "job",
        re.compile(
            r"\b(?:i work as|i'm a|i am a|my job is|my role is)\s+([a-z][a-z\s\-]{2,48})",
            re.I,
        ),
    ),
    (
        "framework",
        re.compile(
            r"\b(?:i use|i'm using|i am using|my stack includes?)\s+([A-Za-z0-9.#+\-]{2,32})",
            re.I,
        ),
    ),
    (
        "location",
        re.compile(
            r"\b(?:i live in|i'm from|i am from|based in)\s+([A-Za-z][A-Za-z\s\-]{2,48})",
            re.I,
        ),
    ),
    (
        "preference",
        re.compile(r"\b(?:i prefer|i like)\s+([a-z][a-z\s\-]{2,48})", re.I),
    ),
)

_REMEMBER_RE = re.compile(
    r"\bremember\s+(?:that\s+)?(.{3,120})",
    re.I,
)


def extract_facts(text: str) -> List[FactPair]:
    """Return deduplicated (key, value) pairs from a single user message."""
    if not text or len(text.strip()) < 3:
        return []

    seen: set[str] = set()
    out: List[FactPair] = []

    def add(key: str, value: str) -> None:
        v = value.strip().strip(".,!?")
        if not v or len(v) > 200:
            return
        dedupe = f"{key}:{v.lower()}"
        if dedupe in seen:
            return
        seen.add(dedupe)
        out.append((key, v))

    for key, pattern in _FACT_PATTERNS:
        m = pattern.search(text)
        if m:
            add(key, m.group(1))

    m_remember = _REMEMBER_RE.search(text)
    if m_remember:
        add("note", m_remember.group(1))

    return out
