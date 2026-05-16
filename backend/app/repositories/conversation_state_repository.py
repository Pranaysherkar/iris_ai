"""Conversation summary + pending-tool state in existing conversations row."""

from __future__ import annotations

from typing import Any, Dict, Optional

from app.core.history_context import PENDING_TOOL_METADATA_KEY
from app.repositories.chat_repository import _validate_conversation_uuid
from app.core.supabase import get_supabase_admin_client

_MAX_SUMMARY_CHARS = 2_400


class ConversationStateRepository:
    def get_summary(self, conversation_id: str, user_id: str) -> Optional[str]:
        row = self._get_row(conversation_id, user_id, "summary")
        if not row:
            return None
        summary = row.get("summary")
        return str(summary).strip() if summary else None

    def append_summary_lines(
        self,
        conversation_id: str,
        user_id: str,
        lines: list[str],
    ) -> None:
        if not lines:
            return
        current = self.get_summary(conversation_id, user_id) or ""
        existing = {ln.strip() for ln in current.splitlines() if ln.strip()}
        added = False
        for line in lines:
            line = line.strip()
            if not line or line in existing:
                continue
            existing.add(line)
            current = (current + "\n" + line).strip() if current else line
            added = True
        if not added:
            return
        if len(current) > _MAX_SUMMARY_CHARS:
            current = current[-_MAX_SUMMARY_CHARS:]
        supabase = get_supabase_admin_client()
        supabase.table("conversations").update({"summary": current}).eq(
            "id", _validate_conversation_uuid(conversation_id)
        ).eq("user_id", user_id).execute()

    def get_metadata(self, conversation_id: str, user_id: str) -> Dict[str, Any]:
        row = self._get_row(conversation_id, user_id, "metadata")
        if not row:
            return {}
        meta = row.get("metadata")
        return meta if isinstance(meta, dict) else {}

    def set_pending_tool(
        self,
        conversation_id: str,
        user_id: str,
        *,
        intent: str,
        tool: str,
    ) -> None:
        meta = self.get_metadata(conversation_id, user_id)
        meta = dict(meta)
        meta[PENDING_TOOL_METADATA_KEY] = {
            "intent": intent,
            "tool": tool,
        }
        self._update_metadata(conversation_id, user_id, meta)

    def clear_pending_tool(self, conversation_id: str, user_id: str) -> None:
        meta = self.get_metadata(conversation_id, user_id)
        if PENDING_TOOL_METADATA_KEY not in meta:
            return
        meta = dict(meta)
        meta.pop(PENDING_TOOL_METADATA_KEY, None)
        self._update_metadata(conversation_id, user_id, meta)

    def _get_row(
        self, conversation_id: str, user_id: str, *columns: str
    ) -> Optional[dict]:
        supabase = get_supabase_admin_client()
        response = (
            supabase.table("conversations")
            .select(",".join(columns))
            .eq("id", _validate_conversation_uuid(conversation_id))
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return response.data[0]

    def _update_metadata(
        self, conversation_id: str, user_id: str, metadata: Dict[str, Any]
    ) -> None:
        supabase = get_supabase_admin_client()
        supabase.table("conversations").update({"metadata": metadata}).eq(
            "id", _validate_conversation_uuid(conversation_id)
        ).eq("user_id", user_id).execute()


conversation_state_repository = ConversationStateRepository()
