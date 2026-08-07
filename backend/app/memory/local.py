"""Markdown-backed memory store — the cross-platform stand-in for EverOS.

Writes the same markdown shape EverOS produces, so the files look right when
shown on stage and the Phase 3 swap changes one config value rather than the
call sites. Retrieval is a keyword scan over recent observations: no vectors,
no index, no service to start.

This is a stand-in, not a reimplementation. It does not do extraction,
clustering, reflection, or semantic search.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from ..models import QuestionFormat
from .base import (
    STRATEGY_LABELS,
    LearnerContext,
    Observation,
    compose_memory_note,
)

# Retrieval looks at the most recent observations only. A learner who has moved
# on from a misconception should not keep being taught around it.
RECENT_WINDOW = 20


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9_-]+", "-", value.lower()).strip("-") or "learner"


class LocalMarkdownMemory:
    """One directory per learner, one markdown file per observation."""

    backend_name = "local-markdown"

    def __init__(self, memory_dir: Path):
        self.root = Path(memory_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def _learner_dir(self, learner_id: str) -> Path:
        path = self.root / _slugify(learner_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def store_observation(self, observation: Observation) -> None:
        learner_dir = self._learner_dir(observation.learner_id)
        stamp = observation.created_at.strftime("%Y%m%dT%H%M%S%f")[:-3]
        base = f"{stamp}_{observation.kind}"

        (learner_dir / f"{base}.md").write_text(
            observation.to_markdown(), encoding="utf-8"
        )

        # Sidecar JSON keeps retrieval from having to parse markdown back out.
        sidecar = {
            "kind": observation.kind,
            "topic": observation.topic,
            "event": observation.event,
            "inference": observation.inference,
            "effective_support": observation.effective_support,
            "context": observation.context,
            "session_id": observation.session_id,
            "created_at": observation.created_at.isoformat(),
            "search_text": observation.to_search_text(),
        }
        (learner_dir / f"{base}.json").write_text(
            json.dumps(sidecar, indent=2), encoding="utf-8"
        )

    def _load_recent(self, learner_id: str) -> list[dict]:
        learner_dir = self.root / _slugify(learner_id)
        if not learner_dir.exists():
            return []

        records = []
        for path in sorted(learner_dir.glob("*.json"), reverse=True)[:RECENT_WINDOW]:
            try:
                records.append(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError):
                # A corrupt sidecar must not take down the API mid-demo.
                continue
        return records

    def retrieve_learner_context(
        self,
        learner_id: str,
        topic: str = "multiplication",
        exclude_session_id: str | None = None,
    ) -> LearnerContext:
        records = self._load_recent(learner_id)

        # Memory written earlier in the *current* session is not a memory, it
        # is short-term state. Surfacing it would pop the gold "last time..."
        # bubble halfway through session 1 and give away the reveal.
        if exclude_session_id is not None:
            records = [r for r in records if r.get("session_id") != exclude_session_id]

        if not records:
            return LearnerContext()

        terms = {t for t in re.split(r"\W+", topic.lower()) if t}
        relevant = [
            r
            for r in records
            if not terms or terms & set(re.split(r"\W+", r["search_text"].lower()))
        ]
        if not relevant:
            return LearnerContext()

        # Corrections outrank summaries regardless of recency. A correction is
        # direct evidence that a format unstuck this learner; a summary is a
        # roll-up written at quest end and is far weaker evidence of the same
        # thing. Ordering by recency alone lets the weaker record win.
        ranked = sorted(
            relevant,
            key=lambda r: (0 if r.get("kind") == "correction" else 1,),
        )

        remembered: QuestionFormat | None = None
        for record in ranked:
            if record.get("effective_support"):
                remembered = record["effective_support"]
                break

        if remembered is None:
            return LearnerContext(
                found=True,
                source=self.backend_name,
                notes=[r["event"] for r in relevant[:3]],
            )

        label = STRATEGY_LABELS.get(remembered, remembered)
        return LearnerContext(
            found=True,
            remembered_format=remembered,
            memory_note=compose_memory_note(label),
            strategy_label=label,
            source=self.backend_name,
            notes=[r["event"] for r in relevant[:3]],
        )

    def purge(self, learner_id: str) -> int:
        """Delete a learner's memories. Used by seeding and tests only."""
        learner_dir = self.root / _slugify(learner_id)
        if not learner_dir.exists():
            return 0
        removed = 0
        for path in learner_dir.iterdir():
            if path.is_file():
                path.unlink()
                removed += 1
        return removed

    def describe(self, learner_id: str) -> str:
        """Where the files are — handy when showing them during the demo."""
        return str((self.root / _slugify(learner_id)).resolve())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
