from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException

from app.core.supabase import get_supabase_admin_client


def _validate_conversation_uuid(conversation_id: str) -> str:
    try:
        return str(UUID(conversation_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation_id format") from exc


class ChatRepository:
    def resolve_conversation_id(self, user_id: str, requested_conversation_id: Optional[str]) -> str:
        supabase = get_supabase_admin_client()

        if requested_conversation_id:
            conversation_uuid = _validate_conversation_uuid(requested_conversation_id)

            response = (
                supabase.table("conversations")
                .select("id")
                .eq("id", conversation_uuid)
                .eq("user_id", user_id)
                .is_("deleted_at", "null")
                .limit(1)
                .execute()
            )
            if response.data:
                return conversation_uuid

            raise HTTPException(status_code=404, detail="Conversation not found")

        create_response = (
            supabase.table("conversations")
            .insert({"user_id": user_id, "title": "New Chat"})
            .execute()
        )
        if not create_response.data:
            raise HTTPException(status_code=500, detail="Failed to create conversation")
        return str(create_response.data[0]["id"])

    def persist_user_message(self, conversation_id: str, user_id: str, content: str) -> None:
        message_content = content.strip()
        if not message_content:
            raise HTTPException(status_code=400, detail="User message content cannot be empty")

        supabase = get_supabase_admin_client()
        insert_response = (
            supabase.table("messages")
            .insert(
                {
                    "conversation_id": conversation_id,
                    "user_id": user_id,
                    "role": "user",
                    "content": message_content,
                }
            )
            .execute()
        )
        if not insert_response.data:
            raise HTTPException(status_code=500, detail="Failed to save user message")

    def persist_assistant_message(
        self,
        conversation_id: str,
        user_id: str,
        content: str,
        model_name: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
    ) -> None:
        message_content = content.strip()
        if not message_content:
            return

        supabase = get_supabase_admin_client()
        insert_response = (
            supabase.table("messages")
            .insert(
                {
                    "conversation_id": conversation_id,
                    "user_id": user_id,
                    "role": "assistant",
                    "content": message_content,
                    "model_name": model_name,
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                }
            )
            .execute()
        )
        if not insert_response.data:
            raise HTTPException(status_code=500, detail="Failed to save assistant message")

    def load_conversation_memory(
        self,
        conversation_id: str,
        user_id: str,
        limit: int,
    ) -> List[dict]:
        supabase = get_supabase_admin_client()
        response = (
            supabase.table("messages")
            .select("role, content, seq_no")
            .eq("conversation_id", conversation_id)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("seq_no", desc=True)
            .limit(limit)
            .execute()
        )
        rows = response.data or []
        rows.reverse()
        return [{"role": row["role"], "content": row["content"]} for row in rows]

    def get_conversation_history(self, conversation_id: str, user_id: str) -> List[dict]:
        # Reuse ownership check and normalized UUID validation.
        resolved_conversation_id = self.resolve_conversation_id(user_id, conversation_id)

        supabase = get_supabase_admin_client()
        response = (
            supabase.table("messages")
            .select("id, role, content, model_name, prompt_tokens, completion_tokens, total_tokens, created_at")
            .eq("conversation_id", resolved_conversation_id)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("seq_no", desc=False)
            .execute()
        )
        return response.data or []

    def list_user_conversations(self, user_id: str, limit: int = 200) -> List[dict]:
        supabase = get_supabase_admin_client()
        response = (
            supabase.table("conversations")
            .select("id, title, updated_at, last_message_at, created_at")
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data or []

    def soft_delete_conversation(self, conversation_id: str, user_id: str) -> None:
        conv_uuid = _validate_conversation_uuid(conversation_id)
        now_iso = datetime.now(timezone.utc).isoformat()

        supabase = get_supabase_admin_client()
        owned = (
            supabase.table("conversations")
            .select("id")
            .eq("id", conv_uuid)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if not owned.data:
            raise HTTPException(status_code=404, detail="Conversation not found")

        supabase.table("messages").update({"deleted_at": now_iso, "deleted_by": user_id}).eq(
            "conversation_id", conv_uuid
        ).eq("user_id", user_id).is_("deleted_at", "null").execute()

        conv_resp = (
            supabase.table("conversations")
            .update({"deleted_at": now_iso, "deleted_by": user_id})
            .eq("id", conv_uuid)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .execute()
        )
        if not conv_resp.data:
            raise HTTPException(status_code=500, detail="Failed to archive conversation")


chat_repository = ChatRepository()
