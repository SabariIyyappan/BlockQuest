"""The analytics boundary — everything that will become Snowflake rows.

Row shapes here mirror the four tables in the build plan exactly (ATTEMPTS,
QUEST_EVENTS, AI_TOKEN_USAGE, PLAYERS), so the Phase 4 Snowflake sink is an
INSERT per dataclass and nothing upstream changes.

Writes are fire-and-forget by contract: an analytics failure must never
surface as a failed answer submission during the demo.
"""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol, runtime_checkable


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class AttemptRow:
    learner_id: str
    session_id: str
    quest_id: int
    question_id: str
    fact_a: int
    fact_b: int
    correct_answer: int
    chosen_answer: int
    is_correct: bool
    response_ms: int
    explanation_style: str
    hint_level: int
    misconception: str | None = None
    attempt_id: str = field(default_factory=_uuid)
    timestamp: str = field(default_factory=_now)


@dataclass
class QuestEventRow:
    learner_id: str
    session_id: str
    quest_id: int
    event_type: str  # quest_start | quest_complete | boss_defeated | adaptation_triggered
    event_data: dict[str, Any] = field(default_factory=dict)
    event_id: str = field(default_factory=_uuid)
    timestamp: str = field(default_factory=_now)


@dataclass
class TokenUsageRow:
    learner_id: str
    session_id: str
    call_type: str  # diagnose | explain | select_strategy | retrieve_memory
    model_used: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    memory_was_used: bool  # the field the entire pitch rests on
    usage_id: str = field(default_factory=_uuid)
    timestamp: str = field(default_factory=_now)


@runtime_checkable
class AnalyticsSink(Protocol):
    @property
    def sink_name(self) -> str: ...

    def log_attempt(self, row: AttemptRow) -> None: ...

    def log_quest_event(self, row: QuestEventRow) -> None: ...

    def log_token_usage(self, row: TokenUsageRow) -> None: ...

    def session_token_totals(self, learner_id: str) -> dict[str, int]: ...

    def session_call_counts(self, learner_id: str) -> dict[str, int]: ...

    def session_strategy_token_averages(self, learner_id: str) -> dict[str, int]: ...

    def session_question_counts(self, learner_id: str) -> dict[str, int]: ...


def row_to_dict(row: Any) -> dict[str, Any]:
    return asdict(row)
