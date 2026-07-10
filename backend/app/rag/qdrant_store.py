"""Qdrant vector store for document chunks (tenant-scoped by user_id)."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any, Dict, List, Optional, Sequence
from uuid import UUID, uuid5

from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

from app.core.config import settings
from app.rag.types import RetrievedChunk, TextChunk

logger = logging.getLogger(__name__)

# Stable namespace so (attachment_id, chunk_index) → deterministic point UUID.
_POINT_NS = UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")


def point_id_for(attachment_id: str, chunk_index: int) -> str:
    return str(uuid5(_POINT_NS, f"{attachment_id}:{chunk_index}"))


@lru_cache(maxsize=1)
def get_qdrant_client() -> QdrantClient:
    return QdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY,
        timeout=60,
    )


def ensure_collection() -> None:
    """Idempotent: create collection + payload indexes if missing."""
    client = get_qdrant_client()
    name = settings.QDRANT_COLLECTION
    dim = settings.EMBEDDING_DIMENSIONS
    existing = {c.name for c in client.get_collections().collections}
    if name not in existing:
        client.create_collection(
            collection_name=name,
            vectors_config=qm.VectorParams(size=dim, distance=qm.Distance.COSINE),
        )
        logger.info("qdrant_collection_created name=%s dim=%s", name, dim)

    for field, schema in (
        ("user_id", qm.PayloadSchemaType.KEYWORD),
        ("attachment_id", qm.PayloadSchemaType.KEYWORD),
        ("conversation_id", qm.PayloadSchemaType.KEYWORD),
    ):
        try:
            client.create_payload_index(
                collection_name=name,
                field_name=field,
                field_schema=schema,
            )
        except Exception as exc:
            # Already exists is fine
            logger.debug("qdrant_index_skip field=%s err=%s", field, exc)


def upsert_chunks(
    *,
    user_id: str,
    attachment_id: str,
    conversation_id: Optional[str],
    file_name: Optional[str],
    chunks: Sequence[TextChunk],
    vectors: Sequence[Sequence[float]],
) -> int:
    if len(chunks) != len(vectors):
        raise ValueError("chunks and vectors length mismatch")
    if not chunks:
        return 0

    ensure_collection()
    client = get_qdrant_client()
    points: List[qm.PointStruct] = []
    for chunk, vector in zip(chunks, vectors):
        payload: Dict[str, Any] = {
            "user_id": user_id,
            "attachment_id": attachment_id,
            "chunk_index": chunk.index,
            "content": chunk.content,
            "token_count": chunk.token_estimate,
            "char_start": chunk.char_start,
            "char_end": chunk.char_end,
        }
        if conversation_id:
            payload["conversation_id"] = conversation_id
        if file_name:
            payload["file_name"] = file_name
        points.append(
            qm.PointStruct(
                id=point_id_for(attachment_id, chunk.index),
                vector=list(vector),
                payload=payload,
            )
        )

    # Batch upsert (Qdrant handles large batches; keep ~64 for safety)
    batch = 64
    for i in range(0, len(points), batch):
        client.upsert(
            collection_name=settings.QDRANT_COLLECTION,
            points=points[i : i + batch],
            wait=True,
        )
    return len(points)


def delete_by_attachment(*, user_id: str, attachment_id: str) -> None:
    ensure_collection()
    client = get_qdrant_client()
    client.delete(
        collection_name=settings.QDRANT_COLLECTION,
        points_selector=qm.FilterSelector(
            filter=qm.Filter(
                must=[
                    qm.FieldCondition(
                        key="user_id",
                        match=qm.MatchValue(value=user_id),
                    ),
                    qm.FieldCondition(
                        key="attachment_id",
                        match=qm.MatchValue(value=attachment_id),
                    ),
                ]
            )
        ),
        wait=True,
    )


def search_chunks(
    *,
    user_id: str,
    query_vector: Sequence[float],
    attachment_ids: Sequence[str],
    top_k: Optional[int] = None,
) -> List[RetrievedChunk]:
    """
    Cosine search restricted to the caller's tenant and selected attachments.
    Uses a Filter (AND of user_id + attachment_id IN ...) — O(log n) ANN + filter.
    """
    if not attachment_ids:
        return []
    ensure_collection()
    client = get_qdrant_client()
    k = top_k or settings.RAG_TOP_K
    must: List[qm.Condition] = [
        qm.FieldCondition(key="user_id", match=qm.MatchValue(value=user_id)),
        qm.FieldCondition(
            key="attachment_id",
            match=qm.MatchAny(any=list(attachment_ids)),
        ),
    ]
    hits = client.query_points(
        collection_name=settings.QDRANT_COLLECTION,
        query=list(query_vector),
        query_filter=qm.Filter(must=must),
        limit=k,
        with_payload=True,
    )
    results: List[RetrievedChunk] = []
    for hit in hits.points:
        payload = hit.payload or {}
        content = str(payload.get("content") or "")
        if not content:
            continue
        results.append(
            RetrievedChunk(
                attachment_id=str(payload.get("attachment_id") or ""),
                chunk_index=int(payload.get("chunk_index") or 0),
                content=content,
                score=float(hit.score or 0.0),
                file_name=payload.get("file_name"),
                conversation_id=payload.get("conversation_id"),
                metadata={
                    "token_count": payload.get("token_count"),
                    "char_start": payload.get("char_start"),
                    "char_end": payload.get("char_end"),
                },
            )
        )
    return results
