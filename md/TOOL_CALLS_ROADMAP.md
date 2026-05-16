# Iris AI — Tool Calls & Production Hardening Roadmap

**Status:** Phase A in progress — A0–A5 + `datetime` tool implemented (2026-05-16)  
**Purpose:** Single reference for tool-call features and production-grade add-ons so nothing is lost between phases.  
**Related docs:** `chatbot_plan.md`, `iris_ai_production_plan.md`, `backend/README.md`

---

## Implementation order (do not skip)

| Phase | Focus | Ship when |
|-------|--------|-----------|
| **A** | Tool calls (router → executor → tools → grounded Groq) | In progress (datetime done) |
| **B** | Production hardening (rate limits, cache, flags, logging, DB audit) | After A works end-to-end |

---

## Current vs target chat flow

### Today (`backend/app/api/v1/chat.py`)

```
POST /chat → validate → moderate (optional) → persist user → load memory
  → _prepare_model_messages (system prompt) → Groq stream → persist assistant
```

### Target (Phase A — tool calls)

```
POST /chat → validate → moderate → intent_router → tool_executor (optional)
  → context_builder (TOOL_RESULT) → _prepare_model_messages → Groq stream → persist assistant
```

Frontend unchanged: still sends `{ messages: [{ role: "user", content }], conversation_id? }`.

---

## Credentials (already sufficient)

| Capability | Env / keys |
|------------|------------|
| Chat (Groq) | `GROQ_API_KEY`, `GROQ_MODEL` |
| Auth + DB | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Moderation | `OPENAI_API_KEY`, `CHAT_MODERATION_ENABLED=true` |
| Web search/fetch | `OLLAMA_API_KEY` |

No extra API keys for: weather, geocode, Wikipedia, RSS, datetime, Frankfurter FX.

---

## Tools to build

| Tool | Module | API / source | Credentials |
|------|--------|--------------|-------------|
| `datetime` | `tools/datetime.py` | Server clock | None |
| `geocode` | `tools/geocode.py` | Open-Meteo geocoding (or Nominatim) | None |
| `weather` | `tools/weather.py` | Open-Meteo forecast | None (uses geocode) |
| `wikipedia` | `tools/wikipedia.py` | Wikipedia REST | None |
| `news_rss` | `tools/news_rss.py` | Public RSS feeds | None |
| `web_search` | `tools/web_search.py` | `POST https://ollama.com/api/web_search` | `OLLAMA_API_KEY` |
| `web_fetch` | `tools/web_fetch.py` | `POST https://ollama.com/api/web_fetch` | `OLLAMA_API_KEY` |
| `exchange_rates` | `tools/exchange_rates.py` | Frankfurter | None |
| `user_memory` | `tools/user_memory.py` | Supabase (profile/history) | Supabase keys |

**Not a router tool:** `services/moderation.py` (OpenAI) — runs before routing.

**Out of scope for v1:** embeddings, LangChain agent loop, MCP server (optional later).

---

## Intent → tool mapping

| Intent | Tool(s) | Notes |
|--------|---------|--------|
| `live_weather` | `geocode` → `weather` | City required; fail closed if geocode fails |
| `current_news` | `news_rss` or `web_search` | Prefer RSS when topic matches; else Ollama |
| `web_facts` | `web_search` (+ optional `web_fetch`) | Ollama quota — use sparingly |
| `encyclopedia` | `wikipedia` | Static facts, not breaking news |
| `exchange_rates` | `exchange_rates` | FX only, not stocks |
| `datetime` | `datetime` | “What date is it?” |
| `user_data` | `user_memory` | User’s own Supabase data only |
| `general_chat` | **none** | Groq only (coding, explanations, greetings) |

### Ambiguous example: “What’s the temperature?”

- Weather cues (city, “outside”, “forecast”) → `live_weather`
- Model/settings cues (“LLM”, “parameter”, “Groq”) → `general_chat`
- Unclear → **ask user** or use conversation history; **do not guess tool**

---

## Code modules (new + existing)

### New files (Phase A)

| File | Responsibility |
|------|----------------|
| `core/tool_schemas.py` | Pydantic: tool args, tool results, `RouteDecision` |
| `core/tool_registry.py` | Intent → tool name(s), required args |
| `core/intent_rules.py` | Keyword/pattern rules (free, high precision) |
| `services/intent_classifier.py` | Optional Groq JSON classify when rules fail |
| `services/intent_router.py` | Rules first → classifier → confidence threshold |
| `services/tool_executor.py` | Validate args, call tool, errors, logging hook |
| `services/context_builder.py` | Build `TOOL_RESULT` block (source, timestamp, JSON) |
| `tools/*.py` | One module per tool (see table above) |
| `services/chat_orchestrator.py` | *(optional)* Move pipeline out of `chat.py` |

### Modify (Phase A)

| File | Change |
|------|--------|
| `core/config.py` | `TOOLS_ENABLED`, `OLLAMA_API_KEY`, tool timeouts, per-tool flags |
| `core/prompts.py` | Grounded rules: live facts only from `TOOL_RESULT`; fail if tool failed |
| `api/v1/chat.py` | Wire: moderate → router → executor → context → existing stream |
| `.env.example` | Document `OLLAMA_API_KEY`, moderation flags |

### Existing (keep)

| File | Role |
|------|------|
| `services/moderation.py` | OpenAI safety before tools |
| `services/ai_service.py` | Groq streaming |
| `repositories/chat_repository.py` | Persist messages / memory |
| `core/rate_limit.py`, `core/redis_rate_limit.py` | Chat rate limit (reuse pattern for tools in Phase B) |

---

## Phase A — implementation steps

