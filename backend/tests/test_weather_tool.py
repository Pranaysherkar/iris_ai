"""Weather + geocode tests (mocked HTTP and optional live smoke)."""

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from app.core.intent_rules import match_intent
from app.core.tool_schemas import Intent
from app.services.tool_executor import execute_route
from app.tools import geocode, weather


class GeocodeWeatherTests(unittest.TestCase):
    def test_intent_temperature_in_city(self):
        d = match_intent("What's the temperature in Mumbai?")
        self.assertEqual(d.intent, Intent.LIVE_WEATHER)
        self.assertTrue(d.needs_tool)
        self.assertEqual(d.tool_args.get("city"), "Mumbai")

    def test_intent_temperature_typo_my_area(self):
        d = match_intent("what is the temprature in my area")
        self.assertEqual(d.intent, Intent.LIVE_WEATHER)
        self.assertFalse(d.needs_tool)
        self.assertTrue(d.clarify)

    def test_intent_my_area_clarify(self):
        d = match_intent("what is the temperature in my area")
        self.assertEqual(d.intent, Intent.LIVE_WEATHER)
        self.assertFalse(d.needs_tool)
        self.assertIn("city", (d.clarify or "").lower())

    def test_weather_tool_mocked(self):
        geo = {
            "query": "Mumbai",
            "label": "Mumbai, Maharashtra, India",
            "latitude": 19.07,
            "longitude": 72.87,
            "timezone": "Asia/Kolkata",
        }
        forecast = {
            "timezone": "Asia/Kolkata",
            "current": {
                "temperature_2m": 32.5,
                "relative_humidity_2m": 70,
                "weather_code": 1,
                "wind_speed_10m": 12.0,
            },
            "current_units": {
                "temperature_2m": "°C",
                "wind_speed_10m": "km/h",
            },
        }

        async def _run():
            with (
                patch.object(geocode, "resolve_city", new_callable=AsyncMock) as mock_geo,
                patch(
                    "app.tools.weather.get_json",
                    new_callable=AsyncMock,
                    side_effect=[forecast],
                ),
            ):
                mock_geo.return_value = geo
                result = await weather.run({"city": "Mumbai"})
                self.assertTrue(result.success)
                self.assertEqual(result.data["temperature"], 32.5)
                self.assertEqual(result.data["location"], geo["label"])
                self.assertIn("Mainly clear", result.data["conditions"])

        asyncio.run(_run())

    def test_weather_unknown_city(self):
        async def _run():
            with patch.object(
                geocode,
                "resolve_city",
                new_callable=AsyncMock,
                side_effect=ValueError("No location found for 'Xyzzy'"),
            ):
                result = await weather.run({"city": "Xyzzy"})
                self.assertFalse(result.success)
                self.assertIn("No location", result.error or "")

        asyncio.run(_run())

    def test_execute_route_weather_mocked(self):
        async def _run():
            decision = match_intent("Weather in London")
            with patch.object(
                weather,
                "run",
                new_callable=AsyncMock,
                return_value=__import__(
                    "app.tools.base", fromlist=["success_result"]
                ).success_result(
                    tool_name="weather",
                    source="test",
                    data={"temperature": 15, "location": "London"},
                ),
            ):
                result = await execute_route(decision)
                self.assertIsNotNone(result)
                self.assertTrue(result.success)

        asyncio.run(_run())


if __name__ == "__main__":
    unittest.main()
