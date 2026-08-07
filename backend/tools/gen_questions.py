"""Generate data/questions.json — the static multiplication fact bank.

Deterministic: same output every run, so the committed JSON is reviewable in
diffs. Run from anywhere:

    python backend/tools/gen_questions.py
"""

from __future__ import annotations

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

MIN_OPERAND = 2
MAX_OPERAND = 9


def difficulty_tier(a: int, b: int) -> str:
    """Tier by product, with a bump for the notoriously sticky 7s and 8s."""
    product = a * b
    if product <= 24:
        tier = "easy"
    elif product <= 42:
        tier = "medium"
    else:
        tier = "hard"

    # 7x6, 8x6 etc. are harder than their product alone suggests.
    if tier == "easy" and (a >= 7 or b >= 7):
        tier = "medium"
    return tier


def build_distractors(a: int, b: int) -> dict[str, int]:
    """Three plausible wrong answers, each tied to a real misconception.

    - additive:   the learner added instead of multiplying (3x4 -> 7)
    - off_by_one: a slip while skip-counting (3x4 -> 11 or 13)
    - near_group: counted one group too many (3x4 -> 16, i.e. 3x5)

    Collisions happen at small operands (2x2: additive 4 == product 4), so each
    slot falls back through candidates until it finds a positive, unused value.
    """
    product = a * b
    used = {product}
    out: dict[str, int] = {}

    candidates = {
        "additive": [a + b, a + b + 1, product - 1],
        "off_by_one": [product + 1, product - 1, product + 2],
        "near_group": [product + a, product - a, product + b, product - b],
    }

    for slot, options in candidates.items():
        for value in options:
            if value > 0 and value not in used:
                out[slot] = value
                used.add(value)
                break
        else:  # pragma: no cover - unreachable for operands 2..9
            raise ValueError(f"no distractor available for {a}x{b} slot {slot}")

    return out


def build_bank() -> list[dict]:
    facts = []
    # Canonical a <= b: 3x4 and 4x3 are the same fact, and treating them as one
    # is both correct (commutativity) and keeps mastery from splitting in two.
    for a in range(MIN_OPERAND, MAX_OPERAND + 1):
        for b in range(a, MAX_OPERAND + 1):
            distractors = build_distractors(a, b)
            facts.append(
                {
                    "fact_id": f"{a}x{b}",
                    "a": a,
                    "b": b,
                    "product": a * b,
                    "difficulty_tier": difficulty_tier(a, b),
                    "distractors": distractors,
                }
            )
    return facts


def main() -> None:
    bank = build_bank()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / "questions.json"
    out_path.write_text(json.dumps(bank, indent=2) + "\n", encoding="utf-8")

    tiers: dict[str, int] = {}
    for fact in bank:
        tiers[fact["difficulty_tier"]] = tiers.get(fact["difficulty_tier"], 0) + 1
    print(f"wrote {len(bank)} facts to {out_path}")
    print(f"tiers: {tiers}")


if __name__ == "__main__":
    main()
