"""Convert browser audio (webm) to 16 kHz mono WAV for Sarvam STT."""

from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def _ffmpeg_executable() -> str | None:
    path = shutil.which("ffmpeg")
    if path:
        return path
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _convert_to_wav_sync(audio_bytes: bytes, suffix: str = ".webm") -> bytes:
    ffmpeg = _ffmpeg_executable()
    if not ffmpeg:
        raise RuntimeError("ffmpeg not available for audio conversion")

    with tempfile.TemporaryDirectory() as tmp:
        inp = Path(tmp) / f"input{suffix}"
        out = Path(tmp) / "output.wav"
        inp.write_bytes(audio_bytes)
        cmd = [
            ffmpeg,
            "-y",
            "-i",
            str(inp),
            "-ar",
            "16000",
            "-ac",
            "1",
            "-f",
            "wav",
            str(out),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()[-500:]
            raise RuntimeError(f"ffmpeg conversion failed: {err}")
        return out.read_bytes()


async def to_wav_16k_mono(audio_bytes: bytes, *, suffix: str = ".webm") -> bytes:
    return await asyncio.to_thread(_convert_to_wav_sync, audio_bytes, suffix)


def guess_suffix(content_type: str, filename: str) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".wav"):
        return ".wav"
    if lower.endswith(".mp3"):
        return ".mp3"
    if lower.endswith(".ogg"):
        return ".ogg"
    if "webm" in (content_type or "").lower():
        return ".webm"
    if "ogg" in (content_type or "").lower():
        return ".ogg"
    if "wav" in (content_type or "").lower():
        return ".wav"
    return ".webm"
