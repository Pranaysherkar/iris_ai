"""Strip markdown code from streaming LLM text before TTS (chat UI keeps full reply)."""

from __future__ import annotations

_FENCE = "```"


class TtsProseFilter:
    """Yield only speakable prose; skip fenced and inline code blocks."""

    def __init__(self) -> None:
        self._buf = ""
        self._in_fence = False

    def feed(self, chunk: str) -> str:
        if not chunk:
            return ""
        self._buf += chunk
        return self._drain()

    def flush(self) -> str:
        if self._in_fence:
            self._buf = ""
            self._in_fence = False
            return ""

        prose, self._buf = _take_prose_without_fence(self._buf)
        return _strip_inline_code(prose)

    def _drain(self) -> str:
        parts: list[str] = []
        while self._buf:
            if self._in_fence:
                close = self._buf.find(_FENCE)
                if close == -1:
                    self._buf = _hold_partial_fence_marker(self._buf)
                    break
                self._buf = self._buf[close + len(_FENCE) :]
                self._in_fence = False
                continue

            open_idx = self._buf.find(_FENCE)
            if open_idx == -1:
                prose, self._buf = _take_prose_without_fence(self._buf)
                if prose:
                    parts.append(_strip_inline_code(prose))
                break

            prose = self._buf[:open_idx]
            if prose:
                parts.append(_strip_inline_code(prose))
            self._buf = self._buf[open_idx + len(_FENCE) :]
            self._in_fence = True

        return "".join(parts)


def _hold_partial_fence_marker(text: str) -> str:
    if text.endswith("``"):
        return "``"
    if text.endswith("`"):
        return "`"
    return ""


def _take_prose_without_fence(text: str) -> tuple[str, str]:
    """Split prose from a trailing partial ``` marker."""
    if text.endswith(_FENCE):
        return text[: -len(_FENCE)], _FENCE
    if text.endswith("``"):
        return text[:-2], "``"
    if text.endswith("`"):
        return text[:-1], "`"
    return text, ""


def _strip_inline_code(text: str) -> str:
    out: list[str] = []
    in_inline = False
    for ch in text:
        if ch == "`":
            in_inline = not in_inline
            continue
        if not in_inline:
            out.append(ch)
    return "".join(out)
