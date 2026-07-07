"""Speech-to-text: Sarvam Saaras (primary) with Groq Whisper fallback."""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings
from app.services.speech.audio_convert import guess_suffix, to_wav_16k_mono

logger = logging.getLogger(__name__)

GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"


def _resolve_sarvam_stt_params() -> tuple[str, str]:
    """Lock STT language/mode from SPEECH_LANGUAGE (English → transcribe only)."""
    language = settings.speech_stt_language
    mode = settings.speech_stt_mode
    return language, mode


def _log_http_error(service: str, exc: httpx.HTTPStatusError) -> None:
    body = ""
    try:
        body = (exc.response.text or "")[:500]
    except Exception:
        pass
    logger.warning("%s_http_error status=%s body=%s", service, exc.response.status_code, body)


class STTService:
    async def transcribe(
        self,
        audio_bytes: bytes,
        *,
        filename: str = "audio.webm",
        content_type: str = "audio/webm",
    ) -> str:
        if not audio_bytes:
            raise ValueError("Empty audio payload")

        if settings.sarvam_configured and settings.SARVAM_STT_ENABLED:
            try:
                text = await self._transcribe_sarvam(
                    audio_bytes,
                    filename=filename,
                    content_type=content_type,
                )
                if text:
                    return text
            except Exception as exc:
                logger.warning("sarvam_stt_failed fallback=groq error=%s", exc)

        if not settings.GROQ_API_KEY:
            raise RuntimeError(
                "Speech recognition unavailable. Set SARVAM_API_KEY or GROQ_API_KEY."
            )

        return await self._transcribe_groq(
            audio_bytes,
            filename=filename,
            content_type=content_type,
        )

    async def _prepare_sarvam_audio(
        self,
        audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
    ) -> tuple[bytes, str, str]:
        """Return (bytes, filename, content_type) optimized for Sarvam."""
        is_wav = "wav" in (content_type or "").lower() or filename.lower().endswith(".wav")
        if is_wav:
            return audio_bytes, "audio.wav", "audio/wav"

        suffix = guess_suffix(content_type, filename)
        try:
            wav_bytes = await to_wav_16k_mono(audio_bytes, suffix=suffix)
            return wav_bytes, "audio.wav", "audio/wav"
        except Exception as exc:
            logger.debug("wav_convert_skipped using_original err=%s", exc)
            return audio_bytes, filename, content_type

    async def _transcribe_sarvam(
        self,
        audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
    ) -> str:
        prepared, out_name, out_type = await self._prepare_sarvam_audio(
            audio_bytes,
            filename=filename,
            content_type=content_type,
        )
        language_code, mode = _resolve_sarvam_stt_params()
        timeout = httpx.Timeout(settings.SPEECH_HTTP_TIMEOUT_SECONDS)
        headers = {"api-subscription-key": settings.SARVAM_API_KEY or ""}
        data = {
            "model": settings.SARVAM_STT_MODEL,
            "language_code": language_code,
            "mode": mode,
        }
        files = {"file": (out_name, prepared, out_type)}

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                SARVAM_STT_URL,
                headers=headers,
                data=data,
                files=files,
            )
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                _log_http_error("sarvam_stt", exc)
                raise
            payload = response.json()

        transcript = (payload.get("transcript") or "").strip()
        if not transcript:
            raise RuntimeError("Sarvam STT returned empty transcript")
        return transcript

    async def _transcribe_groq(
        self,
        audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
    ) -> str:
        timeout = httpx.Timeout(settings.SPEECH_HTTP_TIMEOUT_SECONDS)
        headers = {"Authorization": f"Bearer {settings.GROQ_API_KEY}"}
        data = {"model": settings.GROQ_WHISPER_MODEL, "response_format": "json"}
        whisper_lang = settings.groq_whisper_language
        if whisper_lang:
            data["language"] = whisper_lang
        files = {"file": (filename, audio_bytes, content_type)}

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                GROQ_TRANSCRIBE_URL,
                headers=headers,
                data=data,
                files=files,
            )
            response.raise_for_status()
            payload = response.json()

        text = (payload.get("text") or "").strip()
        if not text:
            raise RuntimeError("Groq Whisper returned empty transcript")
        return text


stt_service = STTService()
