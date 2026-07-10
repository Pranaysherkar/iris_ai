"""Gemini embedding client (gemini-embedding-001 @ 1536)."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import List, Sequence

from google import genai
from google.genai import types

from app.core.config import settings

logger = logging.getLogger(__name__)

# Gemini embed API accepts batches; keep modest to avoid payload limits.
_BATCH_SIZE = 32


@lru_cache(maxsize=1)
def _client() -> genai.Client:
    key = (settings.GEMINI_API_KEY or "").strip()
    if not key:
        raise RuntimeError("GEMINI_API_KEY is required for RAG embeddings")
    return genai.Client(api_key=key)


def embed_texts(
    texts: Sequence[str],
    *,
    task_type: str = "RETRIEVAL_DOCUMENT",
) -> List[List[float]]:
    """
    Embed one or more strings. Returns vectors aligned with ``texts``.
    Empty strings become zero vectors of EMBEDDING_DIMENSIONS.
    """
    if not texts:
        return []

    dim = settings.EMBEDDING_DIMENSIONS
    model = settings.EMBEDDING_MODEL
    out: List[List[float]] = [[] for _ in texts]
    pending_idx: List[int] = []
    pending_text: List[str] = []

    for i, t in enumerate(texts):
        s = (t or "").strip()
        if not s:
            out[i] = [0.0] * dim
        else:
            pending_idx.append(i)
            pending_text.append(s)

    client = _client()
    for batch_start in range(0, len(pending_text), _BATCH_SIZE):
        batch = pending_text[batch_start : batch_start + _BATCH_SIZE]
        idxs = pending_idx[batch_start : batch_start + _BATCH_SIZE]
        config = types.EmbedContentConfig(
            task_type=task_type,
            output_dimensionality=dim,
        )
        # API accepts a list of contents for batch embed.
        response = client.models.embed_content(
            model=model,
            contents=batch if len(batch) > 1 else batch[0],
            config=config,
        )
        embeddings = list(response.embeddings or [])
        if len(batch) == 1 and len(embeddings) == 1:
            values = list(embeddings[0].values or [])
            if len(values) != dim:
                raise RuntimeError(
                    f"Embedding dim mismatch: got {len(values)}, expected {dim}"
                )
            out[idxs[0]] = values
            continue
        if len(embeddings) != len(batch):
            # Fallback: embed one-by-one if batch shape unexpected
            logger.warning(
                "embed_batch_size_mismatch expected=%s got=%s; falling back",
                len(batch),
                len(embeddings),
            )
            for j, text in enumerate(batch):
                one = client.models.embed_content(
                    model=model,
                    contents=text,
                    config=config,
                )
                emb = (one.embeddings or [None])[0]
                values = list(getattr(emb, "values", None) or [])
                if len(values) != dim:
                    raise RuntimeError(
                        f"Embedding dim mismatch: got {len(values)}, expected {dim}"
                    )
                out[idxs[j]] = values
            continue
        for j, emb in enumerate(embeddings):
            values = list(emb.values or [])
            if len(values) != dim:
                raise RuntimeError(
                    f"Embedding dim mismatch: got {len(values)}, expected {dim}"
                )
            out[idxs[j]] = values

    return out


def embed_query(text: str) -> List[float]:
    vectors = embed_texts([text], task_type="RETRIEVAL_QUERY")
    return vectors[0] if vectors else [0.0] * settings.EMBEDDING_DIMENSIONS
