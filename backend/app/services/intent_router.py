"""Route user messages to intents and optional tools (LLM-native by default)."""

from __future__ import annotations

import logging
from typing import List, Optional

from app.core.config import settings
from app.core.intent_rules import match_intent
from app.core.tool_schemas import Intent, RouteDecision
from app.services.llm_tool_router import route_with_llm

logger = logging.getLogger(__name__)


def _apply_confidence_gate(decision: RouteDecision) -> RouteDecision:
    if decision.clarify:
        return decision
    if decision.needs_tool and decision.confidence < settings.TOOL_INTENT_CONFIDENCE_THRESHOLD:
        logger.info(
            "intent_below_threshold intent=%s confidence=%.2f",
            decision.intent.value,
            decision.confidence,
        )
        return RouteDecision(
            intent=decision.intent,
            needs_tool=False,
            confidence=decision.confidence,
        )
    return decision


async def route_user_message(
    user_message: str,
    history: Optional[List[dict]] = None,
    *,
    routing_text: Optional[str] = None,
) -> RouteDecision:
    if not settings.TOOLS_ENABLED:
        return RouteDecision(intent=Intent.GENERAL_CHAT, needs_tool=False, confidence=1.0)

    mode = (settings.TOOL_ROUTER_MODE or "llm").strip().lower()
    text_for_rules = (routing_text or user_message).strip() or user_message

    if mode == "regex":
        decision = match_intent(text_for_rules, history)
    else:
        decision = await route_with_llm(
            user_message,
            history,
            routing_text=routing_text,
        )

    if decision.clarify:
        logger.info("intent_clarify intent=%s", decision.intent.value)
        return decision

    decision = _apply_confidence_gate(decision)

    if decision.needs_tool:
        logger.info(
            "intent_routed mode=%s intent=%s tool=%s confidence=%.2f",
            mode,
            decision.intent.value,
            decision.tool_name,
            decision.confidence,
        )

    return decision
