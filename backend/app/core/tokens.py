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


def trim_messages_to_estimated_token_budget(
    messages: List[dict],
    max_total_tokens: int,
) -> List[dict]:
    """
    Drop oldest messages until estimated token count fits budget.
    Keeps optional leading system message; never removes the newest turn entirely — may truncate its content.
    """
    if not messages:
        return messages

    msgs = list(messages)
    system_prefix: List[dict] = []
    rest = msgs
    if msgs and str(msgs[0].get("role", "")).lower() == "system":
        system_prefix = [msgs[0]]
        rest = msgs[1:]

    def total_tokens(parts: List[dict]) -> int:
        return messages_estimated_tokens(parts)

    sys_cost = total_tokens(system_prefix)
    budget_for_rest = max(0, max_total_tokens - sys_cost)

    while rest and total_tokens(rest) > budget_for_rest and len(rest) > 1:
        rest.pop(0)

    # One message still over budget: truncate content (chars ~= tokens * 4)
    if rest and total_tokens(rest) > budget_for_rest:
        last = dict(rest[-1])
        content = str(last.get("content", ""))
        target_chars = max(100, budget_for_rest * 4 - 32)
        if len(content) > target_chars:
            last["content"] = content[:target_chars] + "\n…[truncated for context limit]"
        rest = [last]

    return system_prefix + rest
