"""Route user messages to intents and optional tools."""

from __future__ import annotations

import logging
from typing import List, Optional

from app.core.config import settings
from app.core.intent_rules import match_intent
from app.core.tool_schemas import Intent, RouteDecision

logger = logging.getLogger(__name__)


def route_user_message(
    user_message: str,
    history: Optional[List[dict]] = None,
    *,
    routing_text: Optional[str] = None,
) -> RouteDecision:
    if not settings.TOOLS_ENABLED:
        return RouteDecision(intent=Intent.GENERAL_CHAT, needs_tool=False, confidence=1.0)

    text_for_rules = (routing_text or user_message).strip() or user_message
    decision = match_intent(text_for_rules, history)

    if decision.clarify:
        logger.info("intent_clarify intent=%s", decision.intent.value)
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

    if decision.needs_tool:
        logger.info(
            "intent_routed intent=%s tool=%s confidence=%.2f",
            decision.intent.value,
            decision.tool_name,
            decision.confidence,
        )

    return decision
