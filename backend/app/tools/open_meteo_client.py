"""Shared HTTP client for Open-Meteo (no API key)."""

from __future__ import annotations

from typing import Any, Optional

import httpx

from app.core.config import settings

WMO_WEATHER_LABELS: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def wmo_label(code: Optional[int]) -> str:
    if code is None:
        return "Unknown"
    return WMO_WEATHER_LABELS.get(int(code), f"Weather code {code}")


async def get_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    timeout = httpx.Timeout(settings.TOOL_HTTP_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Expected JSON object from Open-Meteo")
        return data
