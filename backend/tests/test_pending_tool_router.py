"""Forced weather routing for city follow-ups."""

import unittest

from app.core.tool_schemas import Intent
from app.services.pending_tool_router import forced_route_from_follow_up
from app.services.query_preprocessor import preprocess_query


class PendingToolRouterTests(unittest.TestCase):
    def test_forced_route_from_pending_only(self):
        pre = preprocess_query(
            "ghansoli",
            [],
            pending_tool={"intent": "live_weather", "tool": "weather"},
        )
        decision = forced_route_from_follow_up("ghansoli", pre, {"intent": "live_weather", "tool": "weather"})
        self.assertIsNotNone(decision)
        assert decision is not None
        self.assertEqual(decision.intent, Intent.LIVE_WEATHER)
        self.assertTrue(decision.needs_tool)
        self.assertEqual(decision.tool_args.get("city"), "ghansoli")

    def test_follow_up_with_current_user_in_history(self):
        history = [
            {"role": "user", "content": "temperature in my area"},
            {
                "role": "assistant",
                "content": (
                    "Which city should I check the weather for? "
                    "(For example: Mumbai, Delhi, London.) I can't detect your location automatically yet."
                ),
            },
            {"role": "user", "content": "ghansoli"},
        ]
        pre = preprocess_query("ghansoli", history)
        decision = forced_route_from_follow_up("ghansoli", pre, None)
        self.assertIsNotNone(decision)
        assert decision is not None
        self.assertEqual(decision.tool_args.get("city"), "ghansoli")


if __name__ == "__main__":
    unittest.main()
