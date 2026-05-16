"""Authenticated user's profile and recent conversations from Supabase."""

from __future__ import annotations

from typing import Any

from app.core.tool_schemas import ToolResult
from app.core.supabase import get_supabase_admin_client
from app.services.memory_service import load_user_facts
from app.tools.base import failure_result, success_result

TOOL_NAME = "user_memory"
SOURCE = "supabase"


async def run(args: dict[str, Any]) -> ToolResult:
    user_id = str(args.get("user_id") or "").strip()
    if not user_id:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error="user_id is required for user_memory (internal).",
        )

    conversation_id = str(args.get("conversation_id") or "").strip() or None
    conv_limit = max(1, min(int(args.get("conversation_limit") or 5), 10))

    supabase = get_supabase_admin_client()

    profile_row: dict[str, Any] | None = None
    try:
        profile_resp = (
            supabase.table("profiles")
            .select("id, full_name, date_of_birth, onboarding_completed, updated_at")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if profile_resp.data:
            profile_row = profile_resp.data[0]
    except Exception as exc:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"Failed to load profile: {exc}",
        )

    conversations: list[dict[str, Any]] = []
    try:
        conv_resp = (
            supabase.table("conversations")
            .select("id, title, created_at, updated_at")
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("updated_at", desc=True)
            .limit(conv_limit)
            .execute()
        )
        conversations = conv_resp.data or []
    except Exception as exc:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"Failed to load conversations: {exc}",
        )

    current_conversation = None
    if conversation_id:
        current_conversation = next(
            (c for c in conversations if str(c.get("id")) == conversation_id),
            None,
        )

    stored_facts = load_user_facts(user_id)

    return success_result(
        tool_name=TOOL_NAME,
        source=SOURCE,
        data={
            "user_id": user_id,
            "profile": profile_row,
            "stored_facts": stored_facts,
            "recent_conversations": conversations,
            "current_conversation_id": conversation_id,
            "current_conversation": current_conversation,
        },
    )
