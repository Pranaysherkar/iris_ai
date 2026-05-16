"""Ollama web_search / web_fetch tests (mocked HTTP)."""

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from app.core.intent_rules import match_intent
from app.core.tool_schemas import Intent
from app.tools import web_fetch, web_search
from app.tools.ollama_client import OllamaApiError


class WebSearchToolTests(unittest.TestCase):
    def test_intent_latest_news(self):
        d = match_intent("What is the latest AI news today?")
        self.assertEqual(d.intent, Intent.CURRENT_NEWS)
        self.assertIn(d.tool_name, ("news_rss", "web_search"))
        self.assertTrue(d.needs_tool)
        self.assertIn("query", d.tool_args)

    def test_intent_url_fetch(self):
        d = match_intent("Summarize https://example.com/article please")
        self.assertEqual(d.tool_name, "web_fetch")
        self.assertEqual(d.tool_args.get("url"), "https://example.com/article")

    def test_web_search_mocked(self):
        payload = {
            "results": [
                {
                    "title": "Example",
                    "url": "https://example.com",
                    "content": "Snippet text",
                }
            ]
        }

        async def _run():
            with patch(
                "app.tools.web_search.post_json",
                new_callable=AsyncMock,
                return_value=payload,
            ):
                result = await web_search.run({"query": "AI news"})
                self.assertTrue(result.success)
                self.assertEqual(result.data["result_count"], 1)
                self.assertEqual(result.data["results"][0]["title"], "Example")

        asyncio.run(_run())

    def test_web_search_missing_key(self):
        async def _run():
            with patch(
                "app.tools.web_search.post_json",
                new_callable=AsyncMock,
                side_effect=OllamaApiError("OLLAMA_API_KEY is not set"),
            ):
                result = await web_search.run({"query": "test"})
                self.assertFalse(result.success)
                self.assertIn("OLLAMA_API_KEY", result.error or "")

        asyncio.run(_run())

    def test_web_fetch_mocked(self):
        payload = {
            "title": "Example Domain",
            "content": "Example content",
            "links": ["https://example.com/"],
        }

        async def _run():
            with patch(
                "app.tools.web_fetch.post_json",
                new_callable=AsyncMock,
                return_value=payload,
            ):
                result = await web_fetch.run({"url": "https://example.com"})
                self.assertTrue(result.success)
                self.assertEqual(result.data["title"], "Example Domain")

        asyncio.run(_run())


if __name__ == "__main__":
    unittest.main()
