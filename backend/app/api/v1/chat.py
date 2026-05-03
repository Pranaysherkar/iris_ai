import json
import logging
from typing import Annotated, AsyncGenerator, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.v1.deps import get_current_user_id, get_current_user_id_chat_ratelimited
from app.core.config import settings
from app.core.chat_title_quality import (
    extractive_title_from_user_question,
    is_low_quality_generated_title,
    should_defer_title_from_first_exchange,
)
from app.core.prompts import get_chat_system_prompt
from app.core.text_normalize import normalize_text
from app.core.tokens import trim_messages_to_estimated_token_budget
from app.repositories.chat_repository import chat_repository, conversation_title_from_first_message
from app.services.ai_service import ai_service
from app.services.moderation import moderate_user_input

router = APIRouter()
logger = logging.getLogger(__name__)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    conversation_id: Optional[str] = None


def _validate_and_normalize_messages(messages: List[ChatMessage]) -> List[ChatMessage]:
    if len(messages) > settings.CHAT_MAX_MESSAGES_PER_REQUEST:
        raise HTTPException(
            status_code=413,
            detail=f"Too many messages (max {settings.CHAT_MAX_MESSAGES_PER_REQUEST}).",
        )
    normalized: List[ChatMessage] = []
    for m in messages:
        text = normalize_text(m.content)
        if len(text) > settings.CHAT_MAX_MESSAGE_CHARS:
            raise HTTPException(
                status_code=413,
                detail=f"Message exceeds maximum length ({settings.CHAT_MAX_MESSAGE_CHARS} characters).",
            )
        normalized.append(ChatMessage(role=m.role, content=text))
    return normalized


def _persist_user_message(conversation_id: str, user_id: str, messages: List[ChatMessage]) -> None:
    if not messages:
        raise HTTPException(status_code=400, detail="At least one message is required")

    latest_message = messages[-1]
    if latest_message.role != "user":
        raise HTTPException(status_code=400, detail="Last message must be from user")
    if not latest_message.content.strip():
        raise HTTPException(status_code=400, detail="User message content cannot be empty")
    chat_repository.persist_user_message(conversation_id, user_id, latest_message.content)


def _persist_assistant_message(
    conversation_id: str,
    user_id: str,
    assistant_text: str,
    *,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
) -> None:
    chat_repository.persist_assistant_message(
        conversation_id=conversation_id,
        user_id=user_id,
        content=assistant_text,
        model_name=settings.GROQ_MODEL,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )


def _load_conversation_memory(
    conversation_id: str,
    user_id: str,
    limit: int,
) -> List[dict]:
    return chat_repository.load_conversation_memory(conversation_id, user_id, limit)


def _prepare_model_messages(history: List[dict]) -> List[dict]:
    """Prepend system prompt and trim to estimated token budget."""
    system = {"role": "system", "content": get_chat_system_prompt()}
    combined: List[dict] = [system, *history]
    return trim_messages_to_estimated_token_budget(
        combined,
        settings.CHAT_MAX_CONTEXT_TOKENS_ESTIMATE,
    )


