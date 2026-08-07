"""Load the fact bank and choose the next question.

Question *text* lives here rather than in the JSON, because the same fact is
phrased differently depending on the quest (bridge / shelter / boss) and the
presentation format.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .config import DATA_DIR
from .mastery import MasteryTracker
from .models import Difficulty, QuestionFormat

# The diagnostic quest deliberately samples the 3x, 4x and 6x tables: wide
# enough to find a gap, narrow enough to finish in three questions.
DIAGNOSTIC_TABLES = (3, 4, 6)

# Quest 1 walks a fixed ladder rather than picking by mastery. Two reasons:
# with every fact sitting at the same default score there is no signal to pick
# on anyway, and a diagnostic that probes the same rungs every run is one the
# team can actually rehearse. 3x4 leads because it is the cleanest place to
# catch the additive misconception (3+4=7 is a plausible-looking answer).
DIAGNOSTIC_SEQUENCE = ("3x4", "4x6", "6x7")


@dataclass(frozen=True)
class Fact:
    fact_id: str
    a: int
    b: int
    product: int
    difficulty_tier: str
    distractors: dict[str, int]

    def options(self, num_options: int) -> list[int]:
        """Answer choices, always including the correct one, ascending.

        At num_options=2 the single distractor is the additive one — if the
        learner is going to guess wrong, the wrong choice should still be
        diagnostic.
        """
        if num_options <= 2:
            wrong = [self.distractors["additive"]]
        else:
            wrong = [
                self.distractors["additive"],
                self.distractors["off_by_one"],
                self.distractors["near_group"],
            ][: num_options - 1]
        return sorted({self.product, *wrong})


@lru_cache(maxsize=1)
def load_bank(path: Path | None = None) -> dict[str, Fact]:
    source = path or (DATA_DIR / "questions.json")
    raw = json.loads(source.read_text(encoding="utf-8"))
    return {entry["fact_id"]: Fact(**entry) for entry in raw}


def facts_for_tables(tables: tuple[int, ...]) -> list[str]:
    """Fact ids touching any of the given times-tables."""
    bank = load_bank()
    return sorted(
        fid for fid, fact in bank.items() if fact.a in tables or fact.b in tables
    )


def pick_fact(
    *,
    mastery_tracker: MasteryTracker,
    quest_id: int,
    difficulty: Difficulty,
    exclude: set[str] | None = None,
) -> Fact:
    """Select the fact for the next question.

    Quest 1 diagnoses across the 3x/4x/6x tables. Quest 2 drills whatever
    turned out weak. Quest 3 puts the single weakest fact in front of the boss,
    so beating the boss means beating the actual gap.
    """
    bank = load_bank()
    exclude = exclude or set()

    if quest_id == 1:
        for fact_id in DIAGNOSTIC_SEQUENCE:
            if fact_id not in exclude:
                return bank[fact_id]
        # Ladder exhausted (learner answered more than three) — widen out.
        pool = [f for f in facts_for_tables(DIAGNOSTIC_TABLES) if f not in exclude]
        tiered = [f for f in pool if bank[f].difficulty_tier == difficulty]
        pool = tiered or pool
    elif quest_id == 2:
        weak = [f for f in mastery_tracker.weak_facts() if f not in exclude]
        pool = weak or [f for f in facts_for_tables(DIAGNOSTIC_TABLES) if f not in exclude]
    else:  # boss
        weakest = mastery_tracker.weakest(
            [f for f in mastery_tracker.scores if f not in exclude]
        )
        if weakest:
            return bank[weakest]
        pool = [f for f in facts_for_tables(DIAGNOSTIC_TABLES) if f not in exclude]

    if not pool:
        # Everything's been asked. Reuse the weakest rather than erroring out —
        # a demo must never 500 because the learner was thorough.
        pool = sorted(bank)

    chosen = mastery_tracker.weakest(pool) or pool[0]
    return bank[chosen]


def question_text(fact: Fact, quest_id: int, question_format: QuestionFormat) -> str:
    """Phrase the fact for this quest and presentation format."""
    a, b = fact.a, fact.b

    if question_format == "groups":
        noun = {1: "planks", 2: "bricks", 3: "crystals"}.get(quest_id, "blocks")
        return f"How many {noun} in {a} groups of {b}?"

    if question_format == "array":
        return f"The wall is {a} rows tall and {b} blocks wide. How many blocks?"

    # numeric
    if quest_id == 1:
        return f"The bridge needs {a} rows of {b} blocks. How many blocks?"
    if quest_id == 2:
        return f"The shelter needs {a} walls of {b} bricks. How many bricks?"
    return f"The Glitch Golem guards {a} × {b} crystals. How many?"
