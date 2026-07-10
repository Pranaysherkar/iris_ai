"""Unit tests for tool routing and datetime tool (stdlib only)."""

import asyncio
import unittest
from unittest.mock import patch

from app.core.config import settings
from app.core.intent_rules import match_intent
from app.core.tool_schemas import Intent
from app.services.tool_executor import execute_route
from app.services.intent_router import route_user_message
from app.tools.datetime_tool import run as run_datetime


class ToolPipelineTests(unittest.TestCase):
    def test_match_datetime_intent(self):
        d = match_intent("What is the current date and time?")
        self.assertEqual(d.intent, Intent.DATETIME)
        self.assertTrue(d.needs_tool)
        self.assertEqual(d.tool_name, "datetime")

    def test_general_chat_intent(self):
        d = match_intent("Explain Python decorators")
        self.assertEqual(d.intent, Intent.GENERAL_CHAT)
        self.assertFalse(d.needs_tool)

    def test_weather_without_city_clarify(self):
        d = match_intent("What's the temperature?")
        self.assertEqual(d.intent, Intent.LIVE_WEATHER)
        self.assertTrue(d.clarify)

    def test_datetime_tool_run(self):
        result = asyncio.run(run_datetime({}))
        self.assertTrue(result.success)
        self.assertIn("iso", result.data)

    def test_execute_datetime_route_regex_mode(self):
        async def _run():
            with patch.object(settings, "TOOL_ROUTER_MODE", "regex"):
                decision = await route_user_message("What time is it?")
            result = await execute_route(decision)
            self.assertIsNotNone(result)
            self.assertTrue(result.success)

        asyncio.run(_run())


if __name__ == "__main__":
    unittest.main()