async def _maybe_generate_ai_conversation_title(
    conversation_id: str,
    user_id: str,
    assistant_text: str,
) -> None:
    """
    Set sidebar title via LLM when placeholder remains.

    - Single substantive turn (1 user, 1 assistant): title from that pair unless the user
      message looks like a greeting — then defer until a second exchange.
    - Two or more turns (>=2 user and >=2 assistant): title from the **second** user +
      **second** assistant (skip hello / how-can-I-help opener).
    """
    if not settings.CHAT_AI_TITLE_ENABLED:
        return
    text = normalize_text(assistant_text)
    if not text:
        return
    if not chat_repository.conversation_title_is_placeholder(conversation_id, user_id):
        return

    assistant_count = chat_repository.count_messages_with_role(
        conversation_id, user_id, "assistant"
    )
    user_count = chat_repository.count_messages_with_role(conversation_id, user_id, "user")

    pick_user: Optional[str] = None
    pick_assistant: Optional[str] = None

    if user_count >= 2 and assistant_count >= 2:
        pick_user = chat_repository.get_nth_message_content_for_role(
            conversation_id, user_id, "user", 2
        )
        if assistant_count == 2:
            pick_assistant = text
        else:
            pick_assistant = chat_repository.get_nth_message_content_for_role(
                conversation_id, user_id, "assistant", 2
            )
    elif user_count == 1 and assistant_count == 1:
        first_u = chat_repository.get_first_message_content_for_role(
            conversation_id, user_id, "user"
        )
        if not first_u:
            return
        if should_defer_title_from_first_exchange(first_u):
            return
        pick_user = first_u
        pick_assistant = text
    else:
        return

    if not pick_user or not pick_assistant:
        return

    mw = settings.CHAT_TITLE_MAX_WORDS

    title = await ai_service.generate_conversation_title(
        pick_user,
        pick_assistant,
        max_words=mw,
    )
    resolved: Optional[str] = None
    if title and not is_low_quality_generated_title(title):
        resolved = title
    elif title:
        retry = await ai_service.generate_conversation_title(
            pick_user,
            pick_assistant,
            max_words=mw,
            strict_retry=True,
        )
        if retry and not is_low_quality_generated_title(retry):
            resolved = retry

    if resolved:
        chat_repository.replace_placeholder_title(conversation_id, user_id, resolved)
        logger.info(
            "conversation_title_ai conversation=%s user=%s title=%s",
            conversation_id,
            user_id,
            resolved,
        )
        return

    fb_ex = extractive_title_from_user_question(
        pick_user,
        max_words=max(mw + 3, 8),
        max_chars=96,
    )
    fb_plain = conversation_title_from_first_message(pick_user)
    for fb in (fb_ex, fb_plain):
        if fb and len(fb) >= 6 and not is_low_quality_generated_title(fb):
            chat_repository.replace_placeholder_title(conversation_id, user_id, fb)
            logger.info(
                "conversation_title_fallback conversation=%s user=%s title=%s",
                conversation_id,
                user_id,
                fb,
            )
            return

    # Last resort: still beats leaving "New Chat"
    if fb_plain:
        chat_repository.replace_placeholder_title(conversation_id, user_id, fb_plain)


async def _stream_and_capture_assistant_response(
    formatted_messages: List[dict],
    conversation_id: str,
    user_id: str,
    usage_holder: dict,
) -> AsyncGenerator[str, None]:
    assistant_text_parts: List[str] = []

    async for event_chunk in ai_service.chat_stream(
        formatted_messages,
        usage_holder=usage_holder,
    ):
        if event_chunk.startswith("data: "):
            payload = event_chunk[len("data: ") :].strip()
            if payload and payload != "[DONE]":
                try:
                    payload_obj = json.loads(payload)
                    delta_text = payload_obj.get("text")
                    if isinstance(delta_text, str):
                        assistant_text_parts.append(delta_text)
                except json.JSONDecodeError:
                    pass

        yield event_chunk

    full_reply = "".join(assistant_text_parts)
    _persist_assistant_message(
        conversation_id,
        user_id,
        full_reply,
        prompt_tokens=int(usage_holder.get("prompt_tokens", 0) or 0),
        completion_tokens=int(usage_holder.get("completion_tokens", 0) or 0),
    )
    await _maybe_generate_ai_conversation_title(conversation_id, user_id, full_reply)


@router.post("/chat")
async def chat_endpoint(
    request: Request,
    payload: ChatRequest,
    user_id: Annotated[str, Depends(get_current_user_id_chat_ratelimited)],
):
    """
    Modular Chat Endpoint connected to Groq AI Service.
    """
    messages = _validate_and_normalize_messages(payload.messages)
    await moderate_user_input(messages[-1].content)

    conversation_id = chat_repository.resolve_conversation_id(user_id, payload.conversation_id)
    rid = getattr(request.state, "request_id", "-")
    logger.info(
        "chat_request user=%s conversation=%s request_id=%s",
        user_id,
        conversation_id,
        rid,
    )

    _persist_user_message(conversation_id, user_id, messages)

    formatted_messages = _load_conversation_memory(
        conversation_id,
        user_id,
        settings.CHAT_MEMORY_WINDOW,
    )
    if not formatted_messages:
        formatted_messages = [{"role": m.role, "content": m.content} for m in messages]

    formatted_messages = _prepare_model_messages(formatted_messages)

    usage_holder: dict = {}
    return StreamingResponse(
        _stream_and_capture_assistant_response(
            formatted_messages,
            conversation_id,
            user_id,
            usage_holder,
        ),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": conversation_id, "X-Request-ID": rid},
    )


@router.get("/chat/history/{conversation_id}")
async def chat_history_endpoint(
    conversation_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
):
    history = chat_repository.get_conversation_history(conversation_id, user_id)
    return {
        "conversation_id": conversation_id,
        "messages": history,
    }
