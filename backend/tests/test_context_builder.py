"""Tool context message formatting for professional user-facing replies."""

from app.core.tool_schemas import ToolResult
from app.services.context_builder import (
    _human_fetch_time,
    build_tool_context_message,
    sanitize_user_facing_assistant_text,
)


def test_human_fetch_time_formats_iso() -> None:
    assert _human_fetch_time("2026-07-10T16:06:56+00:00") == "10 Jul 2026, 04:06 PM UTC"


def test_success_message_avoids_iso_and_adds_display() -> None:
    result = ToolResult(
        success=True,
        tool_name="news_rss",
        source="rss_feeds",
        fetched_at="2026-07-10T16:06:56+00:00",
        data={"headlines": []},
    )
    content = build_tool_context_message(result)["content"]
    assert "Do NOT paste raw ISO timestamps" in content
    assert "omit fetch time" in content
    assert "fetched_at_display" in content
    assert "10 Jul 2026, 04:06 PM UTC" in content
    assert "Mention the fetch time when relevant" not in content
    # Must not put cite-able ALL_CAPS labels in model context.
    assert not content.startswith("TOOL_RESULT")
    assert not content.startswith("LIVE_CONTEXT")
    assert "TOOL_RESULT" not in content
    assert "do not cite your source" in content.lower() or "Answer naturally" in content


def test_failure_message_forbids_quoting_raw_errors() -> None:
    result = ToolResult(
        success=False,
        tool_name="news_rss",
        source="rss_feeds",
        fetched_at="2026-07-10T16:06:56+00:00",
        data={},
        error="No headlines matched",
    )
    content = build_tool_context_message(result)["content"]
    assert "never quote raw error" in content
    assert "quote the error if helpful" not in content
    assert "local/city feeds" in content


def test_web_search_message_requires_citations_and_compact_snippets() -> None:
    result = ToolResult(
        success=True,
        tool_name="web_search",
        source="ollama_web_search",
        fetched_at="2026-07-10T16:06:56+00:00",
        data={
            "query": "telephony",
            "result_count": 1,
            "results": [
                {
                    "title": "Twilio",
                    "url": "https://www.twilio.com",
                    "content": "Cloud communications platform for voice agents.",
                }
            ],
        },
    )
    content = build_tool_context_message(result)["content"]
    assert "Do not invent vendors" in content
    assert "Cite title and URL" in content
    assert '"snippet": "Cloud communications platform for voice agents."' in content
    assert '"url": "https://www.twilio.com"' in content
    # Compact web_search rows use "snippet", not raw "content".
    assert '"content": "Cloud communications platform for voice agents."' not in content


def test_sanitize_strips_tool_result_citation() -> None:
    raw = (
        "According to the TOOL_RESULT, the introduction in an interview "
        "is a crucial part of the hiring process."
    )
    cleaned = sanitize_user_facing_assistant_text(raw)
    assert "TOOL_RESULT" not in cleaned
    assert cleaned.startswith("The introduction")
    assert "hiring process" in cleaned


def test_sanitize_leaves_normal_text() -> None:
    text = "Here's today's weather in Pune: 28°C and partly cloudy."
    assert sanitize_user_facing_assistant_text(text) == text


def test_news_rss_compact_drops_feeds_and_shortens_descriptions() -> None:
    long_desc = "A" * 400
    result = ToolResult(
        success=True,
        tool_name="news_rss",
        source="rss_feeds",
        fetched_at="2026-07-10T16:06:56+00:00",
        data={
            "topic_filter": None,
            "headline_count": 12,
            "headlines": [
                {
                    "title": f"Story {i}",
                    "url": f"https://example.com/{i}",
                    "description": long_desc,
                    "feed": "https://feeds.bbci.co.uk/news/rss.xml",
                }
                for i in range(12)
            ],
            "feeds_used": ["https://feeds.bbci.co.uk/news/rss.xml"],
        },
    )
    content = build_tool_context_message(result)["content"]
    assert "feeds_used" not in content
    assert '"feed"' not in content
    # Default TOOL_NEWS_RSS_MAX_HEADLINES=8
    assert content.count('"title"') <= 8
    assert long_desc not in content
