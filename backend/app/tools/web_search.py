"""Web search via Ollama cloud API.

Results are structured for LLM grounding under Groq TPM limits:
- fetch up to 10 hits for variety
- keep title + url + one focused snippet (not full page text)
- enforce a total tool-context token budget (drop lowest-ranked first)
"""

from __future__ import annotations

from typing import Any, List

import httpx

from app.core.config import settings
from app.core.tokens import estimate_tokens
from app.core.tool_schemas import ToolResult
from app.tools.base import failure_result, success_result
from app.tools.ollama_client import OllamaApiError, post_json

TOOL_NAME = "web_search"
SOURCE = "ollama_web_search"


def _clip_snippet(text: str, max_chars: int) -> str:
    """Whitespace-normalize and hard-cap snippet length at a word boundary when possible."""
    t = " ".join((text or "").split())
    if not t:
        return ""
    if max_chars < 1 or len(t) <= max_chars:
        return t
    budget = max(1, max_chars - 1)
    head = t[:budget]
    if " " in head:
        head = head.rsplit(" ", 1)[0]
    return head.rstrip(".,;:") + "…"


def _normalize_results(raw: list[Any], snippet_chars: int) -> List[dict[str, str]]:
    out: List[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        raw_content = str(item.get("content") or item.get("snippet") or "").strip()
        clipped = _clip_snippet(raw_content, snippet_chars)
        out.append(
            {
                "title": str(item.get("title") or "").strip(),
                "url": str(item.get("url") or "").strip(),
                "content": clipped,
            }
        )
    return out


def _fit_results_to_token_budget(
    results: List[dict[str, str]],
    max_context_tokens: int,
) -> List[dict[str, str]]:
    """Keep highest-ranked results until estimated serialized size fits the budget."""
    if max_context_tokens < 1 or not results:
        return results

    kept: List[dict[str, str]] = []
    for row in results:
        candidate = kept + [row]
        # Mirror roughly what we put into LIVE_CONTEXT JSON.
        est = estimate_tokens(str(candidate))
        if kept and est > max_context_tokens:
            break
        kept.append(row)
        if est > max_context_tokens:
            # Single oversized row — keep it alone (already snippet-clipped).
            break
    return kept or results[:1]


async def run(args: dict[str, Any]) -> ToolResult:
    query = str(args.get("query") or "").strip()
    if not query:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error="Missing required argument: query",
        )

    max_results = int(args.get("max_results") or settings.TOOL_WEB_SEARCH_MAX_RESULTS)
    max_results = max(1, min(max_results, 10))
    snippet_chars = max(80, int(settings.TOOL_WEB_SEARCH_SNIPPET_CHARS))
    # Leave room inside the tool block for instructions / envelope fields.
    result_budget = max(500, int(settings.TOOL_WEB_SEARCH_MAX_CONTEXT_TOKENS) - 400)

    try:
        data = await post_json(
            "/api/web_search",
            {"query": query, "max_results": max_results},
        )
    except OllamaApiError as exc:
        return failure_result(tool_name=TOOL_NAME, source=SOURCE, error=str(exc))
    except httpx.HTTPError as exc:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"Web search request failed: {exc}",
        )

    results = _normalize_results(data.get("results") or [], snippet_chars)
    results = _fit_results_to_token_budget(results, result_budget)
    if not results:
        return failure_result(
            tool_name=TOOL_NAME,
            source=SOURCE,
            error=f"No web results found for: {query}",
        )

    return success_result(
        tool_name=TOOL_NAME,
        source=SOURCE,
        data={
            "query": query,
            "result_count": len(results),
            "results": results,
            "snippet_chars": snippet_chars,
        },
    )
