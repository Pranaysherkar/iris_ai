"""Text-to-speech: Sarvam Bulbul (primary) with Edge-TTS fallback."""

from __future__ import annotations

import base64
import logging
import re
import tempfile
from pathlib import Path

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"


def _log_http_error(service: str, exc: httpx.HTTPStatusError) -> None:
    body = ""
    try:
        body = (exc.response.text or "")[:500]
    except Exception:
        pass
    logger.warning("%s_http_error status=%s body=%s", service, exc.response.status_code, body)


class TTSService:
    async def synthesize(self, text: str) -> tuple[bytes, str]:
        cleaned = re.sub(r"\s+", " ", (text or "").strip())
        if not cleaned:
            raise ValueError("Text is empty")

        if settings.sarvam_configured and settings.SARVAM_TTS_ENABLED:
            try:
                return await self._synthesize_sarvam(cleaned)
            except Exception as exc:
                logger.warning("sarvam_tts_failed fallback=edge error=%s", exc)

        if settings.TTS_FALLBACK_EDGE_ENABLED:
            return await self._synthesize_edge(cleaned)

        raise RuntimeError(
            "Text-to-speech unavailable. Set SARVAM_API_KEY or enable Edge-TTS fallback."
        )

    async def _synthesize_sarvam(self, text: str) -> tuple[bytes, str]:
        timeout = httpx.Timeout(settings.SPEECH_HTTP_TIMEOUT_SECONDS)
        headers = {
            "api-subscription-key": settings.SARVAM_API_KEY or "",
            "Content-Type": "application/json",
        }
        codec = settings.SARVAM_TTS_OUTPUT_CODEC.lower()
        body: dict = {
            "text": text,
            "target_language_code": settings.speech_tts_language,
            "speaker": settings.SARVAM_TTS_SPEAKER.lower(),
            "model": settings.SARVAM_TTS_MODEL,
            "pace": settings.SARVAM_TTS_PACE,
            "speech_sample_rate": str(settings.SARVAM_TTS_SAMPLE_RATE),
            "output_audio_codec": codec,
        }
        if settings.SARVAM_TTS_MODEL == "bulbul:v3":
            body["temperature"] = settings.SARVAM_TTS_TEMPERATURE

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(SARVAM_TTS_URL, headers=headers, json=body)
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                _log_http_error("sarvam_tts", exc)
                if codec != "wav":
                    body["output_audio_codec"] = "wav"
                    retry = await client.post(SARVAM_TTS_URL, headers=headers, json=body)
                    try:
                        retry.raise_for_status()
                    except httpx.HTTPStatusError as exc2:
                        _log_http_error("sarvam_tts_retry", exc2)
                        raise exc2 from exc
                    response = retry
                    codec = "wav"
                else:
                    raise
            payload = response.json()

        audios = payload.get("audios") or []
        if not audios:
            raise RuntimeError("Sarvam TTS returned no audio")

        raw = base64.b64decode("".join(audios))
        mime = {
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
            "aac": "audio/aac",
            "opus": "audio/opus",
            "flac": "audio/flac",
        }.get(codec, "audio/wav")
        return raw, mime

    async def _synthesize_edge(self, text: str) -> tuple[bytes, str]:
        try:
            import edge_tts
        except ImportError as exc:
            raise RuntimeError("edge-tts is not installed") from exc

        voice = settings.EDGE_TTS_VOICE
        rate = settings.EDGE_TTS_RATE
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            out_path = Path(tmp.name)

        try:
            communicate = edge_tts.Communicate(text, voice, rate=rate)
            await communicate.save(str(out_path))
            data = out_path.read_bytes()
            if not data:
                raise RuntimeError("Edge-TTS returned empty audio")
            return data, "audio/mpeg"
        finally:
            out_path.unlink(missing_ok=True)


tts_service = TTSService()
