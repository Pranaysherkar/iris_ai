"""City name → coordinates via Open-Meteo geocoding API."""

from __future__ import annotations

from typing import Any, Optional

import httpx

from app.core.config import settings
from app.tools.open_meteo_client import get_json

SOURCE = "open_meteo_geocoding"


async def resolve_city(city: str) -> dict[str, Any]:
    """
    Resolve a place name to latitude, longitude, and display label.
    Raises ValueError when not found or ambiguous without a best match.
    """
    name = (city or "").strip()
    if not name:
        raise ValueError("City name is required")

    data = await get_json(
        settings.OPEN_METEO_GEOCODING_URL,
        {
            "name": name,
            "count": 1,
            "language": "en",
            "format": "json",
        },
    )
    results = data.get("results") or []
    if not results:
        raise ValueError(f"No location found for '{name}'")

    top = results[0]
    lat = top.get("latitude")
    lon = top.get("longitude")
    if lat is None or lon is None:
        raise ValueError(f"Invalid geocoding result for '{name}'")

    label_parts = [top.get("name"), top.get("admin1"), top.get("country")]
    label = ", ".join(p for p in label_parts if p)

    return {
        "query": name,
        "label": label or name,
        "latitude": float(lat),
        "longitude": float(lon),
        "timezone": top.get("timezone"),
        "country_code": top.get("country_code"),
    }
