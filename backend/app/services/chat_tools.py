"""Orchestrates preprocessing, memory, intent routing, and tool execution."""

from __future__ import annotations

import logging
from typing import List, Optional, Sequence, Tuple

from app.core.config import settings
from app.core.prompts import get_chat_system_prompt, get_voice_mode_prompt
from app.core.tool_context import ToolRunContext
from app.core.tool_schemas import Intent, RouteDecision, ToolResult
from app.core.tokens import trim_messages_to_estimated_token_budget
from app.rag.retrieve import (
    collect_target_attachment_ids,
    format_document_context,
    retrieve_for_chat,
)
from app.repositories.conversation_state_repository import conversation_state_repository
from app.services.context_builder import (
    inject_document_context,
    inject_memory_context,
    inject_tool_context,
)
from app.services.intent_router import route_user_message
from app.services.memory_service import load_conversation_summary, load_user_facts
from app.services.pending_tool_router import forced_route_from_follow_up
from app.services.query_preprocessor import preprocess_query, pending_tool_from_metadata
from app.services.tool_executor import execute_route

logger = logging.getLogger(__name__)


async def build_chat_model_messages(
    history: List[dict],
    user_message: str,
    *,
    user_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    voice_mode: bool = False,
    attachment_ids: Optional[Sequence[str]] = None,
) -> List[dict]:
    """
    Persona prompt → memory blocks → optional DOCUMENT_CONTEXT → trimmed history
    → preprocess → route → tools.
    """
    system_content = get_chat_system_prompt()
    if voice_mode:
        system_content = f"{system_content}\n\n{get_voice_mode_prompt()}"
    system = {"role": "system", "content": system_content}
    combined: List[dict] = [system, *history]

    facts = load_user_facts(user_id) if user_id else {}
    summary = (
        load_conversation_summary(conversation_id, user_id)
        if conversation_id and user_id
        else None
    )
    combined = inject_memory_context(
        combined,
        user_facts=facts,
        conversation_summary=summary,
        user_message=user_message,
    )

    # RAG: only when user attached and/or @mentioned files
    if settings.RAG_ENABLED and user_id and (attachment_ids or user_message):
        try:
            targets = collect_target_attachment_ids(
                user_id=user_id,
                conversation_id=conversation_id,
                user_message=user_message,
                explicit_ids=attachment_ids,
            )
            if targets:
                hits = retrieve_for_chat(
                    user_id=user_id,
                    query=user_message,
                    attachment_ids=targets,
                )
                body = format_document_context(hits)
                if body:
                    combined = inject_document_context(combined, context_body=body)
                    logger.info(
                        "rag_context_injected attachments=%s hits=%s",
                        len(targets),
                        len(hits),
                    )
        except Exception as exc:
            logger.warning("rag_retrieve_skipped: %s", exc)

    trimmed = trim_messages_to_estimated_token_budget(
        combined,
        settings.CHAT_MAX_CONTEXT_TOKENS_ESTIMATE,
    )

    pending_meta = None
    if conversation_id and user_id:
        try:
            meta = conversation_state_repository.get_metadata(conversation_id, user_id)
            pending_meta = pending_tool_from_metadata(meta)
        except Exception as exc:
            logger.debug("pending_tool_load_skipped: %s", exc)

    preprocessed = preprocess_query(
        user_message,
        trimmed,
        pending_tool=pending_meta,
    )

    if preprocessed.routing_text != user_message:
        logger.info(
            "query_preprocessed original=%r routing=%r",
            user_message[:80],
            preprocessed.routing_text[:80],
        )

    if not settings.TOOLS_ENABLED:
        return trimmed

    if voice_mode and not settings.VOICE_TOOLS_ENABLED:
        return trimmed

    decision = forced_route_from_follow_up(
        user_message,
        preprocessed,
        pending_meta,
    )
    if decision is None:
        decision = await route_user_message(
            user_message,
            trimmed,
            routing_text=preprocessed.routing_text,
        )
    else:
        logger.info(
            "intent_forced_follow_up intent=%s city=%r",
            decision.intent.value,
            decision.tool_args.get("city"),
        )

    if decision.clarify:
        if (
            conversation_id
            and user_id
            and decision.intent == Intent.LIVE_WEATHER
        ):
            try:
                conversation_state_repository.set_pending_tool(
                    conversation_id,
                    user_id,
                    intent=decision.intent.value,
                    tool=decision.tool_name or "weather",
                )
            except Exception as exc:
                logger.warning("pending_tool_set_failed: %s", exc)
        return inject_tool_context(trimmed, clarification=decision)

    if not decision.needs_tool:
        return trimmed

    ctx = ToolRunContext(user_id=user_id, conversation_id=conversation_id)
    tool_result = await execute_route(decision, ctx)
    if tool_result is None:
        return trimmed

    if tool_result.success and conversation_id and user_id:
        try:
            conversation_state_repository.clear_pending_tool(conversation_id, user_id)
        except Exception:
            pass

    requested_place = (
        preprocessed.follow_up_weather_city
        or decision.tool_args.get("city")
        or user_message
    )

    logger.warning(
        "tool_executed tool=%s success=%s city=%r",
        tool_result.tool_name,
        tool_result.success,
        decision.tool_args.get("city"),
    )
    return inject_tool_context(
        trimmed,
        tool_result=tool_result,
        user_requested_place=str(requested_place) if requested_place else None,
    )


async def resolve_tool_pipeline(
    user_message: str,
    history: Optional[List[dict]] = None,
    *,
    user_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    pending_tool: Optional[dict] = None,
) -> Tuple[Optional[ToolResult], Optional[RouteDecision]]:
    """Lower-level API for tests: route + execute without building full message list."""
    pre = preprocess_query(user_message, history or [], pending_tool=pending_tool)
    decision = forced_route_from_follow_up(user_message, pre, pending_tool)
    if decision is None:
        decision = await route_user_message(
            user_message,
            history,
            routing_text=pre.routing_text,
        )
    if decision.clarify or not decision.needs_tool:
        return None, decision if decision.clarify else None
    ctx = ToolRunContext(user_id=user_id, conversation_id=conversation_id)
    result = await execute_route(decision, ctx)
    return result, None
