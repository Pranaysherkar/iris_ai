"""Tests for TTS prose filter (skip code, keep normal text)."""

from app.services.speech.tts_prose_filter import TtsProseFilter


def test_skips_fenced_code_block():
    f = TtsProseFilter()
    text = "Here is the code:\n\n```html\n<h1>Hi</h1>\n```\n\nEnjoy!"
    assert f.feed(text) == "Here is the code:\n\n\n\nEnjoy!"


def test_skips_code_across_streaming_chunks():
    f = TtsProseFilter()
    part1 = f.feed("Here's HTML:\n\n```html\n<!DOC")
    part2 = f.feed("TYPE html>\n```\n\nLet me know!")
    assert part1 == "Here's HTML:\n\n"
    assert part2 == "\n\nLet me know!"
    assert f.flush() == ""


def test_strips_inline_backticks():
    f = TtsProseFilter()
    assert f.feed("Use the `print()` function.") == "Use the  function."


def test_does_not_speak_unclosed_fence():
    f = TtsProseFilter()
    assert f.feed("Code:\n```python\nprint(1)") == "Code:\n"
    assert f.flush() == ""
