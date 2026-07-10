"""Normalize extracted document text before chunking."""

from __future__ import annotations

import re
import unicodedata

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_MULTI_NL = re.compile(r"\n{3,}")
_MULTI_SPACE = re.compile(r"[ \t]{2,}")
_PAGE_BREAK = re.compile(r"\f+")


def normalize_document_text(text: str) -> str:
    """
    Deterministic cleanup for RAG ingest:
    NFC, strip control chars, collapse whitespace, preserve paragraph breaks.
    """
    if not text:
        return ""
    t = unicodedata.normalize("NFC", text)
    t = _CTRL.sub("", t)
    t = _PAGE_BREAK.sub("\n\n", t)
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    lines = [_MULTI_SPACE.sub(" ", line).rstrip() for line in t.split("\n")]
    t = "\n".join(lines)
    t = _MULTI_NL.sub("\n\n", t)
    return t.strip()
