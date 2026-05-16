# Production Text Chatbot Plan (Backend-First)

This document is the working blueprint for building a production-grade text-to-text chatbot in `iris_ai`.

## 1) Goal and Scope

Build a reliable chatbot backend that supports:
- Authenticated users
- Real-time streaming responses
- Conversation memory
- Optional RAG for grounded answers
- Observability, safety, and scale-ready design

Out of scope for this phase:
- Image/audio/video pipelines
- Advanced document parsing workflows

---

## 2) Target Request Flow (Text Chat)

1. Client sends `POST /api/v1/chat` with message and optional `conversation_id`.
2. Backend verifies JWT and resolves `user_id`.
3. Router decides:
   - direct LLM path (general question), or
   - RAG path (needs private/grounded knowledge).
4. Backend loads memory (recent chat turns / summary).
5. Backend builds prompt with system instructions + memory (+ retrieved context when RAG).
6. Model gateway calls LLM and streams tokens back via SSE.
7. Backend stores user + assistant messages in DB.
8. Logs/metrics/traces are emitted with request IDs.

---

## 3) Architecture Components (What to Add)

### A. API Layer
- Keep FastAPI as API entrypoint.
- Keep SSE streaming response in chat endpoint.
- Add request schema validation and robust error handling.

Suggested location:
- `backend/app/api/v1/chat.py`

### B. Config and Secrets
- Centralize model/provider settings, DB keys, limits, and feature flags.
- Use env-based config only; no hardcoded secrets.

Suggested location:
- `backend/app/core/config.py`
- `backend/.env` (local only)

### C. Auth + Identity
- Validate JWT on each chat request.
- Resolve `user_id` and attach to request context.
- Enforce tenancy boundaries from this point onward.

Suggested location:
- New: `backend/app/core/auth.py`
- Called from: `backend/app/api/v1/chat.py`

### D. Conversation Memory
- Store/retrieve conversations and messages.
- Sliding window of last N turns.
- Add summarization strategy for long conversations (later step).

Suggested location:
- New: `backend/app/services/memory_service.py`
- New: `backend/app/repositories/chat_repository.py`

### E. Routing Layer (Direct vs RAG)
- Decide whether request should use direct generation or retrieval-augmented generation.
- Initial version can be rule-based; later move to model-assisted router.

Suggested location:
- New: `backend/app/services/router_service.py`

### F. Model Gateway
- One abstraction for all model calls.
- Supports primary model + fallback model.
- Handles retries, timeouts, and provider-specific differences.

Suggested location:
- Refactor from: `backend/app/services/ai_service.py`
- Optional split:
  - `backend/app/services/model_gateway.py`
  - `backend/app/services/providers/*.py`

### G. RAG Service (Phase 2 for text grounding)
- Query rewrite (optional), retrieve top-k, rerank, and context packaging.
- Always filter by `user_id`/tenant metadata in vector retrieval.

Suggested location:
- New: `backend/app/services/rag_service.py`
- New: `backend/app/repositories/vector_repository.py`

### H. Persistence Layer
- DB operations isolated behind repositories.
- Store:
  - `conversations`
  - `messages`
  - optional `message_feedback`

Suggested location:
- `backend/app/repositories/*.py`

### I. Observability
- Structured logging with request IDs.
- Metrics: latency, token usage, errors, retrieval hit rate.
- Traces across API -> DB -> vector -> model.

Suggested location:
- New: `backend/app/core/logging.py`
- New: `backend/app/core/observability.py`

### J. Safety and Policy
- Prompt-injection checks for retrieved context.
- Basic moderation and refusal policy.
- PII-safe logging rules.

Suggested location:
- New: `backend/app/services/safety_service.py`

---

## 4) Recommended Backend Folder Blueprint

```txt
backend/
  app/
    api/
      v1/
        chat.py
    core/
      config.py
      auth.py
      logging.py
      observability.py
    services/
      ai_service.py
      model_gateway.py
      router_service.py
      memory_service.py
      rag_service.py
      safety_service.py
    repositories/
      chat_repository.py
      vector_repository.py
    main.py
```

---

## 5) Build Order (Production-Friendly)

### Phase 1: Stable Chat Core
1. Auth in chat endpoint.
2. Conversation/message persistence.
3. Sliding-window memory.
4. Standardized model gateway + streaming.
5. Error handling + request IDs + logging.

