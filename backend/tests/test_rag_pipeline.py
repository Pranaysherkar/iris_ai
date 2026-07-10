"""Unit tests for RAG chunker, normalize, and @mention resolution."""

from app.rag.chunker import chunk_text, estimate_tokens
from app.rag.mentions import parse_attachment_mentions, resolve_attachment_ids
from app.rag.normalize import normalize_document_text
from app.rag.mime_types import is_allowed_upload
from app.rag.retrieve import format_document_context
from app.rag.types import RetrievedChunk
from app.services.context_builder import inject_document_context


def test_normalize_collapses_whitespace_and_control_chars() -> None:
    raw = "Hello\x00  world\r\n\r\n\r\nNext\t\tline"
    out = normalize_document_text(raw)
    assert "\x00" not in out
    assert "\r" not in out
    assert "\n\n\n" not in out
    assert "Hello world" in out
    assert "Next line" in out


def test_chunk_text_overlap_and_order() -> None:
    paras = [f"Paragraph {i}. " + ("word " * 40) for i in range(12)]
    text = "\n\n".join(paras)
    chunks = chunk_text(text, chunk_size=400, overlap=80)
    assert len(chunks) >= 2
    assert chunks[0].index == 0
    assert chunks[1].index == 1
    suffix = chunks[0].content[-60:]
    assert any(tok in chunks[1].content for tok in suffix.split()[:3] if len(tok) > 3)
    assert all(c.token_estimate == estimate_tokens(c.content) for c in chunks)


def test_chunk_text_empty() -> None:
    assert chunk_text("") == []
    assert chunk_text("   ") == []


def test_parse_mentions_uuid_and_filename() -> None:
    text = 'See @a1b2c3d4-e5f6-7890-abcd-ef1234567890 and @"Report Q1.pdf" plus @notes.txt'
    mentions = parse_attachment_mentions(text)
    assert len(mentions) == 3
    assert mentions[0].attachment_id == "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    assert mentions[1].file_name_query == "Report Q1.pdf"
    assert mentions[2].file_name_query == "notes.txt"


def test_resolve_attachment_ids_dedupes_and_matches_stem() -> None:
    uid = "11111111-1111-1111-1111-111111111111"
    uid2 = "22222222-2222-2222-2222-222222222222"
    mentions = parse_attachment_mentions(f"@{uid} and @budget")
    resolved = resolve_attachment_ids(
        explicit_ids=[uid, uid],
        mentions=mentions,
        filename_to_id={"Budget_2026.pdf": uid2},
    )
    assert resolved == [uid, uid2]


def test_mime_allowlist() -> None:
    ok, mime, atype = is_allowed_upload("doc.pdf", "application/pdf")
    assert ok and mime == "application/pdf" and atype == "pdf"
    ok2, _, _ = is_allowed_upload("virus.exe", "application/octet-stream")
    assert not ok2


def test_format_and_inject_document_context() -> None:
    chunks = [
        RetrievedChunk(
            attachment_id="a",
            chunk_index=0,
            content="Revenue grew 12%.",
            score=0.91,
            file_name="q1.pdf",
        )
    ]
    body = format_document_context(chunks)
    assert "q1.pdf" in body
    assert "Revenue grew 12%" in body
    msgs = [{"role": "system", "content": "You are Iris"}, {"role": "user", "content": "hi"}]
    out = inject_document_context(msgs, context_body=body)
    assert out[0]["content"] == "You are Iris"
    assert "DOCUMENT_CONTEXT" in out[2]["content"]
    assert "Revenue grew 12%" in out[2]["content"]
