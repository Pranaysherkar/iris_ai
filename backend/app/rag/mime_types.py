"""MIME / extension helpers for attachment ingest routing."""

from __future__ import annotations

from typing import Optional, Tuple

# (mime_prefix_or_exact, attachment_type enum value)
_ALLOWED: dict[str, str] = {
    "application/pdf": "pdf",
    "image/png": "image",
    "image/jpeg": "image",
    "image/jpg": "image",
    "image/webp": "image",
    "text/plain": "text",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "other",
    "application/msword": "other",
}

_EXT_MIME: dict[str, str] = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".txt": "text/plain",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
}


def guess_mime(file_name: Optional[str], content_type: Optional[str]) -> Optional[str]:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in _ALLOWED:
        return ct
    if ct == "image/jpg":
        return "image/jpeg"
    name = (file_name or "").lower()
    for ext, mime in _EXT_MIME.items():
        if name.endswith(ext):
            return mime
    return ct if ct in _ALLOWED else None


def attachment_type_for_mime(mime: str) -> str:
    return _ALLOWED.get(mime, "other")


def is_allowed_upload(file_name: Optional[str], content_type: Optional[str]) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Returns (ok, mime, attachment_type).
    """
    mime = guess_mime(file_name, content_type)
    if not mime or mime not in _ALLOWED:
        return False, None, None
    return True, mime, attachment_type_for_mime(mime)


def is_image_mime(mime: str) -> bool:
    return mime.startswith("image/")


def is_plain_text_mime(mime: str) -> bool:
    return mime == "text/plain"


def is_docx_mime(mime: str) -> bool:
    return mime in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    )
