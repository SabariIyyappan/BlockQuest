"""EverOS-backed memory tests.

These skip everywhere except a Linux box with everos importable — which in
practice means inside the container:

    docker compose run --rm tests

They assert the same two behaviours the local store is held to, because those
are what the demo depends on regardless of which backend is underneath.
"""

from __future__ import annotations

import time

import pytest

# Not `importorskip("everos")` — the top-level package imports fine on Windows.
# It is `everos.service` that reaches `core.persistence.locking` and its
# module-scope `import fcntl`, so that is what has to be probed.
pytest.importorskip(
    "everos.service", reason="EverOS is POSIX-only; run this suite in Docker"
)

from app.memory.base import Observation  # noqa: E402
from app.memory.everos_store import EverOSMemory  # noqa: E402

LEARNER = "pytest-alex"


@pytest.fixture
def store(tmp_path):
    memory = EverOSMemory(tmp_path / "everos", search_method="keyword")
    yield memory
    memory.close()


def correction(session_id: str) -> Observation:
    return Observation(
        learner_id=LEARNER,
        kind="correction",
        topic="multiplication",
        event=f"{LEARNER} answered 3 × 4 correctly as 12 after support",
        inference="Recovered after a format change",
        effective_support="groups",
        context="Quest 1 (Bridge), groups format",
        hint_level=1,
        response_ms=5200,
        session_id=session_id,
    )


def test_correction_round_trips_through_everos(store):
    store.store_observation(correction("s1"))
    store.flush()

    context = store.retrieve_learner_context(LEARNER, exclude_session_id="s2")
    assert context.found is True
    assert context.remembered_format == "groups"
    assert "groups" in context.memory_note
    assert context.source == "everos"


def test_current_session_is_filtered_out(store):
    """Otherwise the gold bubble pops mid-Session-1 and spoils the reveal."""
    store.store_observation(correction("s1"))
    store.flush()

    same_session = store.retrieve_learner_context(LEARNER, exclude_session_id="s1")
    assert same_session.remembered_format is None


def test_writes_do_not_block_the_answer(store):
    """A memorize() round trip is ~3s. It must not sit inside /submit-answer.

    Without this, a child clicks an answer and waits three seconds to find out
    whether they were right. That is worse than having no memory at all, and it
    is invisible in every test that only checks correctness.
    """
    started = time.perf_counter()
    store.store_observation(correction("s1"))
    elapsed = time.perf_counter() - started

    assert elapsed < 0.1, f"store_observation blocked for {elapsed:.2f}s"


def test_repeat_retrieval_is_cached(store):
    """Retrieval is ~1.2s and runs on every question. Once per session is enough.

    Safe because the result excludes the current session by construction, so
    nothing written during this session can change it.
    """
    store.store_observation(correction("s1"))
    store.flush()

    store.retrieve_learner_context(LEARNER, exclude_session_id="s2")

    started = time.perf_counter()
    again = store.retrieve_learner_context(LEARNER, exclude_session_id="s2")
    elapsed = time.perf_counter() - started

    assert again.remembered_format == "groups"
    assert elapsed < 0.05, f"second retrieval took {elapsed:.2f}s — not cached"


def test_cold_learner_has_no_memory(store):
    context = store.retrieve_learner_context("nobody-has-played-as-this-name")
    assert context.found is False
    assert context.remembered_format is None


def test_correction_outranks_a_later_quest_summary(store):
    """Recency alone would let the weaker record win.

    The summary is written after the correction and mentions numeric work; the
    correction is what actually identified the support that helped.
    """
    store.store_observation(correction("s1"))
    store.store_observation(
        Observation(
            learner_id=LEARNER,
            kind="quest_summary",
            topic="multiplication",
            event=f"{LEARNER} completed quest 1 in 4 questions",
            effective_support="numeric",
            context="Session 1",
            session_id="s1",
        )
    )

    store.flush()

    context = store.retrieve_learner_context(LEARNER, exclude_session_id="s2")
    assert context.remembered_format == "groups"


def test_write_cost_is_reported_when_extraction_runs(store, tmp_path):
    """The answer to 'doesn't storing memory cost tokens too?' must be a number."""
    seen: list[tuple[str, int]] = []

    memory = EverOSMemory(
        tmp_path / "everos-cost",
        search_method="keyword",
        on_llm_usage=lambda obs, tokens: seen.append((obs.kind, tokens)),
    )
    try:
        memory.store_observation(correction("s1"))
        memory.flush()
    finally:
        memory.close()

    # Without an LLM key EverOS returns "accumulated" and nothing is billed —
    # which is correct, not a failure. With a key it extracts and reports.
    if seen:
        assert seen[0][0] == "correction"
        assert seen[0][1] > 0
