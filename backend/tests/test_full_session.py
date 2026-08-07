"""End-to-end game loop tests.

These assert the *behaviour the demo depends on*, not just that endpoints
return 200. If one of these fails, the pitch is broken even if the app runs.
"""

from __future__ import annotations

import pytest

from app.memory.local import LocalMarkdownMemory
from app.models import NextChallengeRequest, SubmitAnswerRequest
from app.service import BlockQuestService, QuestionNotFoundError
from app.session import SessionStore
from app.telemetry.jsonl import JsonlAnalyticsSink

LEARNER = "alex"


@pytest.fixture
def service(tmp_path):
    return BlockQuestService(
        memory=LocalMarkdownMemory(tmp_path / "memory"),
        analytics=JsonlAnalyticsSink(tmp_path / "telemetry"),
        sessions=SessionStore(),
    )


def ask(service, quest_id=1):
    return service.next_challenge(
        NextChallengeRequest(learner_id=LEARNER, quest_id=quest_id)
    )


def answer(service, challenge, chosen, quest_id=1, response_ms=4200):
    return service.submit_answer(
        SubmitAnswerRequest(
            learner_id=LEARNER,
            quest_id=quest_id,
            question_id=challenge.question_id,
            chosen_answer=chosen,
            response_ms=response_ms,
        )
    )


# --- the diagnostic opening ----------------------------------------------


def test_quest_one_opens_on_3x4(service):
    """The demo script depends on this exact first question."""
    challenge = ask(service)
    assert (challenge.a, challenge.b) == (3, 4)
    assert challenge.correct_answer == 12
    assert 7 in challenge.options, "additive distractor must be offered"
    assert challenge.hint_level == 0
    assert challenge.num_options == 4
    assert challenge.memory_note is None, "no memory should exist on a cold start"


def test_correct_answer_awards_blocks_and_no_explanation(service):
    challenge = ask(service)
    result = answer(service, challenge, 12)

    assert result.correct is True
    assert result.blocks_awarded == 4
    assert result.explanation is None
    assert result.consecutive_errors == 0


# --- the misconception path ----------------------------------------------


def test_additive_error_is_diagnosed_and_explained(service):
    challenge = ask(service)
    result = answer(service, challenge, 7)  # 3 + 4

    assert result.correct is False
    assert result.blocks_awarded == 0, "the game never punishes"
    assert result.consecutive_errors == 1
    assert result.explanation is not None
    assert "7" in result.explanation and "12" in result.explanation


def test_one_error_triggers_a_hint(service):
    answer(service, ask(service), 7)
    followup = ask(service)

    assert followup.hint_level == 1
    assert followup.hint_text is not None
    assert followup.num_options == 4, "one error should not reduce choices yet"


def test_additive_error_switches_to_visual_groups(service):
    """The core adaptation claim: a misconception changes how we teach."""
    first = ask(service)
    assert first.format == "numeric"

    answer(service, first, 7)
    followup = ask(service)

    assert followup.format == "groups"


def test_two_errors_simplify_the_interface(service):
    """Task A2.5 — the attention-friendly moment."""
    answer(service, ask(service), 7)
    second = ask(service)
    answer(service, second, second.options[0] if second.options[0] != second.correct_answer else second.options[1])

    third = ask(service)
    assert third.num_options == 2
    assert third.hint_level == 2
    assert third.worked_example is not None
    assert len(third.worked_example) >= 3
    assert third.correct_answer in third.options
    assert len(third.options) == 2


# --- memory ---------------------------------------------------------------


def test_correction_writes_a_reusable_memory(service, tmp_path):
    challenge = ask(service)
    answer(service, challenge, 7)

    recovery = ask(service)
    answer(service, recovery, recovery.correct_answer)

    # Retrieval without a session filter sees what was just written.
    context = service.memory.retrieve_learner_context(LEARNER)
    assert context.found is True
    assert context.remembered_format == "groups"
    assert "groups" in context.strategy_label


def test_memory_stays_hidden_inside_the_same_session(service):
    """Otherwise the gold bubble pops mid-Session-1 and spoils the reveal."""
    challenge = ask(service)
    answer(service, challenge, 7)
    recovery = ask(service)
    answer(service, recovery, recovery.correct_answer)

    third = ask(service)
    assert third.memory_note is None


def test_session_two_retrieves_the_strategy(service):
    """The 'aha' moment: refresh the browser, memory survives."""
    challenge = ask(service)
    answer(service, challenge, 7)
    recovery = ask(service)
    answer(service, recovery, recovery.correct_answer)

    service.sessions.start_new_session(LEARNER)

    fresh = ask(service)
    assert fresh.memory_note is not None
    assert "groups" in fresh.memory_note
    assert fresh.format == "groups"


