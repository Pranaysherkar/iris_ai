"""Rough token estimates for context budgeting (no extra tokenizer dependency)."""

from typing import List


def estimate_tokens(text: str) -> int:
    """Heuristic: ~4 characters per token for Latin-heavy text."""
    if not text:
        return 0
    return max(1, (len(text) + 3) // 4)


def messages_estimated_tokens(messages: List[dict]) -> int:
    total = 0
    for m in messages:
        total += estimate_tokens(str(m.get("content", "")))
    return total


def _truncate_message_content(message: dict, target_chars: int) -> dict:
    last = dict(message)
    content = str(last.get("content", ""))
    if len(content) <= target_chars:
        return last
    last["content"] = content[: max(100, target_chars)] + "\n…[truncated for context limit]"
    return last


def _shrink_system_prefix(system_prefix: List[dict], max_tokens: int) -> List[dict]:
    """
    Shrink/drop non-persona system blocks (tool JSON, grounding, memory) when
    they alone exceed the budget. Persona (index 0) is kept and truncated last.
    """
    if not system_prefix or max_tokens < 1:
        return system_prefix

    msgs = [dict(m) for m in system_prefix]
    guard = 0
    while messages_estimated_tokens(msgs) > max_tokens and len(msgs) > 1 and guard < 40:
        guard += 1
        # Prefer trimming the last system block (usually live tool JSON).
        last = msgs[-1]
        content = str(last.get("content", ""))
        overflow = messages_estimated_tokens(msgs) - max_tokens
        # Cut enough chars to cover overflow; always reduce to avoid no-op loops.
        cut_chars = len(content) - overflow * 4 - 64
        cut_chars = min(cut_chars, len(content) - 80)
        if cut_chars < 160:
            msgs.pop()
            continue
        msgs[-1] = _truncate_message_content(last, cut_chars)

    if messages_estimated_tokens(msgs) > max_tokens and msgs:
        msgs[0] = _truncate_message_content(
            msgs[0],
            max(200, max_tokens * 4 - 32),
        )
        msgs = msgs[:1]
    return msgs


def trim_messages_to_estimated_token_budget(
    messages: List[dict],
    max_total_tokens: int,
) -> List[dict]:
    """
    Drop oldest chat turns until estimated token count fits budget.

    Keeps leading consecutive ``system`` messages (persona, grounding, live tools)
    but will shrink those system blocks when they alone exceed the budget so Groq
    TPM limits are not blown by large tool payloads.
    Never removes the newest turn entirely — may truncate its content as a last resort.
    """
    if not messages:
        return messages

    msgs = list(messages)
    prefix_end = 0
    while prefix_end < len(msgs) and str(msgs[prefix_end].get("role", "")).lower() == "system":
        prefix_end += 1
    system_prefix = msgs[:prefix_end]
    rest = msgs[prefix_end:]

    def total_tokens(parts: List[dict]) -> int:
        return messages_estimated_tokens(parts)

    # Reserve a little room for the latest user turn when possible.
    system_prefix = _shrink_system_prefix(
        system_prefix,
        max(256, int(max_total_tokens * 0.75)),
    )
    sys_cost = total_tokens(system_prefix)
    budget_for_rest = max(0, max_total_tokens - sys_cost)

    while rest and total_tokens(rest) > budget_for_rest and len(rest) > 1:
        rest.pop(0)

    if rest and total_tokens(rest) > budget_for_rest:
        rest = [_truncate_message_content(rest[-1], max(100, budget_for_rest * 4 - 32))]

    combined = system_prefix + rest
    # Final safety: if still over (edge cases), shrink system again against full budget.
    if total_tokens(combined) > max_total_tokens:
        system_prefix = _shrink_system_prefix(system_prefix, max(200, max_total_tokens // 2))
        sys_cost = total_tokens(system_prefix)
        budget_for_rest = max(0, max_total_tokens - sys_cost)
        if rest and total_tokens(rest) > budget_for_rest:
            rest = [_truncate_message_content(rest[-1], max(100, budget_for_rest * 4 - 32))]
        combined = system_prefix + rest

    return combined
