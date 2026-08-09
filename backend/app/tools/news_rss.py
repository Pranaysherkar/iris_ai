"""Headlines from configured public RSS feeds (no API key)."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any

import httpx

from app.core.config import settings
from app.core.tool_schemas import ToolResult
from app.tools.base import failure_result, success_result
from app.tools.http_client import fetch_text

TOOL_NAME = "news_rss"
SOURCE = "rss_feeds"


def _parse_rss_items(xml_text: str, *, limit: int) -> list[dict[str, str]]:
    root = ET.fromstring(xml_text)
    items: list[dict[str, str]] = []

    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        desc = (item.findtext("description") or "").strip()
        pub = (item.findtext("pubDate") or "").strip()
        if title or link:
            items.append(
                {
                    "title": title,
                    "url": link,
                    "description": desc[:500],
                    "published": pub,
                }
            )
        if len(items) >= limit:
            break

    if items:
        return items

    # Atom fallback
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for entry in root.findall(".//atom:entry", ns):
        title = (entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
        link_el = entry.find("atom:link", ns)
        link = (link_el.get("href") if link_el is not None else "") or ""
        summary = (entry.findtext("atom:summary", default="", namespaces=ns) or "").strip()
        updated = (entry.findtext("atom:updated", default="", namespaces=ns) or "").strip()
        if title or link:
            items.append(
                {
                    "title": title,
                    "url": link,
                    "description": summary[:500],
                    "published": updated,
                }
            )
        if len(items) >= limit:
            break

    return items


async def run(args: dict[str, Any]) -> ToolResult:
    feeds = settings.news_rss_feed_list()
    if not feeds:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error="No RSS feeds configured (TOOL_NEWS_RSS_FEEDS).",
        )

    max_headlines = max(1, min(int(settings.TOOL_NEWS_RSS_MAX_HEADLINES), 15))
    desc_chars = max(40, int(settings.TOOL_NEWS_RSS_DESC_CHARS))
    # Fetch a few per feed, then keep a global top-N for TPM.
    per_feed = max(1, min(int(args.get("per_feed") or 4), 8))
    topic = str(args.get("topic") or args.get("query") or "").strip().lower()
    headlines: list[dict[str, str]] = []
    errors: list[str] = []

    def _normalize_item(item: dict[str, str]) -> dict[str, str]:
        desc = str(item.get("description") or "").strip()
        if len(desc) > desc_chars:
            desc = desc[:desc_chars].rstrip() + "…"
        return {
            "title": str(item.get("title") or "").strip(),
            "url": str(item.get("url") or "").strip(),
            "description": desc,
            "published": str(item.get("published") or "").strip(),
        }

    all_items: list[dict[str, str]] = []
    for feed_url in feeds:
        try:
            xml_text = await fetch_text(feed_url)
            items = _parse_rss_items(xml_text, limit=per_feed)
            for item in items:
                normalized = _normalize_item(item)
                all_items.append(normalized)
                if topic:
                    blob = f"{normalized.get('title', '')} {normalized.get('description', '')}".lower()
                    if topic not in blob:
                        continue
                headlines.append(normalized)
        except (httpx.HTTPError, ET.ParseError) as exc:
            errors.append(f"{feed_url}: {exc}")
            continue

    topic_miss = bool(topic) and not headlines and bool(all_items)
    if topic_miss:
        # Topic filter found nothing (e.g. "AI" not in BBC/NYT titles) — still return
        # general headlines so the model can answer instead of inventing a city-filter failure.
        headlines = list(all_items)

    if not headlines:
        msg = "No headlines available from the configured news feeds right now."
        if errors:
            msg += f" (feed issues: {'; '.join(errors[:2])})"
        return failure_result(tool_name=TOOL_NAME, source=SOURCE, error=msg)

    kept = headlines[:max_headlines]
    return success_result(
        tool_name=TOOL_NAME,
        source=SOURCE,
        data={
            "topic_filter": topic or None,
            "topic_filter_relaxed": topic_miss,
            "headline_count": len(kept),
            "headlines": kept,
            **(
                {
                    "note": (
                        f"No headlines matched '{topic}' in the configured feeds; "
                        "showing top general headlines instead."
                    )
                }
                if topic_miss
                else {}
            ),
        },
    )
