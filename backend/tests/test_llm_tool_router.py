"""Tests for LLM tool catalog and router parsing (no live Groq calls)."""

import asyncio
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.tool_catalog import enabled_tool_names, get_tool_spec, openai_tools_for_enabled
from app.core.tool_schemas import Intent
from app.services.llm_tool_router import (
    _decision_from_tool_call,
    _normalize_weather_city,
    _parse_failed_generation,
    route_with_llm,
)
from app.tools.weather import _city_candidates


class ToolCatalogTests(unittest.TestCase):
    def test_catalog_lookup_o1(self):
        spec = get_tool_spec("news_rss")
        self.assertIsNotNone(spec)
        self.assertEqual(spec.intent, Intent.CURRENT_NEWS)
        self.assertIn("news", spec.description.lower())
        self.assertIn("wikipedia", spec.description.lower())

    def test_openai_tools_only_enabled(self):
        tools = openai_tools_for_enabled()
        names = {t["function"]["name"] for t in tools}
        enabled = enabled_tool_names()
        self.assertTrue(names.issubset(enabled))
        self.assertEqual(names, set(enabled))
        self.assertIn("weather", names)
        self.assertIn("news_rss", names)


class LlmToolRouterParseTests(unittest.TestCase):
    def test_weather_missing_city_clarifies(self):
        d = _decision_from_tool_call("weather", {"city": ""})
        self.assertTrue(d.clarify)
        self.assertFalse(d.needs_tool)
        self.assertEqual(d.intent, Intent.LIVE_WEATHER)

    def test_weather_city_normalized_before_comma(self):
        self.assertEqual(_normalize_weather_city("Ghansoli, Navi Mumbai"), "Ghansoli")
        d = _decision_from_tool_call("weather", {"city": "Ghansoli, Navi Mumbai"})
        self.assertTrue(d.needs_tool)
        self.assertEqual(d.tool_args["city"], "Ghansoli")

    def test_parse_failed_generation_xml_style(self):
        raw = '<function=weather>{"city": "Ghansoli, Navi Mumbai"}'
        parsed = _parse_failed_generation(raw)
        self.assertIsNotNone(parsed)
        name, args = parsed
        self.assertEqual(name, "weather")
        self.assertEqual(args.get("city"), "Ghansoli, Navi Mumbai")

    def test_parse_failed_generation_missing_gt_before_json(self):
        """Groq 70B prod shape: <function=wikipedia{...}</function> (no '>' after name)."""
        raw = '<function=wikipedia{"topic": "Bharatiya Janata Party"}</function>'
        parsed = _parse_failed_generation(raw)
        self.assertIsNotNone(parsed)
        name, args = parsed
        self.assertEqual(name, "wikipedia")
        self.assertEqual(args.get("topic"), "Bharatiya Janata Party")

    def test_parse_failed_generation_unicode_escaped(self):
        raw = (
            "\\u003cfunction=wikipedia{\\\"topic\\\": \\\"Bharatiya Janata Party\\\"}"
            "\\u003c/function\\u003e"
        )
        parsed = _parse_failed_generation(raw)
        self.assertIsNotNone(parsed)
        name, args = parsed
        self.assertEqual(name, "wikipedia")
        self.assertEqual(args.get("topic"), "Bharatiya Janata Party")

    def test_route_recovers_wikipedia_missing_gt_shape(self):
        err_body = {
            "error": {
                "message": "Failed to call a function.",
                "code": "tool_use_failed",
                "failed_generation": (
                    '<function=wikipedia{"topic": "Bharatiya Janata Party"}</function>'
                ),
            }
        }
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = json.dumps(err_body)
        mock_response.json.return_value = err_body

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.post = AsyncMock(return_value=mock_response)

        async def _run():
            with patch("app.services.llm_tool_router.httpx.AsyncClient", return_value=mock_client):
                with patch("app.services.llm_tool_router.settings") as mock_settings:
                    mock_settings.GROQ_API_KEY = "test-key"
                    mock_settings.TOOL_ROUTER_MODEL = "llama-3.3-70b-versatile"
                    mock_settings.GROQ_MODEL = "llama-3.3-70b-versatile"
                    mock_settings.TOOL_ROUTER_TIMEOUT_SECONDS = 5.0
                    decision = await route_with_llm("tell me about BJP")
            self.assertTrue(decision.needs_tool)
            self.assertEqual(decision.tool_name, "wikipedia")
            self.assertEqual(decision.tool_args.get("topic"), "Bharatiya Janata Party")

        asyncio.run(_run())
    def test_news_maps_topic(self):
        d = _decision_from_tool_call("news_rss", {"topic": "AI"})
        self.assertTrue(d.needs_tool)
        self.assertEqual(d.tool_name, "news_rss")
        self.assertEqual(d.tool_args.get("topic"), "AI")

    def test_wikipedia_empty_topic_skips(self):
        d = _decision_from_tool_call("wikipedia", {})
        self.assertFalse(d.needs_tool)
        self.assertEqual(d.intent, Intent.GENERAL_CHAT)

    def test_city_candidates_order(self):
        c = _city_candidates("Ghansoli, Navi Mumbai")
        self.assertEqual(c[0], "Ghansoli, Navi Mumbai")
        self.assertIn("Ghansoli", c)
        self.assertIn("Navi Mumbai", c)

    def test_route_recovers_from_tool_use_failed(self):
        err_body = {
            "error": {
                "message": "Failed to call a function.",
                "code": "tool_use_failed",
                "failed_generation": '<function=weather>{"city": "Pune"}',
            }
        }
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = json.dumps(err_body)
        mock_response.json.return_value = err_body

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.post = AsyncMock(return_value=mock_response)

        async def _run():
            with patch("app.services.llm_tool_router.httpx.AsyncClient", return_value=mock_client):
                with patch("app.services.llm_tool_router.settings") as mock_settings:
                    mock_settings.GROQ_API_KEY = "test-key"
                    mock_settings.TOOL_ROUTER_MODEL = "llama-3.1-8b-instant"
                    mock_settings.GROQ_MODEL = "llama-3.3-70b-versatile"
                    mock_settings.TOOL_ROUTER_TIMEOUT_SECONDS = 5.0
                    decision = await route_with_llm("weather in Pune")
            self.assertTrue(decision.needs_tool)
            self.assertEqual(decision.tool_name, "weather")
            self.assertEqual(decision.tool_args.get("city"), "Pune")

        asyncio.run(_run())

    def test_route_with_llm_parses_tool_call(self):
        payload = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "function": {
                                    "name": "news_rss",
                                    "arguments": json.dumps({"topic": "recent news"}),
                                }
                            }
                        ]
                    }
                }
            ]
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = payload

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.post = AsyncMock(return_value=mock_response)

        async def _run():
            with patch("app.services.llm_tool_router.httpx.AsyncClient", return_value=mock_client):
                with patch("app.services.llm_tool_router.settings") as mock_settings:
                    mock_settings.GROQ_API_KEY = "test-key"
                    mock_settings.TOOL_ROUTER_MODEL = "llama-3.3-70b-versatile"
                    mock_settings.GROQ_MODEL = "llama-3.3-70b-versatile"
                    mock_settings.TOOL_ROUTER_TIMEOUT_SECONDS = 5.0
                    decision = await route_with_llm("tell me about recent news")
            self.assertTrue(decision.needs_tool)
            self.assertEqual(decision.tool_name, "news_rss")

        asyncio.run(_run())

    def test_route_with_llm_no_tool_is_general_chat(self):
        payload = {"choices": [{"message": {"content": "Sure, decorators are..."}}]}
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = payload
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.post = AsyncMock(return_value=mock_response)

        async def _run():
            with patch("app.services.llm_tool_router.httpx.AsyncClient", return_value=mock_client):
                with patch("app.services.llm_tool_router.settings") as mock_settings:
                    mock_settings.GROQ_API_KEY = "test-key"
                    mock_settings.TOOL_ROUTER_MODEL = "llama-3.3-70b-versatile"
                    mock_settings.GROQ_MODEL = "llama-3.3-70b-versatile"
                    mock_settings.TOOL_ROUTER_TIMEOUT_SECONDS = 5.0
                    decision = await route_with_llm("Explain Python decorators")
            self.assertFalse(decision.needs_tool)
            self.assertEqual(decision.intent, Intent.GENERAL_CHAT)

        asyncio.run(_run())


if __name__ == "__main__":
    unittest.main()