### Phase 2: Grounded Intelligence
6. Router (direct vs RAG).
7. Basic RAG service with strict tenant filters.
8. Retrieval quality improvements (rewrite/rerank/citations).

### Phase 3: Reliability and Scale
9. Rate limits and quotas.
10. Fallback model and circuit breaker.
11. Dashboards + alerts.
12. Load test and optimization.

---

## 6) API Contract (Initial)

### Request (`POST /api/v1/chat`)
- `messages`: list of `{ role, content }`
- `conversation_id`: optional string

### Response
- `text/event-stream` (SSE chunks)
- Final `[DONE]` event

Future additions:
- `mode` (`auto|direct|rag`)
- `metadata` (latency, citations, model name)

---

## 7) Data Model (Minimum)

- `conversations`
  - `id`, `user_id`, `title`, `created_at`, `updated_at`
- `messages`
  - `id`, `conversation_id`, `role`, `content`, `metadata`, `created_at`

Optional:
- `message_feedback` for quality signals

---

## 8) Non-Functional Requirements

- P95 end-to-end latency target for short prompts
- Graceful degradation on provider failure
- No secret leakage in logs
- Deterministic error codes for clients
- Backward-compatible API versioning

---

## 9) Definition of Done (Text Chatbot v1)

Ship when all are true:
- Authenticated chat works end-to-end with streaming.
- Conversation history persists and restores context.
- Router can choose direct vs RAG paths.
- Errors are observable and diagnosable from logs/metrics.
- Baseline tests pass (unit + integration).

---

## 10) Notes for Current Codebase

Current files already present:
- `backend/app/main.py`
- `backend/app/api/v1/chat.py`
- `backend/app/services/ai_service.py`
- `backend/app/core/config.py`

This plan extends those files instead of replacing the existing structure.


## Remaining Functionality (To Reach Production-Grade Text Chat)

### 1) Conversation Listing API
- Add `GET /api/v1/chat/conversations` with pagination (`limit`, `cursor`/`offset`).
- Return `id`, `title`, `last_message_at`, `updated_at`, and optional preview text.
- Sort by `last_message_at desc` and enforce ownership (`user_id`).

### 2) Accurate Token and Cost Tracking
- Capture real provider usage (`prompt_tokens`, `completion_tokens`, `total_tokens`) per assistant message.
- Store model/provider metadata and estimated cost per request.
- Add per-user daily/weekly usage summaries for monitoring and limits.

### 3) Reliability and Error Strategy
- Add retry policy for transient LLM/provider failures (timeouts, 5xx, rate limits).
- Add idempotency key support for chat requests to avoid duplicate writes on retries.
- Ensure graceful fallback responses when provider/database is temporarily unavailable.

### 4) Rate Limiting and Abuse Protection
- Enforce per-user and per-IP request limits.
- Add request size limits and basic prompt abuse guards.
- Return consistent 429 responses with retry guidance headers.

### 5) Observability and Operations
- Add structured logs with `request_id`, `user_id`, `conversation_id`, latency, and error class.
- Add metrics: success/error rate, p95 latency, stream completion rate, token usage.
- Add alerting thresholds for error spikes and latency regressions.

### 6) Security Hardening
- Rotate exposed API keys and enforce secret management policy.
- Tighten CORS for known frontend domains (remove `*` in production).
- Review auth failure paths and ensure no sensitive data leaks in errors/logs.

### 7) Conversation Management Endpoints
- Add update conversation title endpoint.
- Add soft-delete conversation endpoint (and hide deleted data in listing/history).
- Add restore/delete workflows if required by product policy.

### 8) Testing and QA
- Unit tests: auth parsing, repository methods, conversation resolver logic.
- Integration tests: `/chat`, history endpoint, ownership/RLS behavior.
- Stream tests: SSE chunk format and end-of-stream persistence checks.

### 9) Deployment Readiness
- Add environment-specific config validation at startup.
- Add health check and readiness endpoints.
- Add CI pipeline checks (lint, tests, import check, type checks if enabled).

### 10) Next Future Extensions (After Text MVP)
- Attachments upload pipeline (`pdf`, `image`) with Supabase Storage integration.
- Document ingestion and chunking for RAG.
- Retrieval and citation layer with strict user-level filtering.