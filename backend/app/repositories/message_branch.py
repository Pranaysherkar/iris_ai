"""Tree algorithms for ChatGPT-style message edit branches.

DSA notes:
- Messages form a forest of trees via ``parent_message_id``.
- Edit versions of the same turn share ``sibling_group_id`` and differ by ``branch_version``.
- The visible timeline is the unique root→leaf path where ``is_active_path`` is true.
- Switch: activate ancestors(target) ∪ descendants_along_max_seq(target); deactivate the rest.
"""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Any, Dict, Iterable, List, Optional, Set


def build_children_index(
    rows: Iterable[Dict[str, Any]],
) -> Dict[Optional[str], List[Dict[str, Any]]]:
    """parent_id -> children sorted by seq_no ascending."""
    children: Dict[Optional[str], List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        pid = row.get("parent_message_id")
        children[pid].append(row)
    for lst in children.values():
        lst.sort(key=lambda r: int(r.get("seq_no") or 0))
    return children


def collect_subtree_ids(
    root_id: str,
    children: Dict[Optional[str], List[Dict[str, Any]]],
) -> Set[str]:
    """BFS: root + all descendants."""
    out: Set[str] = set()
    q: deque[str] = deque([root_id])
    while q:
        nid = q.popleft()
        if nid in out:
            continue
        out.add(nid)
        for child in children.get(nid, []):
            cid = str(child["id"])
            if cid not in out:
                q.append(cid)
    return out


def ancestors_to_root(
    start_id: str,
    by_id: Dict[str, Dict[str, Any]],
) -> List[str]:
    """Path from root → start (inclusive), following parent_message_id."""
    chain: List[str] = []
    seen: Set[str] = set()
    cur: Optional[str] = start_id
    while cur and cur not in seen:
        seen.add(cur)
        chain.append(cur)
        row = by_id.get(cur)
        if not row:
            break
        parent = row.get("parent_message_id")
        cur = str(parent) if parent else None
    chain.reverse()
    return chain


def tip_via_max_seq_children(
    start_id: str,
    children: Dict[Optional[str], List[Dict[str, Any]]],
) -> List[str]:
    """
    From start, walk the unique preferred child at each step = max(seq_no).
    Returns path start → … → leaf (inclusive).
    """
    path = [start_id]
    cur = start_id
    guard = 0
    while guard < 10_000:
        guard += 1
        kids = children.get(cur) or []
        if not kids:
            break
        nxt = max(kids, key=lambda r: int(r.get("seq_no") or 0))
        nid = str(nxt["id"])
        path.append(nid)
        cur = nid
    return path


def active_path_ids_for_target(
    target_id: str,
    rows: List[Dict[str, Any]],
) -> Set[str]:
    """Union of ancestors(target) and max-seq descendant chain from target."""
    by_id = {str(r["id"]): r for r in rows}
    if target_id not in by_id:
        return set()
    children = build_children_index(rows)
    up = ancestors_to_root(target_id, by_id)
    down = tip_via_max_seq_children(target_id, children)
    return set(up) | set(down)


def leaf_of_path(path_ids: Set[str], rows: List[Dict[str, Any]]) -> Optional[str]:
    """Message on the path with the highest seq_no."""
    best_id: Optional[str] = None
    best_seq = -1
    for r in rows:
        rid = str(r["id"])
        if rid not in path_ids:
            continue
        seq = int(r.get("seq_no") or 0)
        if seq >= best_seq:
            best_seq = seq
            best_id = rid
    return best_id
