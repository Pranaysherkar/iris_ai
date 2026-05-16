"""Query preprocessor and fact extraction tests."""

import unittest

from app.core.intent_rules import match_intent
from app.core.spell_map import apply_spell_map
from app.core.tool_schemas import Intent
from app.services.fact_extractor import extract_facts
from app.services.query_preprocessor import preprocess_query


class QueryPreprocessorTests(unittest.TestCase):
    def test_spell_map_typo(self):
        self.assertIn("temperature", apply_spell_map("what is temprature"))

    def test_weather_followup_from_history(self):
        history = [
            {"role": "user", "content": "temperature in my area"},
            {"role": "assistant", "content": "Which city should I check the weather for?"},
        ]
        pre = preprocess_query("ghansoli", history)
        self.assertEqual(pre.follow_up_weather_city, "ghansoli")
        self.assertIn("ghansoli", pre.routing_text.lower())
        decision = match_intent(pre.routing_text, history)
        self.assertEqual(decision.intent, Intent.LIVE_WEATHER)
        self.assertTrue(decision.needs_tool)
        self.assertEqual(decision.tool_args.get("city"), "ghansoli")

    def test_extract_name_fact(self):
        facts = extract_facts("Hi, my name is Pranay")
        keys = {k for k, _ in facts}
        self.assertIn("name", keys)

    def test_pending_metadata_followup(self):
        pre = preprocess_query(
            "Mumbai",
            [],
            pending_tool={"intent": "live_weather", "tool": "weather"},
        )
        self.assertIn("mumbai", pre.routing_text.lower())


if __name__ == "__main__":
    unittest.main()
