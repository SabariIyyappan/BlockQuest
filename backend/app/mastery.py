"""Per-fact mastery tracking.

Exponential moving average over correct/incorrect attempts. Chosen over a
proper knowledge-tracing model for one reason: it moves fast enough that a
4-question demo shows a visible mastery jump on the reveal card.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# How much a single attempt moves the score.
#
# Tuned to the length of the session, not to a textbook. A quest asks each fact
# once, so "answered it right, first try, unaided" is the entire body of
# evidence available — at ALPHA=0.4 that moves a fact from 0.30 to 0.58 and
# nothing ever crosses MASTERED_THRESHOLD, leaving the reveal card reading
# "mastered 0 new facts". At 0.65 a clean first-try answer lands at 0.755 and
# counts.
#
# The cost is volatility: one wrong answer drops a mastered fact back to 0.26.
# For a three-minute demo that is the right trade — recency should dominate.
# For anything longer-lived, lower this and track attempt counts instead.
ALPHA = 0.65

# A fact at or above this counts as mastered on the reveal card.
MASTERED_THRESHOLD = 0.75

# Below this, a fact is "weak" and becomes a target for quest 2 and the boss.
WEAK_THRESHOLD = 0.5

# Starting assumption for a fact the learner has never attempted. Deliberately
# below WEAK_THRESHOLD: an unseen fact is a candidate for practice, not a
# proven gap.
DEFAULT_MASTERY = 0.3


@dataclass
class MasteryTracker:
    """Mastery scores for one learner, keyed by canonical fact_id ("3x4")."""

    scores: dict[str, float] = field(default_factory=dict)
    attempts: dict[str, int] = field(default_factory=dict)

    def get(self, fact_id: str) -> float:
        return self.scores.get(fact_id, DEFAULT_MASTERY)

    def update(self, fact_id: str, correct: bool) -> float:
        """Fold one attempt into the EMA and return the new score."""
        current = self.get(fact_id)
        target = 1.0 if correct else 0.0
        updated = (1 - ALPHA) * current + ALPHA * target

        # Clamp guards against float drift accumulating over a long session.
        updated = max(0.0, min(1.0, updated))

        self.scores[fact_id] = updated
        self.attempts[fact_id] = self.attempts.get(fact_id, 0) + 1
        return updated

    def overall(self) -> float:
        """Mean mastery across attempted facts only.

        Averaging over the whole 36-fact bank would drown the demo's movement
        in 30-odd untouched defaults, so untouched facts are excluded.
        """
        if not self.scores:
            return DEFAULT_MASTERY
        return sum(self.scores.values()) / len(self.scores)

    def weakest(self, candidates: list[str] | None = None) -> str | None:
        """Lowest-scoring fact, preferring ones already attempted.

        `candidates` restricts the search to a subset (e.g. the 3x/4x/6x tables
        during the diagnostic quest).
        """
        pool = candidates if candidates is not None else list(self.scores)
        if not pool:
            return None
        # Tie-break on fact_id so selection is deterministic across runs —
        # a demo that picks a different question each rehearsal is a demo you
        # cannot rehearse.
        return min(pool, key=lambda fid: (self.get(fid), fid))

    def mastered_facts(self) -> list[str]:
        return sorted(f for f, s in self.scores.items() if s >= MASTERED_THRESHOLD)

    def weak_facts(self) -> list[str]:
        return sorted(f for f, s in self.scores.items() if s < WEAK_THRESHOLD)

    def snapshot(self) -> dict[str, float]:
        return {f: round(s, 3) for f, s in sorted(self.scores.items())}
