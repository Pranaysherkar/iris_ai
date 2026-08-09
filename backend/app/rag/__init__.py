"""RAG package: ingest, retrieve, and grounding helpers.

Keep this module free of eager imports that pull repositories (avoids
circular imports with attachments_repository → app.rag.types).
"""

from typing import Any

__all__ = [
    "collect_target_attachment_ids",
    "format_document_context",
    "retrieve_for_chat",
]


def __getattr__(name: str) -> Any:
    if name in __all__:
        from app.rag import retrieve as _retrieve

        return getattr(_retrieve, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
