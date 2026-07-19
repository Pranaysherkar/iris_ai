"""Context token budgeting / TPM-safe trimming."""

from app.core.tokens import (
    messages_estimated_tokens,
    trim_messages_to_estimated_token_budget,
)


def test_trim_drops_old_history_keeps_latest() -> None:
    messages = [
        {"role": "system", "content": "You are Iris."},
        {"role": "user", "content": "old " * 200},
        {"role": "assistant", "content": "old reply " * 200},
        {"role": "user", "content": "What is the news today?"},
    ]
    trimmed = trim_messages_to_estimated_token_budget(messages, 80)
    assert trimmed[0]["role"] == "system"
    assert trimmed[-1]["content"].startswith("What is the news")
    assert messages_estimated_tokens(trimmed) <= 90


def test_trim_shrinks_oversized_tool_system_block() -> None:
    stories = ",".join(
        '{"title": "Story %d", "description": "%s"}' % (i, "word " * 100)
        for i in range(25)
    )
    huge_json = '{"success": true, "data": {"headlines": [' + stories + "]}}"
    tool_content = "Use ONLY the JSON below for live factual claims.\n" + huge_json
    messages = [
        {"role": "system", "content": "You are Iris."},
        {"role": "system", "content": tool_content},
        {"role": "user", "content": "today news"},
    ]
    assert messages_estimated_tokens(messages) > 800
    trimmed = trim_messages_to_estimated_token_budget(messages, 400)
    assert messages_estimated_tokens(trimmed) <= 420
    assert any(m.get("role") == "user" for m in trimmed)
    system_joined = "\n".join(str(m.get("content", "")) for m in trimmed if m.get("role") == "system")
    assert len(system_joined) < len("You are Iris.\n" + tool_content)
