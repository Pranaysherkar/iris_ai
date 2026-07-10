"""Shared RAG data structures."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class TextChunk:
    """One overlapping window of document text ready for embedding."""

    index: int
    content: str
    char_start: int
    char_end: int
    token_estimate: int


@dataclass(frozen=True)
class RetrievedChunk:
    """A vector-search hit with payload metadata for grounding."""

    attachment_id: str
    chunk_index: int
    content: str
    score: float
    file_name: Optional[str] = None
    conversation_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ExtractionResult:
    text: str
    source: str  # llamaparse | gemini_vision | local_txt | local_docx
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class MentionMatch:
    """Parsed @mention from user text (filename stem or attachment UUID)."""

    raw: str
    start: int
    end: int
    attachment_id: Optional[str] = None
    file_name_query: Optional[str] = None
