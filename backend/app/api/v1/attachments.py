"""Attachment upload / status / delete API."""

from __future__ import annotations

import logging
from typing import Annotated, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.api.v1.deps import get_current_user_id
from app.core.config import settings
from app.core.supabase import get_supabase_admin_client
from app.rag.ingest import process_attachment
from app.rag.mime_types import is_allowed_upload
from app.rag import qdrant_store
from app.repositories.attachments_repository import attachments_repository
from app.repositories.chat_repository import chat_repository

router = APIRouter()
logger = logging.getLogger(__name__)


class AttachmentOut(BaseModel):
    id: str
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    type: Optional[str] = None
    file_size_bytes: Optional[int] = None
    ingestion_status: str
    conversation_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    metadata: Optional[dict] = None


def _to_out(row: dict) -> AttachmentOut:
    return AttachmentOut(
        id=str(row["id"]),
        file_name=row.get("file_name"),
        mime_type=row.get("mime_type"),
        type=row.get("type"),
        file_size_bytes=row.get("file_size_bytes"),
        ingestion_status=row.get("ingestion_status") or "pending",
        conversation_id=row.get("conversation_id"),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
        metadata=row.get("metadata"),
    )


@router.post("/attachments", response_model=AttachmentOut)
async def upload_attachment(
    background_tasks: BackgroundTasks,
    user_id: Annotated[str, Depends(get_current_user_id)],
    file: UploadFile = File(...),
    conversation_id: Optional[str] = Form(None),
):
    if not settings.RAG_ENABLED:
        raise HTTPException(status_code=503, detail="RAG is disabled")

    if conversation_id:
        # Ensure conversation belongs to user (creates nothing — must exist)
        chat_repository.resolve_conversation_id(user_id, conversation_id)

    raw = await file.read()
    ok, mime, _atype = is_allowed_upload(file.filename, file.content_type)
    if not ok or not mime:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type. Allowed: PDF, PNG, JPEG, WEBP, DOCX, TXT.",
        )

    row = attachments_repository.upload_to_storage(
        user_id=user_id,
        conversation_id=conversation_id,
        file_name=file.filename or "upload",
        data=raw,
        mime_type=mime,
    )
    aid = str(row["id"])
    background_tasks.add_task(process_attachment, aid, user_id)
    logger.info(
        "attachment_uploaded id=%s user=%s mime=%s bytes=%s",
        aid,
        user_id,
        mime,
        len(raw),
    )
    return _to_out(row)


@router.get("/attachments/{attachment_id}", response_model=AttachmentOut)
async def get_attachment(
    attachment_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
):
    row = attachments_repository.get_owned(attachment_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return _to_out(row)


@router.get("/attachments", response_model=List[AttachmentOut])
async def list_attachments(
    user_id: Annotated[str, Depends(get_current_user_id)],
    conversation_id: str,
):
    rows = attachments_repository.list_for_conversation(user_id, conversation_id)
    return [_to_out(r) for r in rows]


@router.delete("/attachments/{attachment_id}")
async def delete_attachment(
    attachment_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
):
    row = attachments_repository.soft_delete(attachment_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Best-effort cleanup of vectors + storage object
    try:
        qdrant_store.delete_by_attachment(user_id=user_id, attachment_id=str(row["id"]))
    except Exception as exc:
        logger.warning("qdrant_delete_failed attachment=%s err=%s", attachment_id, exc)

    try:
        supabase = get_supabase_admin_client()
        supabase.storage.from_(row["bucket"]).remove([row["object_path"]])
    except Exception as exc:
        logger.warning("storage_delete_failed attachment=%s err=%s", attachment_id, exc)

    return {"ok": True, "id": str(row["id"])}
