"""Load/store user facts and conversation summaries with in-process TTL cache."""

from __future__ import annotations

import logging
import time
from typing import Dict, List, Optional, Tuple

from app.core.config import settings
from app.repositories.conversation_state_repository import conversation_state_repository
from app.repositories.user_facts_repository import user_facts_repository
from app.services.fact_extractor import extract_facts

logger = logging.getLogger(__name__)

# user_id -> (monotonic_expiry, facts_map)
_facts_cache: Dict[str, Tuple[float, Dict[str, str]]] = {}


def _cache_get(user_id: str) -> Optional[Dict[str, str]]:
    entry = _facts_cache.get(user_id)
    if not entry:
        return None
    expiry, facts = entry
    if time.monotonic() > expiry:
        _facts_cache.pop(user_id, None)
        return None
    return facts


def _cache_set(user_id: str, facts: Dict[str, str]) -> None:
    ttl = max(5, int(settings.USER_FACTS_CACHE_TTL_SECONDS))
    _facts_cache[user_id] = (time.monotonic() + ttl, facts)


def invalidate_user_facts_cache(user_id: str) -> None:
    _facts_cache.pop(user_id, None)


def load_user_facts(user_id: str) -> Dict[str, str]:
    if not settings.USER_FACTS_ENABLED or not user_id:
        return {}

    cached = _cache_get(user_id)
    if cached is not None:
        return cached

    try:
        facts = user_facts_repository.list_facts_map(user_id)
    except Exception as exc:
        logger.warning("user_facts_load_failed user=%s err=%s", user_id, exc)
        return {}

    _cache_set(user_id, facts)
    return facts


def load_conversation_summary(conversation_id: str, user_id: str) -> Optional[str]:
    if not settings.CONVERSATION_SUMMARY_ENABLED or not conversation_id:
        return None
    try:
        return conversation_state_repository.get_summary(conversation_id, user_id)
    except Exception as exc:
        logger.warning(
            "conversation_summary_load_failed conversation=%s err=%s",
            conversation_id,
            exc,
        )
        return None


def extract_and_persist_facts(
    user_id: str,
    user_message: str,
    *,
    conversation_id: Optional[str] = None,
) -> List[tuple[str, str]]:
    if not settings.USER_FACTS_ENABLED or not user_id:
        return []

    pairs = extract_facts(user_message)
    if not pairs:
        return []

    try:
        user_facts_repository.upsert_facts(
            user_id,
            pairs,
            source_conversation_id=conversation_id,
        )
        invalidate_user_facts_cache(user_id)
    except Exception as exc:
        logger.warning("user_facts_persist_failed user=%s err=%s", user_id, exc)
        return []

    if settings.CONVERSATION_SUMMARY_ENABLED and conversation_id:
        lines = [f"User {key}: {value}" for key, value in pairs]
        try:
            conversation_state_repository.append_summary_lines(
                conversation_id,
                user_id,
                lines,
            )
        except Exception as exc:
            logger.warning(
                "conversation_summary_append_failed conversation=%s err=%s",
                conversation_id,
                exc,
            )

    return pairs
