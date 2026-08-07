"""Per-learner runtime state.

In-memory on purpose. Anything that must survive a browser refresh belongs in
EverOS or Snowflake — that is the demo's central claim, and keeping this layer
deliberately forgetful is what makes the claim testable. Refreshing the page
wipes everything here; the memory bubble still appears.
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field

from .mastery import MasteryTracker
from .models import QuestionFormat

# Questions required to finish each quest.
QUEST_LENGTHS = {1: 3, 2: 2, 3: 3}


@dataclass
class PendingQuestion:
    """A question served but not yet answered."""

    question_id: str
    fact_id: str
    a: int
    b: int
    correct_answer: int
    question_format: QuestionFormat
    hint_level: int
    num_options: int
    difficulty: str
    memory_was_used: bool
    tokens: int


@dataclass
class QuestProgress:
    asked: int = 0
    correct: int = 0
    complete: bool = False


@dataclass
class LearnerState:
    learner_id: str
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    session_number: int = 1
    mastery: MasteryTracker = field(default_factory=MasteryTracker)
    mastery_at_session_start: float = 0.0
    consecutive_errors: int = 0
    last_misconception: str | None = None
    asked_fact_ids: set[str] = field(default_factory=set)
    pending: dict[str, PendingQuestion] = field(default_factory=dict)
    quests: dict[int, QuestProgress] = field(default_factory=dict)
    tokens_this_session: int = 0
    blocks_earned: int = 0
    started_quests: set[int] = field(default_factory=set)

    # The format a correction actually happened under — the one thing from this
    # session worth carrying into the next one.
    effective_format: QuestionFormat | None = None

    # The gold bubble is a moment, not a status bar. Show it once per session.
    memory_note_shown: bool = False

    def quest(self, quest_id: int) -> QuestProgress:
        return self.quests.setdefault(quest_id, QuestProgress())

    def quest_length(self, quest_id: int) -> int:
        return QUEST_LENGTHS.get(quest_id, 3)


class SessionStore:
    """Thread-safe learner registry.

    uvicorn serves requests across a thread pool, so the lock is not optional
    even though the demo is single-user.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._learners: dict[str, LearnerState] = {}
        # Survives learner state resets, so a browser refresh increments the
        # session number instead of restarting it at 1.
        self._session_counts: dict[str, int] = {}

    def get_or_create(self, learner_id: str) -> LearnerState:
        with self._lock:
            state = self._learners.get(learner_id)
            if state is None:
                count = self._session_counts.get(learner_id, 0) + 1
                self._session_counts[learner_id] = count
                state = LearnerState(
                    learner_id=learner_id,
                    session_number=count,
                )
                self._learners[learner_id] = state
            return state

    def peek(self, learner_id: str) -> LearnerState | None:
        with self._lock:
            return self._learners.get(learner_id)

    def start_new_session(self, learner_id: str) -> LearnerState:
        """Simulate the browser refresh from the demo script.

        Mastery carries over only through what memory and the warehouse know;
        this drops the live state exactly as closing the tab would.
        """
        with self._lock:
            self._learners.pop(learner_id, None)
        return self.get_or_create(learner_id)

    def reset(self, learner_id: str) -> None:
        """Full wipe including session numbering. Tests and seeding only."""
        with self._lock:
            self._learners.pop(learner_id, None)
            self._session_counts.pop(learner_id, None)


session_store = SessionStore()
