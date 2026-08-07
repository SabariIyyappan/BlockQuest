"""The memory boundary.

Everything the app knows about learner memory goes through `MemoryStore`.
That indirection is not architecture for its own sake — EverOS is POSIX-only
(it imports `fcntl` at module scope), so on Windows the real implementation
cannot even be imported. Keeping the app behind this protocol is what lets
Phases 1-2 run natively while the EverOS-backed store runs in Docker.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal, Protocol, runtime_checkable

from ..models import QuestionFormat

ObservationKind = Literal["error", "correction", "quest_summary"]

# How a format is described back to a child. "groups" is the string the demo
# script says out loud, so it must read like a teaching strategy, not an enum.
STRATEGY_LABELS: dict[str, str] = {
    "groups": "visual block groups",
    "array": "block arrays",
    "numeric": "plain equations",
}


@dataclass
class Observation:
    """One thing worth remembering about a learner.

    Deliberately richer than "got question X wrong". The reusable part is the
    inference — a misconception and the support that fixed it survive to the
    next session; a question id does not.
    """

    learner_id: str
    kind: ObservationKind
    topic: str
    event: str
    context: str
    inference: str | None = None
    effective_support: QuestionFormat | None = None
    hint_level: int | None = None
    response_ms: int | None = None
    mastery_snapshot: dict[str, float] = field(default_factory=dict)
    session_id: str | None = None
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    def to_markdown(self) -> str:
        """Human-readable record. Judges will read these files on stage."""
        stamp = self.created_at.isoformat(timespec="seconds")
        heading = {
            "error": "Observation",
            "correction": "Observation",
            "quest_summary": "Session Summary",
        }[self.kind]

        lines = [f"# {heading}: {self.learner_id} — {stamp}", ""]
        lines.append(f"- **Topic:** {self.topic}")
        lines.append(f"- **Event:** {self.event}")
        if self.inference:
            lines.append(f"- **Inference:** {self.inference}")
        if self.effective_support:
            label = STRATEGY_LABELS.get(
                self.effective_support, self.effective_support
            )
            lines.append(f"- **Effective support:** {label}")
        if self.hint_level is not None:
            lines.append(f"- **Hint level:** {self.hint_level}")
        lines.append(f"- **Context:** {self.context}")
        if self.response_ms is not None:
            lines.append(f"- **Response time:** {self.response_ms}ms")
        if self.mastery_snapshot:
            snapshot = ", ".join(
                f"{fid}={score:.2f}"
                for fid, score in sorted(self.mastery_snapshot.items())
            )
            lines.append(f"- **Mastery snapshot:** {snapshot}")
        if self.session_id:
            lines.append(f"- **Session:** {self.session_id}")
        return "\n".join(lines) + "\n"

    def to_search_text(self) -> str:
        """Flattened text for keyword/vector retrieval."""
        parts = [self.topic, self.event, self.inference or "", self.context]
        if self.effective_support:
            parts.append(STRATEGY_LABELS.get(self.effective_support, ""))
            parts.append(self.effective_support)
        return " ".join(p for p in parts if p)


@dataclass
class LearnerContext:
    """What memory had to say about this learner, ready for the API response."""

    found: bool = False
    remembered_format: QuestionFormat | None = None
    memory_note: str | None = None
    strategy_label: str = "none yet"
    source: str = "none"
    notes: list[str] = field(default_factory=list)


@runtime_checkable
class MemoryStore(Protocol):
    """Two operations. Resist adding a third."""

    @property
    def backend_name(self) -> str: ...

    def store_observation(self, observation: Observation) -> None: ...

    def retrieve_learner_context(
        self,
        learner_id: str,
        topic: str = "multiplication",
        exclude_session_id: str | None = None,
    ) -> LearnerContext: ...


class NullMemoryStore:
    """Remembers nothing. The honest baseline — this is Session 1 behaviour."""

    backend_name = "none"

    def store_observation(self, observation: Observation) -> None:
        return None

    def retrieve_learner_context(
        self,
        learner_id: str,
        topic: str = "multiplication",
        exclude_session_id: str | None = None,
    ) -> LearnerContext:
        return LearnerContext()


def compose_memory_note(strategy_label: str) -> str:
    """The gold speech bubble. This single string is the demo's 'aha' moment."""
    return f"Last time, {strategy_label} helped. Let's use that trick again."
