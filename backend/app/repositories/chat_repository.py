from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set
from uuid import UUID, uuid4

from fastapi import HTTPException

from app.core.config import settings
from app.core.supabase import get_supabase_admin_client
from app.core.text_normalize import normalize_text
from app.repositories.message_branch import (
    active_path_ids_for_target,
    build_children_index,
    collect_subtree_ids,
    leaf_of_path,
)

DEFAULT_CONVERSATION_TITLE = "New Chat"
# Legacy rows / older clients may use this string — still treated as auto-title placeholder.
_PLACEHOLDER_TITLES = frozenset({DEFAULT_CONVERSATION_TITLE, "New conversation"})

_MSG_TREE_SELECT = (
    "id, conversation_id, user_id, role, content, seq_no, parent_message_id, "
    "sibling_group_id, branch_version, is_active_path, model_name, "
    "prompt_tokens, completion_tokens, total_tokens, created_at, deleted_at"
)
_IN_CHUNK = 80


def conversation_title_from_first_message(content: str, max_len: int = 60) -> str:
    """Single-line sidebar title from the first user message (ChatGPT-style truncation)."""
    t = normalize_text(content)
    if not t:
        return ""
    t = " ".join(t.split())
    if len(t) <= max_len:
        return t
    return t[: max_len - 1].rstrip() + "…"


def branch_limit_detail(limit: Optional[int] = None) -> str:
    n = limit if limit is not None else settings.CONVERSATION_BRANCH_LIMIT
    return f"Maximum {n} versions allowed for this message."


