"""Orchestration: one function per endpoint.

Keeping this separate from main.py means the whole game loop is testable
without an HTTP client, and the route handlers stay thin enough to read in one
screen.

Memory and analytics calls are wrapped defensively throughout. Neither is
allowed to turn a wrong answer into a 500 during the demo.
"""

from __future__ import annotations

import logging

from . import adaptation, misconceptions, token_meter
from .mastery import MasteryTracker
from .memory import LearnerContext, MemoryStore, Observation
from .models import (
    NextChallengeRequest,
    NextChallengeResponse,
    SessionSummaryResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
)
from .question_bank import load_bank, pick_fact, question_text
from .session import LearnerState, PendingQuestion, SessionStore
from .telemetry import AnalyticsSink, AttemptRow, QuestEventRow, TokenUsageRow

logger = logging.getLogger(__name__)

PRICE_PER_MONTH = 12


class QuestionNotFoundError(LookupError):
    """Submitted question_id was never served, or was already answered."""


class BlockQuestService:
    def __init__(
        self,
        *,
        memory: MemoryStore,
        analytics: AnalyticsSink,
        sessions: SessionStore,
    ):
        self.memory = memory
        self.analytics = analytics
        self.sessions = sessions

    # --- helpers ----------------------------------------------------------

    def _safe_retrieve(self, state: LearnerState) -> LearnerContext:
        try:
            return self.memory.retrieve_learner_context(
                state.learner_id,
                topic="multiplication",
                exclude_session_id=state.session_id,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("memory retrieval failed: %s", exc)
            return LearnerContext()

    def _safe_store(self, observation: Observation) -> None:
        try:
            self.memory.store_observation(observation)
        except Exception as exc:  # noqa: BLE001
            logger.warning("memory write failed: %s", exc)

    def _safe_log(self, fn, row) -> None:
        try:
            fn(row)
        except Exception as exc:  # noqa: BLE001
            logger.warning("analytics write failed: %s", exc)

    # --- POST /next-challenge --------------------------------------------

    def next_challenge(self, req: NextChallengeRequest) -> NextChallengeResponse:
        state = self.sessions.get_or_create(req.learner_id)

        if req.quest_id not in state.started_quests:
            state.started_quests.add(req.quest_id)
            if not state.mastery.scores:
                state.mastery_at_session_start = state.mastery.overall()
            self._safe_log(
                self.analytics.log_quest_event,
                QuestEventRow(
                    learner_id=state.learner_id,
                    session_id=state.session_id,
                    quest_id=req.quest_id,
                    event_type="quest_start",
                    event_data={"session_number": state.session_number},
                ),
            )

        context = self._safe_retrieve(state)

        # Difficulty needs a fact and fact selection needs a difficulty, so the
        # first pass uses overall mastery to break the cycle, then the real
        # decision is made against the fact that was actually chosen.
        provisional = adaptation._difficulty_for(state.mastery.overall())
        fact = pick_fact(
            mastery_tracker=state.mastery,
            quest_id=req.quest_id,
            difficulty=provisional,
            exclude=state.asked_fact_ids,
        )

        decision = adaptation.decide(
            mastery_tracker=state.mastery,
            fact_id=fact.fact_id,
            quest_id=req.quest_id,
            consecutive_errors=state.consecutive_errors,
            remembered_format=context.remembered_format,
            last_misconception=state.last_misconception,
        )

        cost = token_meter.measure(
            call_type="select_strategy",
            fact_id=fact.fact_id,
            mastery_snapshot=state.mastery.snapshot(),
            memory_note=context.memory_note,
        )
        state.tokens_this_session += cost.total_tokens

        self._safe_log(
            self.analytics.log_token_usage,
            TokenUsageRow(
                learner_id=state.learner_id,
                session_id=state.session_id,
                call_type="select_strategy",
                model_used=cost.model_used,
                prompt_tokens=cost.prompt_tokens,
                completion_tokens=cost.completion_tokens,
                total_tokens=cost.total_tokens,
                memory_was_used=cost.memory_was_used,
            ),
        )

        if decision.memory_applied:
            self._safe_log(
                self.analytics.log_quest_event,
                QuestEventRow(
                    learner_id=state.learner_id,
                    session_id=state.session_id,
                    quest_id=req.quest_id,
                    event_type="adaptation_triggered",
                    event_data={"reason": decision.reason},
                ),
            )

        question_id = f"q_{fact.fact_id}_{state.quest(req.quest_id).asked + 1}"
        options = fact.options(decision.num_options)

        # The bubble is the reveal, so it fires once per session. Note this is
        # purely presentational — memory still drives every decision and every
        # token measurement below, it just stops shouting about it.
        surfaced_note = None
        if context.memory_note and not state.memory_note_shown:
            surfaced_note = context.memory_note
            state.memory_note_shown = True

        state.asked_fact_ids.add(fact.fact_id)
        state.quest(req.quest_id).asked += 1
        state.pending[question_id] = PendingQuestion(
            question_id=question_id,
            fact_id=fact.fact_id,
            a=fact.a,
            b=fact.b,
            correct_answer=fact.product,
            question_format=decision.question_format,
            hint_level=decision.hint_level,
            num_options=decision.num_options,
            difficulty=decision.difficulty,
            memory_was_used=cost.memory_was_used,
            tokens=cost.total_tokens,
        )

        return NextChallengeResponse(
            question_id=question_id,
            question_text=question_text(fact, req.quest_id, decision.question_format),
            a=fact.a,
            b=fact.b,
            format=decision.question_format,
            options=options,
            correct_answer=fact.product,
            difficulty=decision.difficulty,
            hint_level=decision.hint_level,
            num_options=decision.num_options,
            boss_trigger=decision.boss_trigger,
            memory_note=surfaced_note,
            hint_text=(
                misconceptions.hint_text(fact.a, fact.b, decision.question_format)
                if decision.hint_level >= 1
                else None
            ),
            worked_example=(
                misconceptions.worked_example(fact.a, fact.b)
                if decision.hint_level >= 2
                else None
            ),
            session_id=state.session_id,
        )

    # --- POST /submit-answer ---------------------------------------------

    def submit_answer(self, req: SubmitAnswerRequest) -> SubmitAnswerResponse:
        state = self.sessions.get_or_create(req.learner_id)
        pending = state.pending.pop(req.question_id, None)
        if pending is None:
            raise QuestionNotFoundError(req.question_id)

        correct = req.chosen_answer == pending.correct_answer
        had_errors = state.consecutive_errors > 0
        state.mastery.update(pending.fact_id, correct)

        explanation: str | None = None
        misconception: str | None = None

        if correct:
            state.consecutive_errors = 0
            state.last_misconception = None
        else:
            state.consecutive_errors += 1
            diagnosis = misconceptions.diagnose(
                pending.a, pending.b, req.chosen_answer, pending.question_format
            )
            explanation = diagnosis.explanation
            misconception = diagnosis.misconception
            state.last_misconception = misconception

        # Explaining a wrong answer is a second AI call in a real system, so it
        # is metered separately. Session 1 has more of these, which is part of
        # why it costs more.
        tokens_this_call = pending.tokens
        if explanation is not None:
            explain_tokens = token_meter.count_tokens(explanation) or 40
            tokens_this_call += explain_tokens
            state.tokens_this_session += explain_tokens
            self._safe_log(
                self.analytics.log_token_usage,
                TokenUsageRow(
                    learner_id=state.learner_id,
                    session_id=state.session_id,
                    call_type="explain",
                    model_used="rule_engine",
                    prompt_tokens=explain_tokens,
                    completion_tokens=0,
                    total_tokens=explain_tokens,
                    memory_was_used=pending.memory_was_used,
                ),
            )

        self._safe_log(
            self.analytics.log_attempt,
            AttemptRow(
                learner_id=state.learner_id,
                session_id=state.session_id,
                quest_id=req.quest_id,
                question_id=req.question_id,
                fact_a=pending.a,
                fact_b=pending.b,
                correct_answer=pending.correct_answer,
                chosen_answer=req.chosen_answer,
                is_correct=correct,
                response_ms=req.response_ms,
                explanation_style=pending.question_format,
                hint_level=pending.hint_level,
                misconception=misconception,
            ),
        )

        self._write_answer_memory(
            state=state,
            pending=pending,
            req=req,
            correct=correct,
            had_errors=had_errors,
            misconception=misconception,
        )

        blocks = adaptation.blocks_for(correct, req.quest_id)
        state.blocks_earned += blocks

        progress = state.quest(req.quest_id)
        if correct:
            progress.correct += 1
        quest_complete = progress.correct >= state.quest_length(req.quest_id)
        boss_defeated = quest_complete and req.quest_id == 3

        if quest_complete and not progress.complete:
            progress.complete = True
            self._on_quest_complete(state, req.quest_id, pending, boss_defeated)

        return SubmitAnswerResponse(
            correct=correct,
            blocks_awarded=blocks,
            explanation=explanation,
            explanation_style=pending.question_format,
            quest_complete=quest_complete,
            boss_defeated=boss_defeated,
            consecutive_errors=state.consecutive_errors,
            tokens_used_this_call=tokens_this_call,
            tokens_used_session=state.tokens_this_session,
        )

    def _write_answer_memory(
        self,
        *,
        state: LearnerState,
        pending: PendingQuestion,
        req: SubmitAnswerRequest,
        correct: bool,
        had_errors: bool,
        misconception: str | None,
    ) -> None:
        """Store the observations Session 2 will retrieve.

        Only two moments are worth remembering: the misconception, and what
        fixed it. Logging every correct answer would bury both.
        """
        quest_label = {1: "Quest 1 (Bridge)", 2: "Quest 2 (Shelter)", 3: "Quest 3 (Boss)"}
        context = (
            f"{quest_label.get(req.quest_id, 'Quest')}, "
            f"{pending.question_format} format"
        )

        if not correct:
            label = misconceptions.LABELS.get(misconception or "unknown", "error")
            self._safe_store(
                Observation(
                    learner_id=state.learner_id,
                    kind="error",
                    topic="multiplication",
                    event=(
                        f"{state.learner_id} answered {pending.a} × {pending.b} "
                        f"as {req.chosen_answer}"
                    ),
                    inference=f"Likely {label}",
                    context=context,
                    hint_level=pending.hint_level,
                    response_ms=req.response_ms,
                    session_id=state.session_id,
                )
            )
        elif had_errors:
            # The valuable one: a correct answer that followed a wrong one names
            # the support that actually worked.
            state.effective_format = pending.question_format
            self._safe_store(
                Observation(
                    learner_id=state.learner_id,
                    kind="correction",
                    topic="multiplication",
                    event=(
                        f"{state.learner_id} answered {pending.a} × {pending.b} "
                        f"correctly as {pending.correct_answer} after support"
                    ),
                    inference="Recovered after a format change",
                    effective_support=pending.question_format,
                    context=context,
                    hint_level=pending.hint_level,
                    response_ms=req.response_ms,
                    session_id=state.session_id,
                )
            )

    def _on_quest_complete(
        self,
        state: LearnerState,
        quest_id: int,
        pending: PendingQuestion,
        boss_defeated: bool,
    ) -> None:
        self._safe_log(
            self.analytics.log_quest_event,
            QuestEventRow(
                learner_id=state.learner_id,
                session_id=state.session_id,
                quest_id=quest_id,
                event_type="boss_defeated" if boss_defeated else "quest_complete",
                event_data={
                    "blocks_earned": state.blocks_earned,
                    "mastery": state.mastery.snapshot(),
                    "mastery_overall": round(state.mastery.overall(), 3),
                },
            ),
        )

        self._safe_store(
            Observation(
                learner_id=state.learner_id,
                kind="quest_summary",
                topic="multiplication",
                event=(
                    f"{state.learner_id} completed quest {quest_id} in "
                    f"{state.quest(quest_id).asked} questions"
                ),
                # Deliberately NOT the last question's format. The final question
                # is usually whatever the learner had already mastered, so
                # recording it here would bury the correction that identified
                # what actually helped — and the next session would recall
                # "plain equations" from a learner who needed visual groups.
                effective_support=state.effective_format,
                context=f"Session {state.session_number}",
                mastery_snapshot=state.mastery.snapshot(),
                session_id=state.session_id,
            )
        )

    # --- GET /session-summary --------------------------------------------

    def session_summary(self, learner_id: str) -> SessionSummaryResponse:
        state = self.sessions.peek(learner_id)
        mastery = state.mastery if state else MasteryTracker()

        try:
            token_totals = self.analytics.session_token_totals(learner_id)
            question_counts = self.analytics.session_question_counts(learner_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("analytics read failed: %s", exc)
            token_totals, question_counts = {}, {}

        sessions = list(token_totals) or list(question_counts)
        first = sessions[0] if sessions else None
        latest = sessions[-1] if len(sessions) > 1 else None

        tokens_s1 = token_totals.get(first, 0) if first else 0
        tokens_s2 = token_totals.get(latest, 0) if latest else 0
        questions_s1 = question_counts.get(first, 0) if first else 0
        questions_s2 = question_counts.get(latest, 0) if latest else 0

        reduction = 0
        if tokens_s1 and tokens_s2:
            reduction = round((1 - tokens_s2 / tokens_s1) * 100)

        context = LearnerContext()
        try:
            context = self.memory.retrieve_learner_context(learner_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("memory retrieval failed in summary: %s", exc)

        mastered = mastery.mastered_facts()
        cta = (
            f"{learner_id.title()} mastered {len(mastered)} new multiplication "
            f"facts. Continue tomorrow — ${PRICE_PER_MONTH}/month."
        )

        return SessionSummaryResponse(
            learner_id=learner_id,
            session_number=state.session_number if state else 1,
            mastery_before=round(state.mastery_at_session_start if state else 0.0, 2),
            mastery_after=round(mastery.overall(), 2),
            questions_session1=questions_s1,
            questions_session2=questions_s2,
            tokens_session1=tokens_s1,
            tokens_session2=tokens_s2,
            token_reduction_pct=reduction,
            strategy_retrieved=context.strategy_label,
            memory_source=context.source if context.found else self.memory.backend_name,
            facts_mastered=mastered,
            facts_weak=mastery.weak_facts(),
            pricing_cta=cta,
        )


def fact_count() -> int:
    return len(load_bank())
