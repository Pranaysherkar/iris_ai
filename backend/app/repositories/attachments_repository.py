"""Attachments repository (Supabase service role)."""

from __future__ import annotations

import hashlib
import logging
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Sequence
from uuid import UUID, uuid4

from fastapi import HTTPException

from app.core.config import settings
from app.core.supabase import get_supabase_admin_client

if TYPE_CHECKING:
    from app.rag.types import TextChunk

logger = logging.getLogger(__name__)


def _uuid(value: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid UUID") from exc


class AttachmentsRepository:
    def create_pending(
        self,
        *,
        user_id: str,
        conversation_id: Optional[str],
        attachment_type: str,
        bucket: str,
        object_path: str,
        file_name: str,
        mime_type: str,
        file_size_bytes: int,
        sha256: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        attachment_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        supabase = get_supabase_admin_client()
        row: Dict[str, Any] = {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "type": attachment_type,
            "bucket": bucket,
            "object_path": object_path,
            "file_name": file_name,
            "mime_type": mime_type,
            "file_size_bytes": file_size_bytes,
            "sha256": sha256,
            "ingestion_status": "pending",
            "metadata": metadata or {},
        }
        if attachment_id:
            row["id"] = _uuid(attachment_id)
        resp = supabase.table("attachments").insert(row).execute()
        if not resp.data:
            raise HTTPException(status_code=500, detail="Failed to create attachment row")
        return resp.data[0]

    def get_owned(self, attachment_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        supabase = get_supabase_admin_client()
        aid = _uuid(attachment_id)
        resp = (
            supabase.table("attachments")
            .select("*")
            .eq("id", aid)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        return resp.data[0] if resp.data else None

    def create_signed_preview_url(
        self,
        attachment_id: str,
        user_id: str,
        *,
        expires_in: int = 300,
    ) -> Dict[str, Any]:
        """Return a short-lived Storage URL for in-app preview (owner only)."""
        row = self.get_owned(attachment_id, user_id)
        if not row:
            raise HTTPException(status_code=404, detail="Attachment not found")
        bucket = row.get("bucket")
        object_path = row.get("object_path")
        if not bucket or not object_path:
            raise HTTPException(status_code=404, detail="Attachment file missing")

        expires = max(60, min(int(expires_in), 3600))
        supabase = get_supabase_admin_client()
        try:
            signed = supabase.storage.from_(str(bucket)).create_signed_url(
                str(object_path),
                expires,
            )
        except Exception as exc:
            logger.warning(
                "signed_url_failed attachment=%s err=%s",
                attachment_id,
                exc,
            )
            raise HTTPException(
                status_code=502,
                detail="Could not create preview link",
            ) from exc

        url = None
        if isinstance(signed, dict):
            url = signed.get("signedURL") or signed.get("signedUrl") or signed.get("signed_url")
        if not url or not isinstance(url, str):
            raise HTTPException(status_code=502, detail="Could not create preview link")

        return {
            "url": url,
            "file_name": row.get("file_name"),
            "mime_type": row.get("mime_type"),
            "type": row.get("type"),
            "expires_in": expires,
        }

    def list_for_conversation(
        self,
        user_id: str,
        conversation_id: str,
        *,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        supabase = get_supabase_admin_client()
        cid = _uuid(conversation_id)
        resp = (
            supabase.table("attachments")
            .select(
                "id,file_name,mime_type,type,file_size_bytes,ingestion_status,"
                "conversation_id,message_id,created_at,updated_at,metadata"
            )
            .eq("user_id", user_id)
            .eq("conversation_id", cid)
            .is_("deleted_at", "null")
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return list(resp.data or [])

    def list_ready_for_user(
        self,
        user_id: str,
        *,
        conversation_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        supabase = get_supabase_admin_client()
        q = (
            supabase.table("attachments")
            .select("id,file_name,mime_type,ingestion_status,conversation_id")
            .eq("user_id", user_id)
            .eq("ingestion_status", "ready")
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .limit(limit)
        )
        if conversation_id:
            q = q.eq("conversation_id", _uuid(conversation_id))
        resp = q.execute()
        return list(resp.data or [])

    def update_status(
        self,
        attachment_id: str,
        user_id: str,
        *,
        status: str,
        metadata_patch: Optional[Dict[str, Any]] = None,
    ) -> None:
        supabase = get_supabase_admin_client()
        aid = _uuid(attachment_id)
        row = self.get_owned(aid, user_id)
        if not row:
            return
        meta = dict(row.get("metadata") or {})
        if metadata_patch:
            meta.update(metadata_patch)
        (
            supabase.table("attachments")
            .update({"ingestion_status": status, "metadata": meta})
            .eq("id", aid)
            .eq("user_id", user_id)
            .execute()
        )

    def mark_ready(
        self,
        attachment_id: str,
        user_id: str,
        *,
        extracted_text: str,
        metadata_patch: Optional[Dict[str, Any]] = None,
    ) -> None:
        supabase = get_supabase_admin_client()
        aid = _uuid(attachment_id)
        row = self.get_owned(aid, user_id)
        if not row:
            return
        meta = dict(row.get("metadata") or {})
        if metadata_patch:
            meta.update(metadata_patch)
        (
            supabase.table("attachments")
            .update(
                {
                    "ingestion_status": "ready",
                    "extracted_text": extracted_text,
                    "metadata": meta,
                }
            )
            .eq("id", aid)
            .eq("user_id", user_id)
            .execute()
        )

    def link_to_message(
        self,
        *,
        user_id: str,
        message_id: str,
        attachment_ids: Sequence[str],
        conversation_id: Optional[str] = None,
    ) -> None:
        """Associate uploaded files with the user message that referenced them."""
        if not attachment_ids:
            return
        supabase = get_supabase_admin_client()
        mid = _uuid(message_id)
        cid = _uuid(conversation_id) if conversation_id else None
        for raw_id in attachment_ids:
            try:
                aid = _uuid(str(raw_id))
            except HTTPException:
                continue
            row = self.get_owned(aid, user_id)
            if not row:
                continue
            if cid and row.get("conversation_id") and str(row["conversation_id"]) != cid:
                continue
            patch: Dict[str, Any] = {"message_id": mid}
            if cid and not row.get("conversation_id"):
                patch["conversation_id"] = cid
            (
                supabase.table("attachments")
                .update(patch)
                .eq("id", aid)
                .eq("user_id", user_id)
                .is_("deleted_at", "null")
                .execute()
            )

    def relink_message_attachments(
        self,
        *,
        user_id: str,
        from_message_id: str,
        to_message_id: str,
        conversation_id: Optional[str] = None,
    ) -> None:
        """Move attachment links from an edited user message to its new sibling."""
        supabase = get_supabase_admin_client()
        src = _uuid(from_message_id)
        dst = _uuid(to_message_id)
        if src == dst:
            return
        q = (
            supabase.table("attachments")
            .update({"message_id": dst})
            .eq("user_id", user_id)
            .eq("message_id", src)
            .is_("deleted_at", "null")
        )
        if conversation_id:
            q = q.eq("conversation_id", _uuid(conversation_id))
        q.execute()

    def soft_delete(self, attachment_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        from datetime import datetime, timezone

        supabase = get_supabase_admin_client()
        row = self.get_owned(attachment_id, user_id)
        if not row:
            return None
        now = datetime.now(timezone.utc).isoformat()
        (
            supabase.table("attachments")
            .update({"deleted_at": now, "deleted_by": user_id})
            .eq("id", row["id"])
            .eq("user_id", user_id)
            .execute()
        )
        return row

    def replace_pg_chunks(
        self,
        *,
        attachment_id: str,
        user_id: str,
        conversation_id: Optional[str],
        chunks: Sequence[TextChunk],
    ) -> None:
        """Best-effort mirror in document_chunks (vectors live in Qdrant)."""
        supabase = get_supabase_admin_client()
        aid = _uuid(attachment_id)
        supabase.table("document_chunks").delete().eq("attachment_id", aid).execute()
        if not chunks:
            return
        rows = []
        for c in chunks:
            rows.append(
                {
                    "attachment_id": aid,
                    "user_id": user_id,
                    "conversation_id": conversation_id,
                    "chunk_index": c.index,
                    "content": c.content,
                    "token_count": c.token_estimate,
                    "metadata": {
                        "char_start": c.char_start,
                        "char_end": c.char_end,
                    },
                }
            )
        # Insert in batches
        batch = 50
        for i in range(0, len(rows), batch):
            supabase.table("document_chunks").insert(rows[i : i + batch]).execute()

    def upload_to_storage(
        self,
        *,
        user_id: str,
        conversation_id: Optional[str],
        file_name: str,
        data: bytes,
        mime_type: str,
    ) -> Dict[str, Any]:
        """Upload bytes to Supabase Storage and insert pending attachment row."""
        ok_size = len(data)
        if ok_size <= 0:
            raise HTTPException(status_code=400, detail="Empty file")
        if ok_size > settings.RAG_MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds max size ({settings.RAG_MAX_UPLOAD_BYTES} bytes)",
            )

        attachment_id = str(uuid4())
        safe_name = (file_name or "upload").replace("/", "_").replace("\\", "_")[:180]
        conv_part = conversation_id or "library"
        object_path = f"{user_id}/{conv_part}/{attachment_id}/{safe_name}"
        bucket = settings.SUPABASE_STORAGE_BUCKET
        sha = hashlib.sha256(data).hexdigest()

        supabase = get_supabase_admin_client()
        supabase.storage.from_(bucket).upload(
            object_path,
            data,
            file_options={"content-type": mime_type, "upsert": "false"},
        )

        from app.rag.mime_types import attachment_type_for_mime

        try:
            return self.create_pending(
                user_id=user_id,
                conversation_id=conversation_id,
                attachment_type=attachment_type_for_mime(mime_type),
                bucket=bucket,
                object_path=object_path,
                file_name=safe_name,
                mime_type=mime_type,
                file_size_bytes=ok_size,
                sha256=sha,
                metadata={"original_name": file_name},
                attachment_id=attachment_id,
            )
        except Exception:
            # Roll back orphaned storage object on DB failure
            try:
                supabase.storage.from_(bucket).remove([object_path])
            except Exception as cleanup_exc:
                logger.warning("storage_rollback_failed path=%s err=%s", object_path, cleanup_exc)
            raise


attachments_repository = AttachmentsRepository()
