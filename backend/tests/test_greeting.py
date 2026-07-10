"""Greeting-only detection must not swallow real requests."""

from app.core.greeting import is_likely_greeting_only_user_message
from app.core.prompts import get_chat_system_prompt
from app.services.context_builder import build_substantive_request_message, inject_memory_context


def test_hey_plus_news_is_not_greeting_only() -> None:
    assert not is_likely_greeting_only_user_message(
        "hey tell me bout todays top 10 news"
    )


def test_plain_hey_is_greeting_only() -> None:
    assert is_likely_greeting_only_user_message("hey")
    assert is_likely_greeting_only_user_message("Hi!")


def test_substantive_request_hint_for_hey_plus_ask() -> None:
    msg = build_substantive_request_message("hey tell me bout todays top 10 news")
    assert msg is not None
    assert "NOT greeting-only" in msg["content"]


def test_no_substantive_hint_for_greeting_only() -> None:
    assert build_substantive_request_message("hey") is None


def test_inject_memory_adds_request_priority() -> None:
    messages = [{"role": "system", "content": "persona"}, {"role": "user", "content": "x"}]
    out = inject_memory_context(
        messages,
        user_message="hey tell me bout todays top 10 news",
    )
    assert any("REQUEST_PRIORITY" in m.get("content", "") for m in out)


def test_system_prompt_blocks_greeting_on_mixed_messages() -> None:
    prompt = get_chat_system_prompt()
    assert "Greeting-only replies apply ONLY" in prompt
    assert "skip the greeting-only reply" in prompt
