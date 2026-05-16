"""Persistent user facts — indexed by (user_id, fact_key)."""

from __future__ import annotations

from typing import Dict, List, Optional

from app.core.supabase import get_supabase_admin_client


class UserFactsRepository:
    def list_facts_map(self, user_id: str, *, limit: int = 50) -> Dict[str, str]:
        supabase = get_supabase_admin_client()
        response = (
            supabase.table("user_facts")
            .select("fact_key, fact_value")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = response.data or []
        return {str(r["fact_key"]): str(r["fact_value"]) for r in rows if r.get("fact_key")}

    def upsert_facts(
        self,
        user_id: str,
        facts: List[tuple[str, str]],
        *,
        source_conversation_id: Optional[str] = None,
    ) -> None:
        if not facts:
            return
        supabase = get_supabase_admin_client()
        payload = [
            {
                "user_id": user_id,
                "fact_key": key,
                "fact_value": value,
                "source_conversation_id": source_conversation_id,
            }
            for key, value in facts
        ]
        supabase.table("user_facts").upsert(payload, on_conflict="user_id,fact_key").execute()


user_facts_repository = UserFactsRepository()