| Step | What |
|------|------|
| A0 | Config: `TOOLS_ENABLED`, `OLLAMA_API_KEY` in `config.py` + `.env.example` |
| A1 | `tool_schemas.py` + `tool_registry.py` |
| A2 | `tools/datetime.py` — smoke test tool path |
| A3 | `intent_rules.py` + `intent_router.py` + `tool_executor.py` |
| A4 | `context_builder.py` + update `prompts.py` (grounded) |
| A5 | Wire `chat.py`: after `moderate_user_input`, before `_prepare_model_messages` |
| A6 | `geocode` + `weather` |
| A7 | `web_search` + `web_fetch` (Ollama) |
| A8 | `wikipedia`, `news_rss`, `exchange_rates`, `user_memory` |
| A9 | `intent_classifier.py` fallback (low confidence → ask or no tool) |
| A10 | Manual tests: weather, news, general chat, ambiguous temperature |

### Recommended build order

```
datetime → router + executor → wire chat.py → weather+geocode → web_search → rest
```

---

## Example flows (reference)

### 1 — Weather

```
User: "Temperature in Mumbai?"
→ moderate OK → intent: live_weather
→ geocode(Mumbai) → weather(lat,lon)
→ TOOL_RESULT injected → Groq stream
```

### 2 — News

```
User: "Latest AI news today"
→ moderate OK → intent: current_news
→ news_rss OR web_search (Ollama)
→ TOOL_RESULT → Groq stream
```

### 3 — No tool

```
User: "Explain Python decorators"
→ moderate OK → intent: general_chat
→ skip executor → history + system prompt → Groq stream
```

---

## Phase B — production hardening (after tool calls work)

### Features checklist

| Feature | Primary code location | DB needed? |
|---------|----------------------|------------|
| Per-tool rate limits | `tool_executor.py` + `redis_rate_limit.py` + `config.py` | No (Redis) |
| Per-user tool quotas | Same + `user_id` from `deps.py` | Optional table later |
| Tool result cache (TTL) | `services/tool_cache.py` + `redis_client.py` | No (Redis) |
| Feature flags per tool | `config.py` + `tool_registry.py` | No |
| Structured logging | `tool_executor.py`, `intent_router.py` | No |
| Request tracing | Existing `request_id` middleware | No |
| Tool metadata on messages | `chat_repository.py` | Use `messages.metadata` JSONB (no migration required) |
| Tool usage analytics | `repositories/tool_usage_repository.py` | Optional: `tool_usage_events` table |
| Timeouts / retries | `tool_executor.py` + each `tools/*.py` | No |
| Fail closed on tool error | `chat.py` / orchestrator | No |
| Ollama quota monitoring | Logs + alerts on 429 | No |

### Where to change (code vs DB)

```
                    ┌─────────────────┐
                    │  api/v1/chat.py │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
  intent_router        tool_executor         context_builder
         │                   │
         │         ┌─────────┴─────────┐
         │         ▼                   ▼
         │    tool_cache (B)      redis_rate_limit (B)
         │         │                   │
         └────────► tools/*.py ◄───────┘
                             │
                             ▼
                    chat_repository → Supabase
                    (metadata JSONB for tool_name, payload)
```

### DB options (Phase B)

| Approach | When |
|----------|------|
| **`messages.metadata` JSONB** | Store `tool_name`, `intent`, `fetched_at` on assistant row — **start here** |
| **`tool_usage_events` table** | When you need dashboards / abuse analytics |
| **Redis only** | Rate limits + cache — no migration |

Existing schema: `db/04_tables_messages.sql` already has `metadata jsonb`.

---

## Design rules (do not break)

1. **Secrets** stay on backend only (never expose Ollama/OpenAI keys to frontend).
2. **Fail closed:** tool error → user-visible “couldn’t fetch” — no invented live data.
3. **Rules before LLM** for routing when possible (cheaper, more accurate).
4. **Low confidence** → clarify or skip tool; never force wrong tool.
5. **TOOL_RESULT** must include **source + timestamp**.
6. **Ollama web search** has unpublished quotas — cache + rate limit in Phase B.
7. **No 100% accuracy claim** — grounded + verifiable or explicit failure.

---

## Env vars to add (Phase A / B)

```env
# Phase A
TOOLS_ENABLED=true
OLLAMA_API_KEY=

# Phase B (examples)
TOOL_RATE_LIMIT_PER_MINUTE=10
TOOL_CACHE_TTL_SECONDS=300
TOOL_WEATHER_ENABLED=true
TOOL_WEB_SEARCH_ENABLED=true
REDIS_URL=                    # already used for chat rate limit
```

---

## Testing checklist (Phase A)

- [ ] Moderation blocks unsafe input (`CHAT_MODERATION_ENABLED=true`)
- [ ] `datetime` tool path end-to-end
- [ ] Weather + geocode with real city
- [ ] `web_search` with Ollama key
- [ ] General question skips all tools
- [ ] Ambiguous “temperature” asks back or uses history
- [ ] Tool failure does not hallucinate live data
- [ ] SSE stream still works; `X-Conversation-Id` unchanged

---

## Testing checklist (Phase B)

- [ ] Same weather query within TTL hits cache (no second API call)
- [ ] Rate limit returns 429 or friendly error when exceeded
- [ ] `messages.metadata` contains tool audit fields
- [ ] Feature flag disables broken tool without deploy

---

## What we are NOT doing in this roadmap

- Embeddings / vector RAG for tool routing (see `chatbot_plan.md` for separate RAG phase)
- LangChain agent framework (LlamaIndex + plain Python tools)
- MCP server in v1 (optional later for shared tools)
- Frontend tool selection UI

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-16 | Initial roadmap: tool calls (Phase A) + production hardening (Phase B) |
