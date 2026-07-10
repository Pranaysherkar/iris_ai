"""Current weather via Open-Meteo forecast API."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings
from app.core.tool_schemas import ToolResult
from app.tools import geocode
from app.tools.base import failure_result, success_result
from app.tools.open_meteo_client import get_json, wmo_label

TOOL_NAME = "weather"
SOURCE = "open_meteo_forecast"


def _city_candidates(city: str) -> list[str]:
    """
    Build geocode candidates in priority order (deduped).
    'Ghansoli, Navi Mumbai' → try full, then Ghansoli, then Navi Mumbai.
    """
    cleaned = " ".join(city.split()).strip(" ,")
    if not cleaned:
        return []
    out: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        key = value.casefold()
        if value and key not in seen:
            seen.add(key)
            out.append(value)

    add(cleaned)
    if "," in cleaned:
        for part in cleaned.split(","):
            add(part.strip())
    return out


async def run(args: dict[str, Any]) -> ToolResult:
    city = str(args.get("city") or "").strip()
    if not city:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error="Missing required argument: city",
        )

    candidates = _city_candidates(city)
    location: dict[str, Any] | None = None
    last_error = f"No location found for {city!r}"
    resolved_query = city

    for candidate in candidates:
        try:
            location = await geocode.resolve_city(candidate)
            resolved_query = candidate
            break
        except ValueError as exc:
            last_error = str(exc)
            continue
        except httpx.HTTPError as exc:
            return failure_result(
                tool_name=TOOL_NAME,
                source=SOURCE,
                error=f"Geocoding service unavailable: {exc}",
            )

    if location is None:
        return failure_result(tool_name=TOOL_NAME, source=SOURCE, error=last_error)

    lat = location["latitude"]
    lon = location["longitude"]

    try:
        forecast = await get_json(
            settings.OPEN_METEO_FORECAST_URL,
            {
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                "timezone": "auto",
            },
        )
    except httpx.HTTPError as exc:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"Weather service unavailable: {exc}",
        )

    current = forecast.get("current") or {}
    units = forecast.get("current_units") or {}
    temp = current.get("temperature_2m")
    code = current.get("weather_code")

    if temp is None:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error="Weather data did not include current temperature.",
        )

    temp_unit = units.get("temperature_2m") or "°C"
    wind_unit = units.get("wind_speed_10m") or "km/h"

    return success_result(
        tool_name=TOOL_NAME,
        source=SOURCE,
        data={
            "city_query": resolved_query,
            "user_city_query": city,
            "location": location["label"],
            "latitude": lat,
            "longitude": lon,
            "temperature": temp,
            "temperature_unit": temp_unit,
            "conditions": wmo_label(code),
            "weather_code": code,
            "relative_humidity_percent": current.get("relative_humidity_2m"),
            "wind_speed": current.get("wind_speed_10m"),
            "wind_speed_unit": wind_unit,
            "timezone": forecast.get("timezone") or location.get("timezone"),
        },
    )
