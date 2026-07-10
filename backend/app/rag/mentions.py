"""Parse @mentions that target uploaded attachments."""

from __future__ import annotations

import re
from typing import List, Optional, Sequence, Set
from uuid import UUID

from app.rag.types import MentionMatch

# @uuid or @"file name.pdf" or @file_name.pdf / @file-name
_MENTION_RE = re.compile(
    r"@(?:"
    r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
    r'|\"([^\"]{1,200})\"'
    r"|'([^']{1,200})'"
    r"|([A-Za-z0-9][A-Za-z0-9._ -]{0,198}[A-Za-z0-9])"
    r")"
)


def _is_uuid(value: str) -> Optional[str]:
    try:
        return str(UUID(value))
    except (ValueError, TypeError):
        return None


def parse_attachment_mentions(text: str) -> List[MentionMatch]:
    """Extract @mentions in left-to-right order (stable for UI highlighting)."""
    if not text:
        return []
    out: List[MentionMatch] = []
    for m in _MENTION_RE.finditer(text):
        uuid_g, dq, sq, bare = m.group(1), m.group(2), m.group(3), m.group(4)
        raw = m.group(0)
        if uuid_g:
            out.append(
                MentionMatch(
                    raw=raw,
                    start=m.start(),
                    end=m.end(),
                    attachment_id=_is_uuid(uuid_g),
                )
            )
            continue
        name = (dq or sq or bare or "").strip()
        if not name:
            continue
        as_uuid = _is_uuid(name)
        if as_uuid:
            out.append(
                MentionMatch(
                    raw=raw,
                    start=m.start(),
                    end=m.end(),
                    attachment_id=as_uuid,
                )
            )
        else:
            out.append(
                MentionMatch(
                    raw=raw,
                    start=m.start(),
                    end=m.end(),
                    file_name_query=name,
                )
            )
    return out


def resolve_attachment_ids(
    *,
    explicit_ids: Sequence[str] | None,
    mentions: Sequence[MentionMatch],
    filename_to_id: dict[str, str],
) -> List[str]:
    """
    Union explicit IDs + mention UUIDs + filename matches.
    Preserves insertion order; O(n) with a set for dedupe.
    """
    seen: Set[str] = set()
    ordered: List[str] = []

    def add(aid: Optional[str]) -> None:
        if not aid or aid in seen:
            return
        seen.add(aid)
        ordered.append(aid)

    for raw in explicit_ids or []:
        add(_is_uuid(str(raw).strip()) or None)

    # Lowercase filename index for case-insensitive match
    lower_map = {k.lower(): v for k, v in filename_to_id.items()}
    stem_map: dict[str, str] = {}
    for name, aid in filename_to_id.items():
        stem = name.rsplit(".", 1)[0].lower()
        stem_map.setdefault(stem, aid)

    for mention in mentions:
        if mention.attachment_id:
            add(mention.attachment_id)
            continue
        q = (mention.file_name_query or "").strip().lower()
        if not q:
            continue
        if q in lower_map:
            add(lower_map[q])
        elif q in stem_map:
            add(stem_map[q])
        else:
            # Prefix / contains soft match (first hit)
            for name_l, aid in lower_map.items():
                if name_l.startswith(q) or q in name_l:
                    add(aid)
                    break

    return ordered
