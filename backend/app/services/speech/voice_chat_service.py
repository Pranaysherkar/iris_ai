"""Orchestrates STT → Groq LLM (streaming) → Sarvam TTS (per sentence) for voice chat."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from typing import AsyncGenerator, List, Optional

from fastapi import HTTPException

from app.api.v1.chat import (
    _load_conversation_memory,
    _maybe_generate_ai_conversation_title,
    _persist_assistant_message,
    _persist_user_message,
)
from app.core.config import settings
from app.core.text_normalize import normalize_text
from app.repositories.chat_repository import chat_repository
from app.services.ai_service import ai_service
from app.services.chat_tools import build_chat_model_messages
from app.services.memory_service import extract_and_persist_facts
from app.services.moderation import moderate_user_input
from app.services.speech.sentence_buffer import flush_remainder, flush_sentence
from app.services.speech.stt_service import stt_service
from app.services.speech.tts_prose_filter import TtsProseFilter
from app.services.speech.tts_service import tts_service

logger = logging.getLogger(__name__)

_MIN_CHARS = lambda: settings.VOICE_TTS_MIN_SENTENCE_CHARS


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _synthesize_and_encode(sentence: str, index: int) -> str:
    audio_bytes, mime = await tts_service.synthesize(sentence)
    event = {
        "type": "audio",
        "index": index,
        "mime": mime,
        "data": base64.b64encode(audio_bytes).decode("ascii"),
    }
    return _sse(event)


async def stream_voice_chat_turn(
    *,
    audio_bytes: bytes,
    filename: str,
    content_type: str,
    user_id: str,
    conversation_id: Optional[str],
) -> AsyncGenerator[str, None]:
    if not settings.SPEECH_ENABLED:
        yield _sse({"type": "error", "message": "Speech chat is disabled."})
        yield "data: [DONE]\n\n"
        return

    try:
        transcript = await stt_service.transcribe(
            audio_bytes,
            filename=filename,
            content_type=content_type,
        )
    except Exception as exc:
        logger.exception("voice_stt_failed user=%s", user_id)
        yield _sse({"type": "error", "message": f"Speech recognition failed: {exc}"})
        yield "data: [DONE]\n\n"
        return

    transcript = normalize_text(transcript)
    if not transcript:
        yield _sse({"type": "error", "message": "Could not understand speech. Please try again."})
        yield "data: [DONE]\n\n"
        return

    resolved_conversation_id = chat_repository.resolve_conversation_id(user_id, conversation_id)
    yield _sse({"type": "conversation_id", "id": resolved_conversation_id})
    yield _sse({"type": "transcript", "text": transcript})

    if not settings.SPEECH_SKIP_MODERATION:
        try:
            await moderate_user_input(transcript)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else "Message not allowed."
            yield _sse({"type": "error", "message": detail})
            yield "data: [DONE]\n\n"
            return

    from app.api.v1.chat import ChatMessage

    _persist_user_message(
        resolved_conversation_id,
        user_id,
        [ChatMessage(role="user", content=transcript)],
    )
    asyncio.create_task(
        asyncio.to_thread(
            extract_and_persist_facts,
            user_id,
            transcript,
            conversation_id=resolved_conversation_id,
        )
    )

    formatted_messages = _load_conversation_memory(
        resolved_conversation_id,
        user_id,
        settings.CHAT_MEMORY_WINDOW,
    )
    if not formatted_messages:
        formatted_messages = [{"role": "user", "content": transcript}]

    formatted_messages = await build_chat_model_messages(
        formatted_messages,
        transcript,
        user_id=user_id,
        conversation_id=resolved_conversation_id,
        voice_mode=True,
    )

    usage_holder: dict = {}
    assistant_parts: List[str] = []
    sentence_buffer = ""
    prose_filter = TtsProseFilter()
    audio_index = 0
    min_chars = _MIN_CHARS()
    tts_tasks: List[asyncio.Task[str]] = []
    next_tts_out = 0

    async def _yield_ready_tts() -> AsyncGenerator[str, None]:
        nonlocal next_tts_out
        while next_tts_out < len(tts_tasks) and tts_tasks[next_tts_out].done():
            try:
                yield await tts_tasks[next_tts_out]
            except Exception as exc:
                logger.warning("voice_tts_sentence_failed: %s", exc)
            next_tts_out += 1

    async for event_chunk in ai_service.chat_stream(
        formatted_messages,
        usage_holder=usage_holder,
        max_tokens=settings.VOICE_MAX_TOKENS,
        model=settings.GROQ_VOICE_MODEL,
        temperature=0.4,
    ):
        if not event_chunk.startswith("data: "):
            continue

        payload_raw = event_chunk[len("data: ") :].strip()
        if not payload_raw or payload_raw == "[DONE]":
            continue

        try:
            payload_obj = json.loads(payload_raw)
        except json.JSONDecodeError:
            continue

        if isinstance(payload_obj.get("error"), str):
            yield _sse({"type": "error", "message": payload_obj["error"]})
            yield "data: [DONE]\n\n"
            return

        delta = payload_obj.get("text")
        if not isinstance(delta, str) or not delta:
            continue

        assistant_parts.append(delta)
        yield _sse({"type": "text", "delta": delta})

        prose_delta = prose_filter.feed(delta)
        if prose_delta:
            sentence_buffer += prose_delta
            completed, sentence_buffer = flush_sentence(sentence_buffer, min_chars=min_chars)
            if completed:
                tts_tasks.append(asyncio.create_task(_synthesize_and_encode(completed, audio_index)))
                audio_index += 1

        async for audio_event in _yield_ready_tts():
            yield audio_event

    trailing_prose = prose_filter.flush()
    if trailing_prose:
        sentence_buffer += trailing_prose

    remainder = flush_remainder(sentence_buffer, min_chars=max(6, min_chars - 2))
    if remainder:
        tts_tasks.append(
            asyncio.create_task(_synthesize_and_encode(remainder, audio_index))
        )

    while next_tts_out < len(tts_tasks):
        try:
            yield await tts_tasks[next_tts_out]
        except Exception as exc:
            logger.warning("voice_tts_sentence_failed: %s", exc)
        next_tts_out += 1

    full_reply = "".join(assistant_parts)
    if full_reply.strip():
        _persist_assistant_message(
            resolved_conversation_id,
            user_id,
            full_reply,
            prompt_tokens=int(usage_holder.get("prompt_tokens", 0) or 0),
            completion_tokens=int(usage_holder.get("completion_tokens", 0) or 0),
        )
        asyncio.create_task(
            _maybe_generate_ai_conversation_title(
                resolved_conversation_id,
                user_id,
                full_reply,
            )
        )

    yield _sse({"type": "done", "text": full_reply})
    yield "data: [DONE]\n\n"
