"""The frozen API contract, as Pydantic models.

Field names and types here are the source of truth for /contracts/api.md.
Do not rename anything without a verbal sync with Person A — the frontend
renders directly off `format`, `hint_level`, `num_options`, and `memory_note`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

QuestionFormat = Literal["numeric", "groups", "array"]
Difficulty = Literal["easy", "medium", "hard"]


# --- POST /next-challenge -------------------------------------------------


class NextChallengeRequest(BaseModel):
    learner_id: str
    quest_id: int = Field(ge=1, le=3, description="1=bridge, 2=shelter, 3=boss")
    last_answer_correct: bool | None = None
    last_response_ms: int | None = None


class NextChallengeResponse(BaseModel):
    question_id: str
    question_text: str
    a: int
    b: int
    format: QuestionFormat
    options: list[int]
    correct_answer: int
    difficulty: Difficulty
    hint_level: int = Field(ge=0, le=2, description="0=none, 1=hint, 2=worked example")
    num_options: int = Field(description="4, or 2 after repeated errors")
    boss_trigger: bool = False
    memory_note: str | None = None
    hint_text: str | None = None
    worked_example: list[str] | None = None
    session_id: str


# --- POST /submit-answer --------------------------------------------------


class SubmitAnswerRequest(BaseModel):
    learner_id: str
    quest_id: int = Field(ge=1, le=3)
    question_id: str
    chosen_answer: int
    response_ms: int


class SubmitAnswerResponse(BaseModel):
    correct: bool
    blocks_awarded: int
    explanation: str | None = None
    explanation_style: QuestionFormat
    quest_complete: bool = False
    boss_defeated: bool = False
    consecutive_errors: int = 0
    tokens_used_this_call: int = 0
    tokens_used_session: int = 0


# --- GET /session-summary/{learner_id} ------------------------------------


class SessionSummaryResponse(BaseModel):
    learner_id: str
    session_number: int
    mastery_before: float
    mastery_after: float
    questions_session1: int
    questions_session2: int
    tokens_session1: int
    tokens_session2: int
    token_reduction_pct: int
    strategy_retrieved: str
    memory_source: str
    facts_mastered: list[str]
    facts_weak: list[str]
    pricing_cta: str
