from typing import Annotated, AsyncGenerator, List, Optional
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.v1.deps import get_current_user_id
from app.core.config import settings
from app.repositories.chat_repository import chat_repository
from app.services.ai_service import ai_service

router = APIRouter()
CHAT_MEMORY_WINDOW = 20

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    conversation_id: Optional[str] = None


def _persist_user_message(conversation_id: str, user_id: str, messages: List[ChatMessage]) -> None:
    if not messages:
        raise HTTPException(status_code=400, detail="At least one message is required")

    latest_message = messages[-1]
    if latest_message.role != "user":
        raise HTTPException(status_code=400, detail="Last message must be from user")
    chat_repository.persist_user_message(conversation_id, user_id, latest_message.content)


def _persist_assistant_message(conversation_id: str, user_id: str, assistant_text: str) -> None:
    chat_repository.persist_assistant_message(
        conversation_id=conversation_id,
        user_id=user_id,
        content=assistant_text,
        model_name=settings.GROQ_MODEL,
        prompt_tokens=0,
        completion_tokens=0,
    )


def _load_conversation_memory(
    conversation_id: str,
    user_id: str,
    limit: int = CHAT_MEMORY_WINDOW,
) -> List[dict]:
    return chat_repository.load_conversation_memory(conversation_id, user_id, limit)


async def _stream_and_capture_assistant_response(
    formatted_messages: List[dict],
    conversation_id: str,
    user_id: str,
) -> AsyncGenerator[str, None]:
    assistant_text_parts: List[str] = []

    async for event_chunk in ai_service.chat_stream(formatted_messages):
        if event_chunk.startswith("data: "):
            payload = event_chunk[len("data: "):].strip()
            if payload and payload != "[DONE]":
                try:
                    payload_obj = json.loads(payload)
                    delta_text = payload_obj.get("text")
                    if isinstance(delta_text, str):
                        assistant_text_parts.append(delta_text)
                except json.JSONDecodeError:
                    # Forward malformed chunks without interrupting stream.
                    pass

        yield event_chunk

    _persist_assistant_message(conversation_id, user_id, "".join(assistant_text_parts))


@router.post("/chat")
async def chat_endpoint(
    request: ChatRequest,
    user_id: Annotated[str, Depends(get_current_user_id)],
):
    """
    Modular Chat Endpoint connected to Groq AI Service.
    """
    conversation_id = chat_repository.resolve_conversation_id(user_id, request.conversation_id)
    _persist_user_message(conversation_id, user_id, request.messages)

    # Use persisted conversation history as model input (memory window).
    formatted_messages = _load_conversation_memory(conversation_id, user_id)
    if not formatted_messages:
        formatted_messages = [{"role": m.role, "content": m.content} for m in request.messages]

    return StreamingResponse(
        _stream_and_capture_assistant_response(formatted_messages, conversation_id, user_id),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": conversation_id},
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
