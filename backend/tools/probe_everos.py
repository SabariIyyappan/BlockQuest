"""Prove EverOS actually round-trips inside this container.

    docker compose run --rm probe

Answers four questions, in order, and stops at the first one that fails:

  1. Does everos import here? (it cannot on Windows — that is the whole point)
  2. What did it resolve for root / LLM config?
  3. Does the raw memorize -> search cycle work?
  4. Does our `EverOSMemory` adapter recover "groups" from a stored correction?

Step 4 is the one that matters. Steps 1-3 are diagnostics for when it fails.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Keep the raw SDK check and adapter behavior check in separate learner scopes.
# Otherwise step 3's deliberately stored "groups helped" memory is valid prior
# memory when step 4 checks that its *current* session is excluded, producing a
# false failure (especially because the compose volume persists across runs).
RAW_LEARNER = "probe-raw-sdk"
LEARNER = "probe-alex-adapter"
OK, BAD, WARN = "  ok  ", " FAIL ", " warn "


def line(tag: str, message: str) -> None:
    print(f"[{tag}] {message}", flush=True)


def step_1_import() -> None:
    print("\n=== 1. import ===")
    try:
        import everos  # noqa: F401
        from everos.service import memorize, search  # noqa: F401
    except ModuleNotFoundError as exc:
        line(BAD, f"cannot import everos: {exc}")
        if exc.name == "fcntl":
            line(BAD, "this is the Windows failure — you are not in the container")
        sys.exit(1)
    line(OK, f"everos {getattr(everos, '__version__', 'unknown')} imported")


def step_2_config() -> bool:
    """Returns True if a *real* provider is configured (not the stub)."""
    print("\n=== 2. config ===")
    root = os.environ.get("EVEROS_ROOT", "~/.everos (default)")
    line(OK, f"EVEROS_ROOT = {root}")

    # Note the nesting: EVEROS_LLM__API_KEY, not EVEROS_API_KEY.
    key = os.environ.get("EVEROS_LLM__API_KEY") or ""
    base = os.environ.get("EVEROS_LLM__BASE_URL") or "(unset)"
    model = os.environ.get("EVEROS_LLM__MODEL") or "(default)"

    if not key or base == "(unset)":
        line(BAD, "EVEROS_LLM__API_KEY and EVEROS_LLM__BASE_URL are both required.")
        line(BAD, "memorize() calls get_llm_client() unconditionally — there is no")
        line(BAD, "keyless path. Use the llm-stub service or set a real provider.")
        sys.exit(1)

    stubbed = "llm-stub" in base
    line(OK, f"LLM base_url = {base}, model = {model}")
    if stubbed:
        line(
            WARN,
            "pointing at the local stub — extraction runs but returns nothing, "
            "so retrieval falls back to EverOS's unprocessed buffer.",
        )
        line(WARN, "that is the degraded path, and it is the one being proven here.")
    return not stubbed


def step_3_raw_roundtrip(real_provider: bool) -> None:
    print("\n=== 3. raw memorize -> search ===")
    from everos.memory.search import SearchRequest
    from everos.memory.search.dto import FilterNode, SearchMethod
    from everos.service import memorize, search

    stamp = int(time.time() * 1000)
    session_id = f"probe-{stamp}"
    payload = {
        "session_id": session_id,
        "app_id": "blockquest",
        "project_id": "tutor",
        "messages": [
            {
                "sender_id": RAW_LEARNER,
                "sender_name": RAW_LEARNER,
                "role": "user",
                "timestamp": stamp,
                "content": "probe-alex answered 3 x 4 as 7",
            },
            {
                "sender_id": "blockquest-tutor",
                "sender_name": "BlockQuest",
                "role": "assistant",
                "timestamp": stamp + 1,
                "content": "effective_support: groups\nVisual block groups helped.",
            },
        ],
    }

    from app.memory.everos_store import bootstrap_schema

    async def run():
        # Nobody has run EverOS's lifespan here, so the tables do not exist yet.
        await bootstrap_schema()

        started = time.perf_counter()
        result = await memorize(payload, is_final=False)
        write_ms = (time.perf_counter() - started) * 1000

        started = time.perf_counter()
        # The session_id filter is not optional. EverOS only returns buffered
        # (not-yet-extracted) messages when the request carries one as a
        # top-level eq predicate — buffer rows are scope-tagged but have no
        # user_id to search them by. Without it this comes back empty even
        # though the write above plainly succeeded.
        response = await search(
            SearchRequest(
                user_id=RAW_LEARNER,
                app_id="blockquest",
                project_id="tutor",
                query="multiplication strategy that helped",
                method=SearchMethod.KEYWORD,
                top_k=20,
                filters=FilterNode(session_id=session_id),
            )
        )
        read_ms = (time.perf_counter() - started) * 1000
        return result, response, write_ms, read_ms

    try:
        result, response, write_ms, read_ms = asyncio.run(run())
    except Exception as exc:  # noqa: BLE001
        line(BAD, f"{type(exc).__name__}: {exc}")
        sys.exit(1)

    line(OK, f"memorize -> status={result.status} count={result.message_count} ({write_ms:.0f}ms)")
    if result.status == "accumulated" and real_provider:
        line(WARN, "a real provider is set but nothing was extracted — check model")

    data = response.data
    line(
        OK,
        f"search ({read_ms:.0f}ms) -> episodes={len(data.episodes)} "
        f"profiles={len(data.profiles)} buffered={len(data.unprocessed_messages)}",
    )
    if not (data.episodes or data.unprocessed_messages):
        line(BAD, "nothing came back — memory would be silently empty in the demo")
        sys.exit(1)


def step_4_adapter() -> None:
    print("\n=== 4. EverOSMemory adapter ===")
    from app.memory.base import Observation
    from app.memory.everos_store import EverOSMemory

    root = Path(os.environ.get("EVEROS_ROOT", tempfile.mkdtemp()))
    store = EverOSMemory(root, search_method="keyword")

    session_one = f"probe-s1-{int(time.time())}"
    store.store_observation(
        Observation(
            learner_id=LEARNER,
            kind="correction",
            topic="multiplication",
            event=f"{LEARNER} answered 3 × 4 correctly as 12 after support",
            inference="Recovered after a format change",
            effective_support="groups",
            context="Quest 1 (Bridge), groups format",
            hint_level=1,
            response_ms=5200,
            session_id=session_one,
        )
    )
    store.flush()
    line(OK, "stored a correction observation")

    # Same session must NOT see it — otherwise the gold bubble pops mid-demo.
    same = store.retrieve_learner_context(LEARNER, exclude_session_id=session_one)
    if same.remembered_format == "groups":
        line(BAD, "current-session memory leaked; the Session 2 reveal is spoiled")
        sys.exit(1)
    line(OK, "current session correctly filtered out")

    later = store.retrieve_learner_context(LEARNER, exclude_session_id="probe-s2")
    if later.remembered_format != "groups":
        line(BAD, f"expected 'groups', got {later.remembered_format!r}")
        line(BAD, f"found={later.found} source={later.source} notes={later.notes[:2]}")
        sys.exit(1)

    line(OK, f"recovered format = {later.remembered_format}")
    line(OK, f"memory_note = {later.memory_note!r}")
    store.close()


if __name__ == "__main__":
    print(f"BlockQuest EverOS probe — {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    step_1_import()
    real_provider = step_2_config()
    step_3_raw_roundtrip(real_provider)
    step_4_adapter()
    print("\nAll four steps passed. BQ_MEMORY_BACKEND=everos is safe to run.\n")
