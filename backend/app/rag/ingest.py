"""Background ingest: download → extract → chunk → embed → Qdrant + status."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.core.config import settings
from app.core.supabase import get_supabase_admin_client
from app.rag.chunker import chunk_text
from app.rag.embeddings import embed_texts
from app.rag.extract import extract_document_text
from app.rag import qdrant_store
from app.repositories.attachments_repository import attachments_repository

logger = logging.getLogger(__name__)


def _download_bytes(bucket: str, object_path: str) -> bytes:
    supabase = get_supabase_admin_client()
    data = supabase.storage.from_(bucket).download(object_path)
    if not data:
        raise RuntimeError(f"Empty download for {bucket}/{object_path}")
    return bytes(data)


def process_attachment(attachment_id: str, user_id: str) -> None:
    """
    Full ingest pipeline for one attachment. Safe to call from BackgroundTasks.
    Updates ingestion_status: processing → ready | failed.
    """
    if not settings.RAG_ENABLED:
        logger.info("rag_disabled skip attachment=%s", attachment_id)
        return

    row = attachments_repository.get_owned(attachment_id, user_id)
    if not row:
        logger.warning("ingest_missing attachment=%s user=%s", attachment_id, user_id)
        return

    if row.get("ingestion_status") == "ready":
        logger.info("ingest_already_ready attachment=%s", attachment_id)
        return

    attachments_repository.update_status(
        attachment_id,
        user_id,
        status="processing",
        metadata_patch={"ingest_error": None},
    )

    try:
        raw = _download_bytes(row["bucket"], row["object_path"])
        mime = row.get("mime_type") or "application/octet-stream"
        file_name = row.get("file_name") or "document"

        extraction = extract_document_text(raw, mime=mime, file_name=file_name)
        chunks = chunk_text(
            extraction.text,
            chunk_size=settings.RAG_CHUNK_SIZE_CHARS,
            overlap=settings.RAG_CHUNK_OVERLAP_CHARS,
        )
        if not chunks:
            raise RuntimeError("No chunks produced from extracted text")

        # Remove prior vectors (re-ingest / retry)
        try:
            qdrant_store.delete_by_attachment(user_id=user_id, attachment_id=attachment_id)
        except Exception as exc:
            logger.debug("qdrant_delete_prior_skip: %s", exc)

        vectors = embed_texts([c.content for c in chunks], task_type="RETRIEVAL_DOCUMENT")
        n = qdrant_store.upsert_chunks(
            user_id=user_id,
            attachment_id=attachment_id,
            conversation_id=row.get("conversation_id"),
            file_name=file_name,
            chunks=chunks,
            vectors=vectors,
        )

        # Persist a short preview in extracted_text (cap for DB size)
        preview = extraction.text[:50_000]
        meta: Dict[str, Any] = {
            "extract_source": extraction.source,
            "chunk_count": n,
            "char_count": len(extraction.text),
            **(extraction.metadata or {}),
        }
        attachments_repository.mark_ready(
            attachment_id,
            user_id,
            extracted_text=preview,
            metadata_patch=meta,
        )
        # Optional: mirror chunk rows in Postgres for audit (best-effort)
        try:
            attachments_repository.replace_pg_chunks(
                attachment_id=attachment_id,
                user_id=user_id,
                conversation_id=row.get("conversation_id"),
                chunks=chunks,
            )
        except Exception as exc:
            logger.warning("pg_chunks_mirror_failed attachment=%s err=%s", attachment_id, exc)

        logger.info(
            "ingest_ready attachment=%s chunks=%s source=%s",
            attachment_id,
            n,
            extraction.source,
        )
    except Exception as exc:
        logger.exception("ingest_failed attachment=%s", attachment_id)
        attachments_repository.update_status(
            attachment_id,
            user_id,
            status="failed",
            metadata_patch={"ingest_error": str(exc)[:500]},
        )
