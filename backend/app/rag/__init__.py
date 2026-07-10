"""RAG package: ingest, retrieve, and grounding helpers."""

from app.rag.retrieve import (
    collect_target_attachment_ids,
    format_document_context,
    retrieve_for_chat,
)

__all__ = [
    "collect_target_attachment_ids",
    "format_document_context",
    "retrieve_for_chat",
]
