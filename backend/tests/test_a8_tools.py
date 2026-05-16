"""A8 tools: wikipedia, news_rss, exchange_rates, user_memory (mocked)."""

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.intent_rules import match_intent
from app.core.tool_context import ToolRunContext
from app.core.tool_schemas import Intent
from app.services.tool_executor import execute_route
from app.tools import exchange_rates, news_rss, user_memory, wikipedia


class A8ToolTests(unittest.TestCase):
    def test_intent_wikipedia(self):
        d = match_intent("Tell me about Python programming")
        self.assertEqual(d.intent, Intent.ENCYCLOPEDIA)
        self.assertEqual(d.tool_name, "wikipedia")

    def test_intent_exchange(self):
        d = match_intent("What is the USD to INR exchange rate?")
        self.assertEqual(d.intent, Intent.EXCHANGE_RATES)
        self.assertEqual(d.tool_name, "exchange_rates")

    def test_intent_user_memory(self):
        d = match_intent("What is my name?")
        self.assertEqual(d.intent, Intent.USER_DATA)
        self.assertEqual(d.tool_name, "user_memory")

    def test_wikipedia_mocked(self):
        search_payload = {"query": {"search": [{"title": "Python"}]}}
        summary_payload = {
            "query": {
                "pages": {
                    "1": {
                        "title": "Python",
                        "extract": "Python is a programming language.",
                        "fullurl": "https://en.wikipedia.org/wiki/Python",
                    }
                }
            }
        }

        async def _run():
            with patch(
                "app.tools.wikipedia.fetch_json",
                new_callable=AsyncMock,
                side_effect=[search_payload, summary_payload],
            ):
                result = await wikipedia.run({"topic": "Python"})
                self.assertTrue(result.success)
                self.assertIn("programming language", result.data["summary"])

        asyncio.run(_run())

    def test_exchange_mocked(self):
        async def _run():
            with patch(
                "app.tools.exchange_rates.fetch_json",
                new_callable=AsyncMock,
                return_value={"date": "2026-05-16", "rates": {"INR": 83.5}},
            ):
                result = await exchange_rates.run(
                    {"text_hint": "USD to INR exchange rate", "from_currency": "USD", "to_currency": "INR"}
                )
                self.assertTrue(result.success)
                self.assertEqual(result.data["rate"], 83.5)

        asyncio.run(_run())

    def test_news_rss_mocked(self):
        rss_xml = """<?xml version="1.0"?>
        <rss><channel>
          <item><title>AI News</title><link>https://example.com/a</link><description>Test</description></item>
        </channel></rss>"""

        async def _run():
            with patch(
                "app.tools.news_rss.fetch_text",
                new_callable=AsyncMock,
                return_value=rss_xml,
            ):
                result = await news_rss.run({"topic": "AI"})
                self.assertTrue(result.success)
                self.assertGreaterEqual(result.data["headline_count"], 1)

        asyncio.run(_run())

    def test_user_memory_mocked(self):
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": "u1", "full_name": "Ada", "onboarding_completed": True}]
        )
        mock_client.table.return_value.select.return_value.eq.return_value.is_.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": "c1", "title": "New Chat"}]
        )

        async def _run():
            with patch(
                "app.tools.user_memory.get_supabase_admin_client",
                return_value=mock_client,
            ):
                result = await user_memory.run({"user_id": "u1"})
                self.assertTrue(result.success)
                self.assertEqual(result.data["profile"]["full_name"], "Ada")

        asyncio.run(_run())

    def test_execute_user_memory_requires_context(self):
        async def _run():
            decision = match_intent("What is my name?")
            result = await execute_route(decision, ToolRunContext())
            self.assertFalse(result.success)

        asyncio.run(_run())


if __name__ == "__main__":
    unittest.main()