def test_completing_a_quest_does_not_bury_the_correction(service):
    """Regression: the quest summary used to overwrite what actually worked.

    The learner is fixed by visual groups early, then coasts through the rest
    in numeric. Session 2 must recall 'groups', not the format of the last
    question they happened to see.
    """
    first = ask(service)
    answer(service, first, 7)  # additive error -> next question switches to groups
    recovery = ask(service)
    assert recovery.format == "groups"
    answer(service, recovery, recovery.correct_answer)

    # Coast to quest completion in numeric.
    for _ in range(2):
        challenge = ask(service)
        answer(service, challenge, challenge.correct_answer)

    service.sessions.start_new_session(LEARNER)
    fresh = ask(service)
    assert fresh.format == "groups"
    assert "groups" in (fresh.memory_note or "")


def test_memory_note_fires_once_per_session(service):
    """It is a reveal, not a status bar."""
    challenge = ask(service)
    answer(service, challenge, 7)
    recovery = ask(service)
    answer(service, recovery, recovery.correct_answer)

    service.sessions.start_new_session(LEARNER)

    first = ask(service)
    answer(service, first, first.correct_answer)
    second = ask(service)

    assert first.memory_note is not None
    assert second.memory_note is None
    # ...but memory is still steering the decision and the token cost.
    assert second.format == "groups"


def test_session_two_costs_fewer_tokens_per_call(service):
    cold = ask(service)
    answer(service, cold, cold.correct_answer)
    cold_tokens = service.sessions.peek(LEARNER).tokens_this_session

    # Give session 1 a memory worth retrieving.
    second = ask(service)
    answer(service, second, 7)
    third = ask(service)
    answer(service, third, third.correct_answer)

    service.sessions.start_new_session(LEARNER)
    warm = ask(service)
    warm_tokens = service.sessions.peek(LEARNER).tokens_this_session

    assert warm.memory_note is not None
    assert warm_tokens < cold_tokens, "memory-assisted calls must be cheaper"


# --- quest progression ----------------------------------------------------


def test_quest_completes_after_three_correct(service):
    for index in range(3):
        challenge = ask(service)
        result = answer(service, challenge, challenge.correct_answer)
        expected = index == 2
        assert result.quest_complete is expected
    assert result.boss_defeated is False, "quest 1 is not the boss"


def test_boss_defeated_on_quest_three(service):
    # Play quest 1 so the learner has mastery data for boss targeting.
    for _ in range(3):
        challenge = ask(service)
        answer(service, challenge, challenge.correct_answer)

    for index in range(3):
        challenge = ask(service, quest_id=3)
        assert challenge.boss_trigger is True
        result = answer(service, challenge, challenge.correct_answer, quest_id=3)

    assert result.quest_complete is True
    assert result.boss_defeated is True


def test_no_repeated_facts_within_a_quest(service):
    seen = set()
    for _ in range(3):
        challenge = ask(service)
        fact = (challenge.a, challenge.b)
        assert fact not in seen
        seen.add(fact)
        answer(service, challenge, challenge.correct_answer)


# --- summary and error handling ------------------------------------------


def test_session_summary_reports_a_real_reduction(service):
    for _ in range(3):
        challenge = ask(service)
        answer(service, challenge, challenge.correct_answer)

    service.sessions.start_new_session(LEARNER)
    challenge = ask(service)
    answer(service, challenge, challenge.correct_answer)

    summary = service.session_summary(LEARNER)
    assert summary.questions_session1 == 3
    assert summary.questions_session2 == 1
    assert summary.tokens_session1 > 0
    assert summary.tokens_session2 > 0
    assert summary.mastery_after > 0
    assert summary.pricing_cta.endswith("$12/month.")


def test_reveal_card_reports_mastered_facts(service):
    """The card's headline number. Empty here means the demo has no payoff."""
    for _ in range(3):
        challenge = ask(service)
        answer(service, challenge, challenge.correct_answer)

    summary = service.session_summary(LEARNER)
    assert len(summary.facts_mastered) == 3
    assert summary.mastery_after > summary.mastery_before
    assert "mastered 3 new multiplication facts" in summary.pricing_cta


def test_recovering_from_an_error_is_not_yet_mastery(service):
    """A fact fumbled then fixed is progress, not mastery. Don't oversell it."""
    challenge = ask(service)
    answer(service, challenge, 7)
    recovery = ask(service)
    answer(service, recovery, recovery.correct_answer)

    tracker = service.sessions.peek(LEARNER).mastery
    assert tracker.get("3x4") < 0.75


def test_unknown_question_id_is_rejected(service):
    with pytest.raises(QuestionNotFoundError):
        service.submit_answer(
            SubmitAnswerRequest(
                learner_id=LEARNER,
                quest_id=1,
                question_id="q_does_not_exist",
                chosen_answer=12,
                response_ms=1000,
            )
        )


def test_answering_twice_is_rejected(service):
    challenge = ask(service)
    answer(service, challenge, challenge.correct_answer)
    with pytest.raises(QuestionNotFoundError):
        answer(service, challenge, challenge.correct_answer)
