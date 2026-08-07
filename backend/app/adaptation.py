"""The rule engine that decides difficulty, format, and scaffolding.

This is the reliable path. Snowflake Cortex is a stretch goal layered on top
(Phase 4); if it fails or times out on stage, the demo runs identically off
these rules. Nothing here touches the network.
"""

from __future__ import annotations

from dataclasses import dataclass

from .mastery import MasteryTracker
from .models import Difficulty, QuestionFormat

# Two wrong answers in a row is the trigger for the attention-friendly
# simplification: fewer choices, bigger text, a worked example.
SIMPLIFY_AFTER_ERRORS = 2

FULL_OPTIONS = 4
REDUCED_OPTIONS = 2


@dataclass(frozen=True)
class Decision:
    difficulty: Difficulty
    question_format: QuestionFormat
    hint_level: int
    num_options: int
    boss_trigger: bool
    reason: str
    memory_applied: bool


def _difficulty_for(mastery: float) -> Difficulty:
    if mastery < 0.4:
        return "easy"
    if mastery <= 0.7:
        return "medium"
    return "hard"


def _default_format(mastery: float, attempted: bool) -> QuestionFormat:
    """Low mastery gets the concrete representation; high mastery gets symbols.

    Visual formats are slower to answer, so pushing a confident learner back
    into them wastes the session's most valuable resource: the child's
    attention.

    `attempted` matters as much as the score. An untouched fact sits at the
    default prior, which is below the visual threshold — without this guard
    every learner would open on groups and the switch to groups after a real
    misconception would be invisible. Scaffolding is a response to evidence,
    not an assumption about the child.
    """
    if not attempted:
        return "numeric"
    return "groups" if mastery < 0.4 else "numeric"


def decide(
    *,
    mastery_tracker: MasteryTracker,
    fact_id: str,
    quest_id: int,
    consecutive_errors: int,
    remembered_format: QuestionFormat | None = None,
    last_misconception: str | None = None,
) -> Decision:
    """Choose how to present the next question.

    Precedence, highest first:
      1. Repeated errors — scaffold hard, regardless of anything else.
      2. A live additive misconception — switch to visual groups now.
      3. EverOS memory of a format that worked before.
      4. Plain mastery bands.
    """
    mastery = mastery_tracker.get(fact_id)
    attempted = fact_id in mastery_tracker.attempts
    difficulty = _difficulty_for(mastery)
    question_format = _default_format(mastery, attempted)
    memory_applied = False
    reason = f"mastery {mastery:.2f} -> {difficulty}/{question_format}"

    if remembered_format is not None:
        question_format = remembered_format
        memory_applied = True
        reason = f"EverOS recalled '{remembered_format}' worked for this learner"

    # A misconception observed this session outranks a remembered preference:
    # it is fresher evidence about the same learner.
    if last_misconception == "additive":
        question_format = "groups"
        reason = "additive misconception observed -> visual groups"

    hint_level = 0
    num_options = FULL_OPTIONS

    if consecutive_errors >= SIMPLIFY_AFTER_ERRORS:
        hint_level = 2
        num_options = REDUCED_OPTIONS
        question_format = "groups"
        difficulty = "easy"
        reason = f"{consecutive_errors} errors in a row -> simplify and scaffold"
    elif consecutive_errors == 1:
        hint_level = 1
        reason = f"{reason}; one error -> small hint"

    return Decision(
        difficulty=difficulty,
        question_format=question_format,
        hint_level=hint_level,
        num_options=num_options,
        boss_trigger=quest_id == 3,
        reason=reason,
        memory_applied=memory_applied,
    )


def blocks_for(correct: bool, quest_id: int) -> int:
    """Blocks awarded for an answer.

    Never negative and never zero-on-correct: the game only ever adds. Wrong
    answers cost nothing but time, which is the whole point of the design.
    """
    if not correct:
        return 0
    return {1: 4, 2: 5, 3: 6}.get(quest_id, 4)
