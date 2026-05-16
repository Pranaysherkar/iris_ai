# Iris AI — Production-Grade Chatbot: Final Architecture Plan

This document serves as the "Source of Truth" for the Iris AI project. It outlines a high-accuracy, production-ready system capable of analyzing text, images, and documents.

---

## 1. The Production Tech Stack

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 14 (React)** | Industry standard for SEO, performance, and UI. |
| **Backend** | **FastAPI (Python)** | High-accuracy AI logic, native LlamaIndex support, and async performance. |
| **Core DB / Auth** | **Supabase (PostgreSQL)** | Handles User Auth, Chat History, and Metadata via JSONB. |
| **File Storage** | **Supabase Storage** | Fast, secure storage for user-uploaded PDFs and Images. |
| **Vector DB** | **Qdrant Cloud** | Dedicated Rust-based engine for sub-millisecond vector search. |
| **AI Orchestration**| **LlamaIndex (Python)** | Best-in-class framework for Advanced RAG and Data Ingestion. |
| **LLMs** | **Gemini 1.5 Pro** | 2M context window for massive documents and multimodal vision. |
| **Streaming** | **Server-Sent Events** | Real-time "typing" effect for AI responses. |

---

## 2. Behind-the-Scenes Workflows

### A. TEXT INPUT (Conversational)
1. **Request**: Next.js sends user text + `conversation_id` to FastAPI.
2. **Auth**: FastAPI verifies the user's JWT token with Supabase.
3. **Memory**: FastAPI pulls the last 5 messages from `messages` table in Supabase.
4. **LLM**: Gemini 1.5 Pro generates a response using history.
5. **Stream**: Response is streamed back to Next.js via SSE.
6. **Save**: Message + Response are saved to Supabase.

### B. IMAGE INPUT (Multimodal)
1. **Upload**: User drops image in Next.js; it's uploaded to **Supabase Storage**.
2. **Process**: FastAPI receives the `file_url`. 
3. **Vision**: Gemini 1.5 Pro Vision analyzes the image (OCR + Context).
4. **Structure**: Extracted data (e.g., invoice total, text in photo) is stored in a `JSONB` metadata column in Supabase.
5. **Chat**: AI answers questions about the image using the extracted context.

### C. DOCUMENT INPUT (Advanced RAG)
1. **Ingestion**: User uploads a PDF. 
2. **Parsing**: FastAPI uses **Docling** or **LlamaParse** to convert PDF to clean Markdown (preserving tables).
3. **Chunking**: Document is split into "Parent" (1024 tokens) and "Child" (256 tokens) chunks.
4. **Embedding**: Chunks are converted to vectors using `text-embedding-004`.
5. **Indexing**: 
   - Vectors go to **Qdrant** with `user_id` as a payload.
   - Metadata goes to **Supabase**.
6. **Retrieval**: When asked a question, Qdrant finds the top 5 chunks *filtered by the specific user_id*.

---

## 3. Solving Production Challenges

### Challenge 1: The "Dual-Write" Sync Problem
*   **Scenario**: Database saves, but Vector search fails.
*   **Solution**: **Transactional Outbox**. We record the "pending sync" in Supabase. A background worker (Celery/Inngest) ensures Qdrant eventually receives the data. We also run a "Reconciliation Job" every 24 hours to fix any drift.

### Challenge 2: Multi-Tenancy & Privacy
*   **Scenario**: User A accidentally sees User B's documents.
*   **Solution**: **Strict Metadata Filtering**. Every Qdrant query is forced to include `{"must": [{"key": "user_id", "match": {"value": current_user_id}}]}`.

### Challenge 3: Handling "Messy" Documents
*   **Scenario**: PDF has complex nested tables that confuse the AI.
*   **Solution**: **VLM-backed Parsing**. We use Vision-Language Models to "describe" complex tables before indexing them as text. This prevents the AI from "hallucinating" numbers.

---

## 4. Database Structure (Supabase/PostgreSQL)

| Table | Purpose | Key Columns |
| :--- | :--- | :--- |
| `profiles` | User info | `id (uuid)`, `username`, `avatar_url` |
| `conversations` | Grouping messages | `id`, `user_id`, `title`, `created_at` |
| `messages` | Chat history | `id`, `conv_id`, `role`, `content`, `metadata (jsonb)` |
| `documents` | File tracking | `id`, `user_id`, `file_url`, `status (processing/ready)` |

## 6. Data Structures & Algorithms (DSA) for Performance

To achieve "Production-Grade" speed and accuracy, Iris AI utilizes several advanced data structures and algorithms:

| DSA Component | Usage in Iris AI | Impact on Speed/Accuracy |
| :--- | :--- | :--- |
| **HNSW (Hierarchical Navigable Small World)** | Used in Qdrant/pgvector for finding similar text chunks. | **Speed**: Allows O(log N) search in millions of vectors instead of O(N). |
| **Inverted Index (BM25)** | Used for exact keyword matches (e.g., searching for a specific ID). | **Accuracy**: Catches exact terms that vector search might miss. |
| **Reciprocal Rank Fusion (RRF)** | Merging results from Vector search and Keyword search. | **Accuracy**: Uses a scoring formula to rank the most relevant results from both worlds. |
| **Min-Heaps (Priority Queues)** | Maintaining the "Top K" most relevant chunks during retrieval. | **Speed**: Keeps memory usage low while finding the best results. |
| **Sliding Window** | Managing "Chat Memory" so the AI doesn't forget context. | **Speed**: Prevents the prompt from becoming too large and slow by only keeping the most recent turns. |
| **Hash Maps / Bloom Filters**| **De-duplication**: Checking if a document has already been uploaded. | **Speed**: Instant check before starting expensive AI processing. |
| **Parent-Child Tree Map** | Linking small "Search Chunks" to larger "Context Chunks." | **Accuracy**: AI searches small text for speed, but reads the whole paragraph for better context. |

---

## 7. Development Roadmap

- **Phase 1 (Foundation)**: Setup Next.js + FastAPI "Hello World" connection.
- **Phase 2 (Auth)**: Integrate Supabase Auth into both Frontend and Backend.
- **Phase 3 (RAG)**: Connect Qdrant and implement PDF parsing with Docling.
- **Phase 4 (Vision)**: Implement Image upload and Gemini Vision analysis.
- **Phase 5 (Polish)**: Add streaming, citations (page numbers), and premium UI.