def _validate_conversation_uuid(conversation_id: str) -> str:
    try:
        return str(UUID(conversation_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation_id format") from exc


def _validate_message_uuid(message_id: str) -> str:
    try:
        return str(UUID(message_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid message_id format") from exc


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
            .insert({"user_id": user_id, "title": DEFAULT_CONVERSATION_TITLE})
            .execute()
        )
        if not create_response.data:
            raise HTTPException(status_code=500, detail="Failed to create conversation")
        return str(create_response.data[0]["id"])

    # ------------------------------------------------------------------
    # Branch / tree helpers
    # ------------------------------------------------------------------

    def _fetch_conversation_messages(
        self,
        conversation_id: str,
        user_id: str,
        *,
        active_only: bool = False,
    ) -> List[Dict[str, Any]]:
        supabase = get_supabase_admin_client()
        q = (
            supabase.table("messages")
            .select(_MSG_TREE_SELECT)
            .eq("conversation_id", conversation_id)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
        )
        if active_only:
            q = q.eq("is_active_path", True)
        response = q.order("seq_no", desc=False).execute()
        return response.data or []

    def _get_active_leaf_id(self, conversation_id: str, user_id: str) -> Optional[str]:
        supabase = get_supabase_admin_client()
        row = (
            supabase.table("conversations")
            .select("active_leaf_message_id")
            .eq("id", conversation_id)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if not row.data:
            return None
        leaf = row.data[0].get("active_leaf_message_id")
        return str(leaf) if leaf else None

    def _set_active_leaf(self, conversation_id: str, user_id: str, message_id: str) -> None:
        supabase = get_supabase_admin_client()
        (
            supabase.table("conversations")
            .update({"active_leaf_message_id": message_id})
            .eq("id", conversation_id)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .execute()
        )

    def _set_active_path_flags(
        self,
        conversation_id: str,
        user_id: str,
        active_ids: Set[str],
        all_ids: Sequence[str],
    ) -> None:
        """Mark ``active_ids`` on-path; everything else in the conversation off-path."""
        supabase = get_supabase_admin_client()
        inactive = [mid for mid in all_ids if mid not in active_ids]
        active_list = [mid for mid in all_ids if mid in active_ids]

        def _chunked_update(ids: List[str], is_active: bool) -> None:
            for i in range(0, len(ids), _IN_CHUNK):
                chunk = ids[i : i + _IN_CHUNK]
                (
                    supabase.table("messages")
                    .update({"is_active_path": is_active})
                    .eq("conversation_id", conversation_id)
                    .eq("user_id", user_id)
                    .in_("id", chunk)
                    .is_("deleted_at", "null")
                    .execute()
                )

        if inactive:
            _chunked_update(inactive, False)
        if active_list:
            _chunked_update(active_list, True)

    def _deactivate_subtree(
        self,
        conversation_id: str,
        user_id: str,
        root_id: str,
        rows: List[Dict[str, Any]],
    ) -> None:
        children = build_children_index(rows)
        subtree = collect_subtree_ids(root_id, children)
        if not subtree:
            return
        supabase = get_supabase_admin_client()
        ids = list(subtree)
        for i in range(0, len(ids), _IN_CHUNK):
            chunk = ids[i : i + _IN_CHUNK]
            (
                supabase.table("messages")
                .update({"is_active_path": False})
                .eq("conversation_id", conversation_id)
                .eq("user_id", user_id)
                .in_("id", chunk)
                .is_("deleted_at", "null")
                .execute()
            )

    def _sibling_stats(
        self,
        conversation_id: str,
        user_id: str,
        group_ids: Set[str],
    ) -> Dict[str, List[Dict[str, Any]]]:
        """sibling_group_id -> siblings sorted by branch_version."""
        if not group_ids:
            return {}
        supabase = get_supabase_admin_client()
        out: Dict[str, List[Dict[str, Any]]] = {gid: [] for gid in group_ids}
        group_list = list(group_ids)
        for i in range(0, len(group_list), _IN_CHUNK):
            chunk = group_list[i : i + _IN_CHUNK]
            res = (
                supabase.table("messages")
                .select("id, sibling_group_id, branch_version, role")
                .eq("conversation_id", conversation_id)
                .eq("user_id", user_id)
                .in_("sibling_group_id", chunk)
                .is_("deleted_at", "null")
                .execute()
            )
            for row in res.data or []:
                gid = str(row["sibling_group_id"])
                out.setdefault(gid, []).append(row)
        for gid, lst in out.items():
            lst.sort(key=lambda r: int(r.get("branch_version") or 1))
        return out

    def _attachment_history_item(self, row: Dict[str, Any]) -> dict:
        return {
            "id": str(row["id"]),
            "file_name": row.get("file_name"),
            "mime_type": row.get("mime_type"),
            "type": row.get("type"),
            "file_size_bytes": row.get("file_size_bytes"),
            "ingestion_status": row.get("ingestion_status") or "pending",
            "created_at": row.get("created_at"),
        }

    def _attachments_for_history_messages(
        self,
        conversation_id: str,
        user_id: str,
        message_ids: Set[str],
        user_message_times: Dict[str, Any],
    ) -> Dict[str, List[dict]]:
        """
        Map attachment rows onto active user message ids.

        Linked rows use ``message_id``. Legacy / unmatched rows (null message_id
        or pointing at an inactive sibling) are placed on the nearest later
        user turn by ``created_at``.
        """
        from app.repositories.attachments_repository import attachments_repository

        by_msg: Dict[str, List[dict]] = {mid: [] for mid in message_ids}
        if not message_ids:
            return by_msg

        try:
            rows = attachments_repository.list_for_conversation(
                user_id, conversation_id, limit=200
            )
        except Exception as exc:
            import logging

            logging.getLogger(__name__).warning(
                "history_attachments_load_failed conversation=%s err=%s",
                conversation_id,
                exc,
            )
            return by_msg

        orphans: List[Dict[str, Any]] = []
        for row in rows:
            item = self._attachment_history_item(row)
            mid = row.get("message_id")
            mid_s = str(mid) if mid else ""
            if mid_s and mid_s in by_msg:
                by_msg[mid_s].append(item)
            else:
                orphans.append(row)

        if not orphans:
            return by_msg

        # Chronological user turns for orphan placement
        ordered = sorted(
            (
                (mid, user_message_times.get(mid))
                for mid in message_ids
            ),
            key=lambda pair: str(pair[1] or ""),
        )
        if not ordered:
            return by_msg

        for row in orphans:
            item = self._attachment_history_item(row)
            created = str(row.get("created_at") or "")
            target = ordered[-1][0]
            for mid, created_at in ordered:
                if str(created_at or "") >= created:
                    target = mid
                    break
            by_msg.setdefault(target, []).append(item)

        return by_msg

    def _enrich_active_history(
        self,
        conversation_id: str,
        user_id: str,
        rows: List[Dict[str, Any]],
    ) -> List[dict]:
        group_ids = {
            str(r["sibling_group_id"])
            for r in rows
            if r.get("sibling_group_id") and r.get("role") == "user"
        }
        stats = self._sibling_stats(conversation_id, user_id, group_ids)

        user_ids = {str(r["id"]) for r in rows if r.get("role") == "user"}
        user_times = {
            str(r["id"]): r.get("created_at") for r in rows if r.get("role") == "user"
        }
        attachments_by_msg = self._attachments_for_history_messages(
            conversation_id, user_id, user_ids, user_times
        )

        enriched: List[dict] = []
        for row in rows:
            item: dict = {
                "id": row["id"],
                "role": row["role"],
                "content": row["content"],
                "model_name": row.get("model_name"),
                "prompt_tokens": row.get("prompt_tokens"),
                "completion_tokens": row.get("completion_tokens"),
                "total_tokens": row.get("total_tokens"),
                "created_at": row.get("created_at"),
                "parent_message_id": row.get("parent_message_id"),
                "sibling_group_id": row.get("sibling_group_id"),
                "branch_version": int(row.get("branch_version") or 1),
                "branch_total": 1,
                "branch_siblings": [],
                "attachments": [],
            }
            if row.get("role") == "user":
                item["attachments"] = attachments_by_msg.get(str(row["id"]), [])
                if row.get("sibling_group_id"):
                    siblings = stats.get(str(row["sibling_group_id"]), [])
                    item["branch_total"] = max(len(siblings), 1)
                    item["branch_siblings"] = [
                        {
                            "id": str(s["id"]),
                            "branch_version": int(s.get("branch_version") or 1),
                        }
                        for s in siblings
                    ]
            enriched.append(item)
        return enriched

    def persist_user_message(self, conversation_id: str, user_id: str, content: str) -> str:
        message_content = normalize_text(content)
        if not message_content:
            raise HTTPException(status_code=400, detail="User message content cannot be empty")

        parent_id = self._get_active_leaf_id(conversation_id, user_id)
        supabase = get_supabase_admin_client()
        insert_response = (
            supabase.table("messages")
            .insert(
                {
                    "conversation_id": conversation_id,
                    "user_id": user_id,
                    "role": "user",
                    "content": message_content,
                    "parent_message_id": parent_id,
                    "sibling_group_id": str(uuid4()),
                    "branch_version": 1,
                    "is_active_path": True,
                }
            )
            .execute()
        )
        if not insert_response.data:
            raise HTTPException(status_code=500, detail="Failed to save user message")
        message_id = str(insert_response.data[0]["id"])
        self._set_active_leaf(conversation_id, user_id, message_id)
        return message_id

    def set_conversation_title_if_placeholder(
        self,
        conversation_id: str,
        user_id: str,
        first_user_message: str,
    ) -> None:
        """
        When the row still has a default title, set it from the first user message
        so the sidebar list shows a meaningful name after refresh.
        """
        derived = conversation_title_from_first_message(first_user_message)
        if not derived:
            return

        supabase = get_supabase_admin_client()
        current = (
            supabase.table("conversations")
            .select("title")
            .eq("id", _validate_conversation_uuid(conversation_id))
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if not current.data:
            return
        raw_title = (current.data[0].get("title") or "").strip()
        if raw_title not in _PLACEHOLDER_TITLES:
            return

        (
            supabase.table("conversations")
            .update({"title": derived})
            .eq("id", conversation_id)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .execute()
        )

    def conversation_title_is_placeholder(self, conversation_id: str, user_id: str) -> bool:
        supabase = get_supabase_admin_client()
        row = (
            supabase.table("conversations")
            .select("title")
            .eq("id", _validate_conversation_uuid(conversation_id))
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if not row.data:
            return False
        raw = (row.data[0].get("title") or "").strip()
        return raw in _PLACEHOLDER_TITLES

    def count_messages_with_role(
        self,
        conversation_id: str,
        user_id: str,
        role: str,
    ) -> int:
        supabase = get_supabase_admin_client()
        res = (
            supabase.table("messages")
            .select("id")
            .eq("conversation_id", _validate_conversation_uuid(conversation_id))
            .eq("user_id", user_id)
            .eq("role", role)
            .eq("is_active_path", True)
            .is_("deleted_at", "null")
            .execute()
        )
        return len(res.data or [])

    def get_first_message_content_for_role(
        self,
        conversation_id: str,
        user_id: str,
        role: str,
    ) -> Optional[str]:
        """Earliest non-deleted active-path message for role (by seq_no)."""
        supabase = get_supabase_admin_client()
        res = (
            supabase.table("messages")
            .select("content")
            .eq("conversation_id", _validate_conversation_uuid(conversation_id))
            .eq("user_id", user_id)
            .eq("role", role)
            .eq("is_active_path", True)
            .is_("deleted_at", "null")
            .order("seq_no", desc=False)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        return res.data[0].get("content")

    def get_nth_message_content_for_role(
        self,
        conversation_id: str,
        user_id: str,
        role: str,
        n: int,
    ) -> Optional[str]:
        """Nth active-path message for role in chronological order (n is 1-based)."""
        if n < 1:
            return None
        supabase = get_supabase_admin_client()
        res = (
            supabase.table("messages")
            .select("role", "content")
            .eq("conversation_id", _validate_conversation_uuid(conversation_id))
            .eq("user_id", user_id)
            .eq("is_active_path", True)
            .is_("deleted_at", "null")
            .order("seq_no", desc=False)
            .execute()
        )
        seq = [row["content"] for row in (res.data or []) if row.get("role") == role]
        if len(seq) >= n:
            return seq[n - 1]
        return None

    def replace_placeholder_title(self, conversation_id: str, user_id: str, new_title: str) -> None:
        """Set conversation title when it is still a placeholder (e.g. AI-generated name)."""
        t = normalize_text(new_title)
        if not t:
            return
        if len(t) > 120:
            t = t[:117].rstrip() + "…"

        supabase = get_supabase_admin_client()
        current = (
            supabase.table("conversations")
            .select("title")
            .eq("id", _validate_conversation_uuid(conversation_id))
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if not current.data:
            return
        raw_title = (current.data[0].get("title") or "").strip()
        if raw_title not in _PLACEHOLDER_TITLES:
            return

        (
            supabase.table("conversations")
            .update({"title": t})
            .eq("id", conversation_id)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .execute()
        )

    def persist_assistant_message(
        self,
        conversation_id: str,
        user_id: str,
        content: str,
        model_name: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
    ) -> Optional[str]:
        message_content = normalize_text(content)
        if not message_content:
            return None

        parent_id = self._get_active_leaf_id(conversation_id, user_id)
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
                    "parent_message_id": parent_id,
                    "sibling_group_id": str(uuid4()),
                    "branch_version": 1,
                    "is_active_path": True,
                }
            )
            .execute()
        )
        if not insert_response.data:
            raise HTTPException(status_code=500, detail="Failed to save assistant message")
        message_id = str(insert_response.data[0]["id"])
        self._set_active_leaf(conversation_id, user_id, message_id)
        return message_id

    def create_edit_branch(
        self,
        conversation_id: str,
        user_id: str,
        source_message_id: str,
        content: str,
    ) -> str:
        """
        Fork a new sibling version of a user message (ChatGPT edit).

        Deactivates the source subtree, inserts a sibling with the same
        ``sibling_group_id`` and ``branch_version = max+1``, and points the
        conversation leaf at the new user message. Caller streams a new reply.
        """
        conv_id = _validate_conversation_uuid(conversation_id)
        src_id = _validate_message_uuid(source_message_id)
        message_content = normalize_text(content)
        if not message_content:
            raise HTTPException(status_code=400, detail="User message content cannot be empty")

        # Ownership gate
        self.resolve_conversation_id(user_id, conv_id)

        rows = self._fetch_conversation_messages(conv_id, user_id)
        by_id = {str(r["id"]): r for r in rows}
        source = by_id.get(src_id)
        if not source:
            raise HTTPException(status_code=404, detail="Message not found")
        if source.get("role") != "user":
            raise HTTPException(status_code=400, detail="Only user messages can be edited")
        if not source.get("is_active_path"):
            raise HTTPException(
                status_code=400,
                detail="Can only edit a message on the active branch. Switch to that version first.",
            )

        group_id = str(source["sibling_group_id"])
        siblings = [r for r in rows if str(r.get("sibling_group_id")) == group_id]
        limit = max(1, int(settings.CONVERSATION_BRANCH_LIMIT))
        if len(siblings) >= limit:
            raise HTTPException(status_code=400, detail=branch_limit_detail(limit))

        max_version = max(int(r.get("branch_version") or 1) for r in siblings)
        parent_id = source.get("parent_message_id")
        parent_id = str(parent_id) if parent_id else None

        self._deactivate_subtree(conv_id, user_id, src_id, rows)

        supabase = get_supabase_admin_client()
        insert_response = (
            supabase.table("messages")
            .insert(
                {
                    "conversation_id": conv_id,
                    "user_id": user_id,
                    "role": "user",
                    "content": message_content,
                    "parent_message_id": parent_id,
                    "sibling_group_id": group_id,
                    "branch_version": max_version + 1,
                    "is_active_path": True,
                }
            )
            .execute()
        )
        if not insert_response.data:
            raise HTTPException(status_code=500, detail="Failed to create edit branch")

        new_id = str(insert_response.data[0]["id"])
        self._set_active_leaf(conv_id, user_id, new_id)
        return new_id

    def switch_active_branch(
        self,
        conversation_id: str,
        user_id: str,
        target_message_id: str,
    ) -> List[dict]:
        """
        Activate the unique root→leaf path through ``target_message_id``.

        Descendant tip is chosen by walking max(seq_no) children (deterministic).
        """
        conv_id = _validate_conversation_uuid(conversation_id)
        target_id = _validate_message_uuid(target_message_id)
        self.resolve_conversation_id(user_id, conv_id)

        rows = self._fetch_conversation_messages(conv_id, user_id)
        by_id = {str(r["id"]): r for r in rows}
        if target_id not in by_id:
            raise HTTPException(status_code=404, detail="Message not found")

        path_ids = active_path_ids_for_target(target_id, rows)
        if not path_ids:
            raise HTTPException(status_code=400, detail="Unable to resolve branch path")

        all_ids = [str(r["id"]) for r in rows]
        self._set_active_path_flags(conv_id, user_id, path_ids, all_ids)

        tip = leaf_of_path(path_ids, rows)
        if tip:
            self._set_active_leaf(conv_id, user_id, tip)

        active_rows = [r for r in rows if str(r["id"]) in path_ids]
        active_rows.sort(key=lambda r: int(r.get("seq_no") or 0))
        return self._enrich_active_history(conv_id, user_id, active_rows)

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
            .eq("is_active_path", True)
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
        rows = self._fetch_conversation_messages(
            resolved_conversation_id,
            user_id,
            active_only=True,
        )
        return self._enrich_active_history(resolved_conversation_id, user_id, rows)

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
