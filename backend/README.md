# Iris AI Backend

FastAPI backend for Iris AI chat, conversation history, and soft-delete conversation APIs.

## Prerequisites

- Python 3.12
- `uv` (recommended) or `pip`

## Environment Setup

1. Copy the example file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

2. Fill values in `.env`.

### Required Variables

- `APP_NAME` - API/service display name.
- `DEBUG` - `True` for local dev, `False` for production.
- `SUPABASE_URL` - Supabase project URL.
- `SUPABASE_ANON_KEY` - Supabase anon/public key.
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (secret).
- `QDRANT_URL` - Qdrant instance URL.
- `QDRANT_API_KEY` - Qdrant API key.
- `GEMINI_API_KEY` - Gemini key (if used).
- `GROQ_API_KEY` - Groq API key.
- `GROQ_MODEL` - Chat model name.
- `AI_TEMPERATURE` - Model temperature.
- `AI_MAX_TOKENS` - Max output tokens.
- `AI_TOP_P` - Top-p sampling.

### Optional (chat guardrails & CORS)

See `.env.example` for defaults and comments:

- `CORS_ORIGINS` - Comma-separated browser origins (empty = allow any origin for local dev; set explicitly in production).
- `CHAT_MAX_MESSAGE_CHARS`, `CHAT_MAX_MESSAGES_PER_REQUEST` - Request size limits (HTTP 413 when exceeded).
- `CHAT_MAX_CONTEXT_TOKENS_ESTIMATE`, `CHAT_MEMORY_WINDOW` - Rough context budget and how many prior turns to load from DB.
- `CHAT_SYSTEM_PROMPT` - Override the default assistant system prompt (optional).
- `SUPABASE_HTTP_TIMEOUT_SECONDS` - HTTP timeouts for Supabase PostgREST/storage/functions clients.
- `GROQ_HTTP_TIMEOUT_SECONDS` - Timeout for Groq API calls (streaming needs a higher value than REST-only defaults).
- `CHAT_RATE_LIMIT_PER_MINUTE` - Per-user sliding-window limit on `POST /api/v1/chat` (set to `0` to disable).
- `REDIS_URL` - If set, chat rate limits are enforced in Redis (shared across workers). If unset, an in-memory limiter is used (per process only).
- `CHAT_MODERATION_ENABLED` - When `true`, user messages are checked with the OpenAI Moderations API before calling Groq (requires `OPENAI_API_KEY`).
- `CHAT_MODERATION_MODEL` - Moderation model id (default `omni-moderation-latest`).
- `OPENAI_API_KEY` - Used only for moderation when enabled (not required for Groq chat).
- `CHAT_AI_TITLE_ENABLED` - If `true` (default), after the first full user + assistant exchange the API calls Groq once to set a short sidebar title (`CHAT_TITLE_MAX_WORDS`, default 4).

### Observability

- Every response includes `X-Request-ID` (or echoes `X-Request-ID` from the client). Chat requests log one line with `user`, `conversation`, and `request_id`.
- Assistant rows in the database store `prompt_tokens` / `completion_tokens` when the Groq stream reports usage (otherwise `0`).

## Install and Run

Using `uv`:

```bash
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Alternative using `pip`:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API Base URL

Local API base URL is usually:

- `http://localhost:8000`

## Health

- `GET /health` returns `{"status":"ok"}` when the process is up.

## Security Notes

- Never commit `.env`.
- Commit only `.env.example` with placeholder values.
- Rotate keys immediately if a secret is ever exposed.
