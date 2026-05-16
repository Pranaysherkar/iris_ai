"""Output of the query preprocessing pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class PreprocessedQuery:
    original: str
    corrected: str
    routing_text: str
    follow_up_weather_city: Optional[str] = None
