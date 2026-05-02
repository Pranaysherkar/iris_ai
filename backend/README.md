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

## Security Notes

- Never commit `.env`.
- Commit only `.env.example` with placeholder values.
- Rotate keys immediately if a secret is ever exposed.
