"""Voice chat API — orchestrated STT → Groq → TTS with SSE streaming."""

from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from app.api.v1.deps import get_current_user_id_chat_ratelimited
from app.core.config import settings
from app.services.speech.voice_chat_service import stream_voice_chat_turn

router = APIRouter()
logger = logging.getLogger(__name__)

_MAX_AUDIO_BYTES = 25 * 1024 * 1024


@router.get("/speech/config")
async def speech_config_endpoint(
    user_id: Annotated[str, Depends(get_current_user_id_chat_ratelimited)],
):
    """Public speech settings for the frontend (no secrets)."""
    _ = user_id
    return {
        "enabled": settings.SPEECH_ENABLED,
        "speaker": settings.SARVAM_TTS_SPEAKER,
        "language": settings.speech_tts_language,
        "stt_language": settings.speech_stt_language,
        "stt_mode": settings.speech_stt_mode,
    }


@router.post("/speech/chat")
async def speech_chat_endpoint(
    request: Request,
    user_id: Annotated[str, Depends(get_current_user_id_chat_ratelimited)],
    audio: UploadFile = File(...),
    conversation_id: Optional[str] = Form(default=None),
    client_transcript: Optional[str] = Form(default=None),
):
    """
    One voice turn: upload full utterance audio → SSE stream with:
    - transcript (user text for chat UI)
    - text deltas (assistant reply for chat UI)
    - audio chunks (base64 MP3 per sentence)
    - done
    """
    if not settings.SPEECH_ENABLED:
        raise HTTPException(status_code=503, detail="Speech chat is disabled.")

    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty audio upload.")
    if len(raw) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file too large (max 25MB).")

    filename = audio.filename or "audio.webm"
    content_type = audio.content_type or "audio/webm"
    rid = getattr(request.state, "request_id", "-")

    logger.info(
        "speech_chat_request user=%s bytes=%s request_id=%s",
        user_id,
        len(raw),
        rid,
    )

    return StreamingResponse(
        stream_voice_chat_turn(
            audio_bytes=raw,
            filename=filename,
            content_type=content_type,
            user_id=user_id,
            conversation_id=conversation_id,
            client_transcript=client_transcript,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Request-ID": rid,
        },
    )
