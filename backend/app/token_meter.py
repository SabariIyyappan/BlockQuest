"""Token accounting — the number the whole pitch turns on.

The build plan proposed flat estimates (150 tokens without memory, 80 with).
We can do better without an API key: build the prompt each path *would* send
and count it with tiktoken. The prompts below are the real ones the strategy
call uses — the no-memory path has to ship the mastery table and the full
teaching-format menu so the model can diagnose from scratch, while the
memory-assisted path ships a one-line recall. The size difference is the
argument, and it is measured rather than asserted.

`model_used` stays "rule_engine" until an actual LLM is wired in, so the
Snowflake dashboard never conflates measured prompts with billed ones.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

ENCODING_NAME = "cl100k_base"

# Fallback estimates, used only if tiktoken can't load (offline first run).
FALLBACK_NO_MEMORY = 150
FALLBACK_WITH_MEMORY = 80

# Completion side is short and roughly fixed: the engine wants a question id,
# a format, and a hint level back.
ASSUMED_COMPLETION_TOKENS = 24

_encoder = None


def _get_encoder():
    """Load the tiktoken encoder once, tolerating its absence."""
    global _encoder
    if _encoder is not None:
        return _encoder
    try:
        import tiktoken  # noqa: PLC0415

        _encoder = tiktoken.get_encoding(ENCODING_NAME)
    except Exception as exc:  # noqa: BLE001 - offline, missing cache, anything
        logger.warning("tiktoken unavailable (%s); using flat estimates", exc)
        _encoder = False
    return _encoder


@dataclass(frozen=True)
class TokenCost:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    model_used: str
    memory_was_used: bool
    counting_method: str  # "tiktoken" | "estimate"


def build_strategy_prompt(
    *,
    fact_id: str,
    mastery_snapshot: dict[str, float],
    memory_note: str | None,
) -> str:
    """The prompt the strategy step would send for this decision.

    Without memory it must carry the evidence needed to diagnose. With memory
    it carries a conclusion someone already paid for.
    """
    if memory_note:
        return (
            "You are BlockQuest's tutor. Recall from memory: "
            f"{memory_note} "
            f"Target fact: {fact_id}. "
            "Pick the next question, format, and hint level."
        )

    table = ", ".join(
        f"{fid}={score:.2f}" for fid, score in sorted(mastery_snapshot.items())
    ) or "no prior data"

    return (
        "You are BlockQuest's tutor for a child aged 8-12 learning "
        "multiplication. You have no history for this learner, so diagnose "
        "from scratch.\n"
        f"Current mastery estimates: {table}.\n"
        "Available teaching formats:\n"
        "- numeric: a plain equation, fastest but abstract.\n"
        "- groups: N piles of M blocks, concrete and good for learners who "
        "confuse multiplication with addition.\n"
        "- array: an N x M rectangle, good for area and commutativity.\n"
        "Common misconceptions to check for: additive substitution (a+b), "
        "skip-counting slips, and counting one group too many.\n"
        f"Target fact: {fact_id}.\n"
        "Choose the next question, the teaching format, and the hint level "
        "that maximise predicted mastery gain. Explain nothing; return only "
        "the choice."
    )


def count_tokens(text: str) -> int | None:
    encoder = _get_encoder()
    if not encoder:
        return None
    return len(encoder.encode(text))


def measure(
    *,
    call_type: str,
    fact_id: str,
    mastery_snapshot: dict[str, float],
    memory_note: str | None,
    model_used: str = "rule_engine",
) -> TokenCost:
    """Measure the cost of one strategy decision."""
    memory_was_used = memory_note is not None
    prompt = build_strategy_prompt(
        fact_id=fact_id,
        mastery_snapshot=mastery_snapshot,
        memory_note=memory_note,
    )

    counted = count_tokens(prompt)
    if counted is None:
        counted = FALLBACK_WITH_MEMORY if memory_was_used else FALLBACK_NO_MEMORY
        method = "estimate"
    else:
        method = "tiktoken"

    completion = ASSUMED_COMPLETION_TOKENS
    return TokenCost(
        prompt_tokens=counted,
        completion_tokens=completion,
        total_tokens=counted + completion,
        model_used=model_used,
        memory_was_used=memory_was_used,
        counting_method=method,
    )
