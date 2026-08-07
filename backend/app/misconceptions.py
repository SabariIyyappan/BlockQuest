"""Classify wrong answers, and explain them in the learner's current format.

The classifier is what makes the EverOS memory worth storing. "Alex got 3x4
wrong" is not reusable next session; "Alex treats multiplication as addition"
is. Everything here feeds the observation text written in Phase 3.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Misconception = Literal["additive", "off_by_one", "near_group", "unknown"]

# Human-readable labels, used in EverOS observations and Snowflake rows.
LABELS: dict[Misconception, str] = {
    "additive": "treats multiplication as addition",
    "off_by_one": "skip-counting slip, off by one",
    "near_group": "counted one group too many or too few",
    "unknown": "unclassified error",
}


@dataclass(frozen=True)
class Diagnosis:
    misconception: Misconception
    label: str
    explanation: str


def classify(a: int, b: int, chosen: int) -> Misconception:
    """Name the error behind a wrong answer.

    Order matters: additive is checked first because it is the one that
    actually changes teaching strategy (switch to visual groups), and at small
    operands it can coincide with the other patterns.
    """
    product = a * b

    if chosen == a + b:
        return "additive"
    if abs(chosen - product) == 1:
        return "off_by_one"
    if chosen in (product + a, product - a, product + b, product - b):
        return "near_group"
    return "unknown"


def _explain_numeric(a: int, b: int, chosen: int, misconception: Misconception) -> str:
    product = a * b
    if misconception == "additive":
        return (
            f"You answered {chosen}, which is {a} + {b}. But {a} × {b} means "
            f"{a} groups of {b}. That's {product}."
        )
    if misconception == "off_by_one":
        return f"So close — {chosen} is nearly right. Count once more: {a} × {b} = {product}."
    if misconception == "near_group":
        return (
            f"{chosen} counts the wrong number of groups. "
            f"{a} × {b} = {product}."
        )
    return f"Not quite {chosen}. {a} × {b} = {product}."


def _explain_groups(a: int, b: int, chosen: int, misconception: Misconception) -> str:
    product = a * b
    steps = " + ".join([str(b)] * a)
    if misconception == "additive":
        return (
            f"Adding gives {chosen}, but multiplying is different. "
            f"Picture {a} piles with {b} blocks in each: {steps} = {product}."
        )
    return (
        f"You answered {chosen}. Count the piles: {a} piles of {b} blocks. "
        f"{steps} = {product}."
    )


def _explain_array(a: int, b: int, chosen: int, misconception: Misconception) -> str:
    product = a * b
    if misconception == "additive":
        return (
            f"Adding gives {chosen}. Instead, look at the rectangle: "
            f"{a} rows with {b} blocks each fills {product} squares."
        )
    return (
        f"You answered {chosen}. Count the rectangle: "
        f"{a} rows × {b} columns = {product} squares."
    )


_EXPLAINERS = {
    "numeric": _explain_numeric,
    "groups": _explain_groups,
    "array": _explain_array,
}


def diagnose(a: int, b: int, chosen: int, question_format: str) -> Diagnosis:
    """Full diagnosis for a wrong answer, explained in the active format."""
    misconception = classify(a, b, chosen)
    explainer = _EXPLAINERS.get(question_format, _explain_numeric)
    return Diagnosis(
        misconception=misconception,
        label=LABELS[misconception],
        explanation=explainer(a, b, chosen, misconception),
    )


def worked_example(a: int, b: int) -> list[str]:
    """Step-by-step build-up for hint_level 2.

    Returned as a list so the frontend can animate one step per 500ms
    (task A2.4) instead of parsing a blob of text.
    """
    steps = [f"{a} × {b} means {a} groups of {b}."]
    running = 0
    for group in range(1, a + 1):
        previous = running
        running += b
        if group == 1:
            steps.append(f"Group 1: {b}.")
        else:
            steps.append(f"Group {group}: {previous} + {b} = {running}.")
    steps.append(f"So {a} × {b} = {a * b}.")
    return steps


def hint_text(a: int, b: int, question_format: str) -> str:
    """One-line nudge for hint_level 1."""
    if question_format == "groups":
        return f"Think in piles: {a} piles, {b} blocks in each."
    if question_format == "array":
        return f"Think of a rectangle {a} rows tall and {b} blocks wide."
    return "Think about groups, not adding."
