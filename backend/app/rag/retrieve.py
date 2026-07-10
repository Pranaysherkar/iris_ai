"""Retrieve grounded document context for chat when files are attached/@mentioned."""

from __future__ import annotations

import logging
from typing import List, Optional, Sequence

from app.core.config import settings
from app.rag.embeddings import embed_query
from app.rag.mentions import parse_attachment_mentions, resolve_attachment_ids
from app.rag import qdrant_store
from app.rag.types import RetrievedChunk
from app.repositories.attachments_repository import attachments_repository

logger = logging.getLogger(__name__)


def collect_target_attachment_ids(
    *,
    user_id: str,
    conversation_id: Optional[str],
    user_message: str,
    explicit_ids: Sequence[str] | None,
) -> List[str]:
    """
    RAG only when the user attaches and/or @mentions a file.
    Explicit IDs from the request always count; mentions resolve against
    ready attachments in the conversation (and explicit IDs' siblings).
    """
    mentions = parse_attachment_mentions(user_message)
    has_explicit = bool(explicit_ids)
    has_mentions = bool(mentions)
    if not has_explicit and not has_mentions:
        return []

    # Build filename map from conversation-scoped ready attachments
    rows = attachments_repository.list_ready_for_user(
        user_id,
        conversation_id=conversation_id,
        limit=100,
    )
    filename_to_id = {}
    for r in rows:
        name = (r.get("file_name") or "").strip()
        if name:
            filename_to_id[name] = str(r["id"])

    # Also include any explicit IDs that may live outside this conversation
    for raw in explicit_ids or []:
        row = attachments_repository.get_owned(str(raw), user_id)
        if row and row.get("ingestion_status") == "ready":
            name = (row.get("file_name") or "").strip()
            if name:
                filename_to_id[name] = str(row["id"])

    resolved = resolve_attachment_ids(
        explicit_ids=explicit_ids,
        mentions=mentions,
        filename_to_id=filename_to_id,
    )

    # Keep only ready + owned
    ready: List[str] = []
    for aid in resolved:
        row = attachments_repository.get_owned(aid, user_id)
        if row and row.get("ingestion_status") == "ready":
            ready.append(aid)
        elif row and row.get("ingestion_status") in ("pending", "processing"):
            logger.info("rag_skip_not_ready attachment=%s status=%s", aid, row.get("ingestion_status"))
    return ready


def retrieve_for_chat(
    *,
    user_id: str,
    query: str,
    attachment_ids: Sequence[str],
    top_k: Optional[int] = None,
) -> List[RetrievedChunk]:
    if not settings.RAG_ENABLED or not attachment_ids or not (query or "").strip():
        return []
    vector = embed_query(query.strip())
    return qdrant_store.search_chunks(
        user_id=user_id,
        query_vector=vector,
        attachment_ids=list(attachment_ids),
        top_k=top_k,
    )


def format_document_context(chunks: Sequence[RetrievedChunk]) -> str:
    """Compact grounded block for the LLM (cite file + chunk index)."""
    if not chunks:
        return ""
    lines: List[str] = []
    for i, c in enumerate(chunks, start=1):
        label = c.file_name or c.attachment_id[:8]
        lines.append(
            f"[{i}] file={label!r} chunk={c.chunk_index} score={c.score:.3f}\n{c.content}"
        )
    return "\n\n".join(lines)
