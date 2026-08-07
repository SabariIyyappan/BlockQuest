"""The real EverOS-backed memory store. Linux only — run it in Docker.

Three things about EverOS that the build plan got wrong, all verified by
reading the installed package:

1. The entry points are ``everos.service.memorize`` / ``everos.service.search``,
   not ``everos.add`` / ``everos.search``.
2. They are **async**, and take structured arguments — ``memorize`` wants the
   ``POST /api/v2/memory/add`` payload (``session_id`` + ``messages[]`` with
   millisecond timestamps), ``search`` wants a ``SearchRequest`` model.
3. ``memorize`` runs an LLM extraction pipeline, so writing memory is a metered
   call. It is not free local storage, and this module reports its cost.

The app's own interface (`MemoryStore`) is synchronous, so everything here goes
through a background event loop in a dedicated thread. That works whether the
caller is a sync test or a FastAPI request already running inside a loop.
"""

from __future__ import annotations

import asyncio
import atexit
import json
import logging
import os
import queue
import re
import threading
import time
from concurrent.futures import Future
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from ..models import QuestionFormat
from .base import (
    STRATEGY_LABELS,
    LearnerContext,
    Observation,
    compose_memory_note,
)

logger = logging.getLogger(__name__)

# EverOS validates sender_id / app_id / project_id against a path-safe charset,
# because they become directory names under EVEROS_ROOT.
_PATH_SAFE = re.compile(r"[^A-Za-z0-9_-]+")

# EverOS stores prose, not our dataclass. These markers are written into the
# message body on the way in and parsed back out on the way out — a small,
# explicit contract with ourselves rather than hoping an LLM summary happens to
# preserve the word "groups".
SUPPORT_MARKER = "effective_support"
KIND_MARKER = "observation_kind"
_MARKER_RE = re.compile(rf"{SUPPORT_MARKER}\s*[:=]\s*([a-z_]+)", re.IGNORECASE)
_KIND_RE = re.compile(rf"{KIND_MARKER}\s*[:=]\s*([a-z_]+)", re.IGNORECASE)

# How many past sessions to keep in the index and search back through. A
# learner who has moved on from a misconception should not keep being taught
# around it, and each extra session is another search round trip.
SESSION_INDEX_LIMIT = 10
SESSION_LOOKBACK = 5

RETRIEVAL_QUERY = (
    "multiplication strategy: which explanation format helped this learner "
    "recover from a mistake"
)


def _slug(value: str) -> str:
    return _PATH_SAFE.sub("-", value).strip("-") or "learner"


def ensure_config_files(root: Path | None = None) -> Path:
    """Scaffold everos.toml / ome.toml if they are not there yet.

    The offline memory engine reads `ome.toml` at startup and refuses to run
    without it — `emit: engine not started`, thrown one call into the demo
    rather than at boot. `everos init` is the documented way to produce these,
    so shell out to it rather than copying templates by hand and having to
    re-derive that every time upstream changes.

    Exit code 1 means the files already exist, which is success for us.
    """
    import subprocess  # noqa: PLC0415
    import sys  # noqa: PLC0415

    resolved = Path(root or os.environ.get("EVEROS_ROOT") or Path.home() / ".everos")
    resolved.mkdir(parents=True, exist_ok=True)

    if (resolved / "everos.toml").exists() and (resolved / "ome.toml").exists():
        return resolved

    for command in (
        ["everos", "init", "--root", str(resolved)],
        [sys.executable, "-m", "everos", "init", "--root", str(resolved)],
    ):
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
        if result.returncode in (0, 1):
            logger.info("everos init: %s", result.stdout.strip() or "already present")
            return resolved
        logger.warning("everos init failed: %s", result.stderr.strip()[:300])

    logger.warning("could not scaffold EverOS config in %s", resolved)
    return resolved


async def bootstrap_schema(shim: Any = None, root: Path | None = None) -> Any:
    """Bring EverOS up before first use, the way its own server would.

    EverOS is designed to be run as a service: its FastAPI lifespan starts the
    SQLite schema, the LanceDB tables, and the offline memory engine. Importing
    it as a library skips all of that, and each missing piece fails differently
    and late — `no such table: unprocessed_buffer` from SQLite, then
    `emit: engine not started` from OME, one call into the demo.

    So drive the real providers, in their own declared order, against a shim
    app. Hand-rolling the equivalent would have to be re-derived every time
    EverOS changes; this inherits it.
    """
    from fastapi import FastAPI  # noqa: PLC0415

    from everos.entrypoints.api import lifespans  # noqa: PLC0415

    ensure_config_files(root)

    shim = shim or FastAPI()
    shim.state.lifespan_data = getattr(shim.state, "lifespan_data", {})

    providers = sorted(
        (getattr(lifespans, name)() for name in lifespans.__all__),
        key=lambda p: p.order,
    )

    for provider in providers:
        try:
            shim.state.lifespan_data[provider.name] = await provider.startup(shim)
        except Exception as exc:  # noqa: BLE001
            # Warn rather than raise: LanceDB only backs vector/hybrid search,
            # and a partial bring-up that still writes and keyword-searches is
            # a degraded demo instead of no demo. The failure is visible in the
            # log and the probe asserts the round trip regardless.
            logger.warning("everos %s bootstrap failed: %s", provider.name, exc)

    return shim


async def shutdown_schema(shim: Any) -> None:
    """Reverse of `bootstrap_schema` — closes engines and stops OME."""
    from everos.entrypoints.api import lifespans  # noqa: PLC0415

    providers = sorted(
        (getattr(lifespans, name)() for name in lifespans.__all__),
        key=lambda p: p.order,
        reverse=True,
    )
    for provider in providers:
        try:
            await provider.shutdown(shim)
        except Exception as exc:  # noqa: BLE001
            logger.warning("everos %s shutdown failed: %s", provider.name, exc)


def _epoch_ms(moment: datetime) -> int:
    return int(moment.timestamp() * 1000)


class _LoopThread:
    """One background event loop, shared by every EverOS call.

    ``asyncio.run`` per call would tear down EverOS's lazily-built LanceDB and
    LLM singletons on every write. A single long-lived loop keeps them warm,
    which matters when the demo is being watched.
    """

    def __init__(self) -> None:
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._run, name="everos-loop", daemon=True
        )
        self._thread.start()

    def _run(self) -> None:
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def submit(self, coro) -> Future:
        return asyncio.run_coroutine_threadsafe(coro, self._loop)

    def close(self) -> None:
        if self._loop.is_closed():
            return
        self._loop.call_soon_threadsafe(self._loop.stop)


class EverOSMemory:
    """`MemoryStore` implemented on EverOS.

    Import of this module fails on Windows (`fcntl`), which is why
    `build_memory_store` catches ImportError and falls back to local markdown.
    """

    backend_name = "everos"

    def __init__(
        self,
        memory_dir: Path,
        *,
        app_id: str = "blockquest",
        project_id: str = "tutor",
        search_method: str = "keyword",
        top_k: int = 20,
        flush_on_write: bool = False,
        write_timeout: float = 30.0,
        read_timeout: float = 15.0,
        on_llm_usage: Callable[[Observation, int], None] | None = None,
    ):
        # Imports live here, not at module scope: EVEROS_ROOT has to be set
        # before everos.config resolves it, and `build_memory_store` is what
        # knows the configured directory.
        os.environ.setdefault("EVEROS_ROOT", str(Path(memory_dir).resolve()))
        Path(memory_dir).mkdir(parents=True, exist_ok=True)

        from everos.memory.search import SearchRequest  # noqa: PLC0415
        from everos.memory.search.dto import FilterNode, SearchMethod  # noqa: PLC0415
        from everos.service import memorize, search  # noqa: PLC0415

        self._SearchRequest = SearchRequest
        self._SearchMethod = SearchMethod
        self._FilterNode = FilterNode
        self._memorize = memorize
        self._search = search

        self.root = Path(memory_dir)
        self.app_id = _slug(app_id)
        self.project_id = _slug(project_id)
        self.search_method = search_method.lower()
        self.top_k = top_k
        self.flush_on_write = flush_on_write
        self.write_timeout = write_timeout
        self.read_timeout = read_timeout
        self.on_llm_usage = on_llm_usage
        self._index_lock = threading.Lock()
        self._closed = False
        self._context_cache: dict[tuple[str, str, str | None], LearnerContext] = {}
        self._loop = _LoopThread()
        self._bootstrap()

        self._writes: queue.Queue[Observation | None] = queue.Queue()
        self._writer = threading.Thread(
            target=self._drain_writes, name="everos-writer", daemon=True
        )
        self._writer.start()

        atexit.register(self.close)

    def _bootstrap(self) -> None:
        self._shim = self._loop.submit(bootstrap_schema(root=self.root)).result(
            timeout=self.write_timeout
        )

    # --- session index ----------------------------------------------------
    #
    # EverOS returns buffered (not-yet-extracted) messages from /search *only*
    # when the request carries a top-level session_id filter — buffer rows are
    # scope-tagged but unattributed, so there is no user_id to search them by.
    #
    # That is fine for EverOS's own use case and fatal for ours: session 2 wants
    # session 1's memory and has no idea what session 1 was called. So keep a
    # small index of the sessions we have written per learner. It is bookkeeping
    # about our own writes, not a reimplementation of anything EverOS does.

    def _index_path(self, learner_id: str) -> Path:
        path = self.root / ".blockquest" / "sessions"
        path.mkdir(parents=True, exist_ok=True)
        return path / f"{_slug(learner_id)}.json"

    def _known_sessions(self, learner_id: str) -> list[str]:
        path = self._index_path(learner_id)
        if not path.exists():
            return []
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            # A corrupt index costs us memory, not the demo.
            logger.warning("session index unreadable for %s", learner_id)
            return []

    def _remember_session(self, learner_id: str, session_id: str | None) -> None:
        if not session_id:
            return
        with self._index_lock:
            sessions = self._known_sessions(learner_id)
            if session_id in sessions:
                return
            sessions.append(session_id)
            try:
                self._index_path(learner_id).write_text(
                    json.dumps(sessions[-SESSION_INDEX_LIMIT:]), encoding="utf-8"
                )
            except OSError as exc:
                logger.warning("could not write session index: %s", exc)

    # --- writing ----------------------------------------------------------

    def _messages(self, observation: Observation) -> list[dict[str, Any]]:
        """Render an observation as the tutoring exchange it actually was.

        EverOS extracts from conversations, so handing it a conversation gets
        better episodes than handing it a blob. The learner's action is the
        user turn; our inference about it is the assistant turn.
        """
        stamp = _epoch_ms(observation.created_at)
        sender = _slug(observation.learner_id)

        tutor_lines = [
            f"{KIND_MARKER}: {observation.kind}",
            f"topic: {observation.topic}",
        ]
        if observation.inference:
            tutor_lines.append(f"inference: {observation.inference}")
        if observation.effective_support:
            label = STRATEGY_LABELS.get(
                observation.effective_support, observation.effective_support
            )
            tutor_lines.append(f"{SUPPORT_MARKER}: {observation.effective_support}")
            tutor_lines.append(f"What helped {observation.learner_id} was {label}.")
        tutor_lines.append(f"context: {observation.context}")
        if observation.hint_level is not None:
            tutor_lines.append(f"hint level: {observation.hint_level}")
        if observation.mastery_snapshot:
            tutor_lines.append(
                "mastery: "
                + ", ".join(
                    f"{fid}={score:.2f}"
                    for fid, score in sorted(observation.mastery_snapshot.items())
                )
            )

        return [
            {
                "sender_id": sender,
                "sender_name": observation.learner_id,
                "role": "user",
                "timestamp": stamp,
                "content": observation.event,
            },
            {
                "sender_id": "blockquest-tutor",
                "sender_name": "BlockQuest",
                "role": "assistant",
                # +1ms so ordering inside the pair is never ambiguous.
                "timestamp": stamp + 1,
                "content": "\n".join(tutor_lines),
            },
        ]

    def store_observation(self, observation: Observation) -> None:
        """Queue the write and return. Do not block the answer on it.

        A `memorize()` round trip measures ~3s — extraction pipelines, LanceDB,
        an LLM hop. Waiting for that inside `/submit-answer` puts a three-second
        stall between a child clicking an answer and seeing whether they got it
        right, which is worse than having no memory at all.

        Nothing needs the write to have landed by the time we respond. The
        memory is read at the *start of the next session*, which is a browser
        refresh away at the earliest. Same fire-and-forget contract the
        analytics sink already has.
        """
        self._remember_session(observation.learner_id, observation.session_id)
        self._writes.put(observation)

    def _drain_writes(self) -> None:
        while True:
            observation = self._writes.get()
            if observation is None:
                self._writes.task_done()
                return
            try:
                self._write_now(observation)
            except Exception as exc:  # noqa: BLE001
                # Losing one observation costs the demo a little memory. Letting
                # it kill the writer thread costs all of it.
                logger.warning("everos write failed: %s", exc)
            finally:
                self._writes.task_done()

    def flush(self, timeout: float = 30.0) -> None:
        """Block until queued writes have landed. Tests, seeding, and probes."""
        done = threading.Event()
        threading.Thread(
            target=lambda: (self._writes.join(), done.set()), daemon=True
        ).start()
        done.wait(timeout)

    def _write_now(self, observation: Observation) -> None:
        messages = self._messages(observation)
        payload = {
            "session_id": observation.session_id or f"{_slug(observation.learner_id)}-adhoc",
            "app_id": self.app_id,
            "project_id": self.project_id,
            "messages": messages,
        }

        started = time.perf_counter()
        # `is_final` forces the extraction pipeline to run right now, bypassing
        # EverOS's boundary detector. That sounds like what a demo wants —
        # don't leave the memory unwritten — but it isn't:
        #
        #   - search() returns `unprocessed_messages` alongside extracted
        #     episodes, so a buffered write is already retrievable. There is no
        #     window where the memory is missing.
        #   - forcing it makes every write depend on the extraction pipeline
        #     succeeding, which needs a live model and its exact JSON contract.
        #
        # So the default is to let EverOS decide. Flip `flush_on_write` on
        # hackathon day with a real key to get semantic episodes instead of raw
        # buffered messages; the retrieval path handles both.
        future = self._loop.submit(
            self._memorize(payload, is_final=self.flush_on_write)
        )
        result = future.result(timeout=self.write_timeout)
        elapsed = (time.perf_counter() - started) * 1000

        logger.info(
            "everos memorize: status=%s messages=%s in %.0fms",
            getattr(result, "status", "?"),
            getattr(result, "message_count", "?"),
            elapsed,
        )

        # Only an "extracted" status means the LLM actually ran. "accumulated"
        # buffered the messages without a model call, and billing a token cost
        # for it would overstate the write side of our own comparison.
        if getattr(result, "status", None) == "extracted":
            self._report_extraction_cost(observation, messages)

    def _report_extraction_cost(
        self, observation: Observation, messages: list[dict[str, Any]]
    ) -> None:
        """Report what writing this memory cost.

        This counts *our payload*, which is a lower bound: EverOS wraps it in
        its own extraction prompts that we cannot see from out here. Stated as
        a floor rather than guessed at, because "doesn't storing the memory
        cost tokens too?" deserves a real number and not a shrug.
        """
        if self.on_llm_usage is None:
            return
        from .. import token_meter  # noqa: PLC0415

        prompt_tokens = sum(
            token_meter.count_tokens(str(m["content"])) for m in messages
        )
        try:
            self.on_llm_usage(observation, prompt_tokens)
        except Exception as exc:  # noqa: BLE001
            logger.warning("token usage callback failed: %s", exc)

    # --- reading ----------------------------------------------------------

    def _method(self):
        try:
            return self._SearchMethod(self.search_method)
        except ValueError:
            logger.warning(
                "unknown search method %r; using keyword", self.search_method
            )
            return self._SearchMethod.KEYWORD

    def retrieve_learner_context(
        self,
        learner_id: str,
        topic: str = "multiplication",
        exclude_session_id: str | None = None,
    ) -> LearnerContext:
        # Retrieval costs ~1.2s and runs on every /next-challenge, so it gets
        # cached. This is not just a speed hack: the result deliberately
        # excludes the current session, so nothing written during this session
        # can change it. Within a session the answer is a constant, and asking
        # EverOS the same question every question is pure latency.
        cache_key = (learner_id, topic, exclude_session_id)
        cached = self._context_cache.get(cache_key)
        if cached is not None:
            return cached

        context = self._retrieve_uncached(learner_id, topic, exclude_session_id)
        self._context_cache[cache_key] = context
        return context

    def prefetch_learner_context(
        self,
        learner_id: str,
        topic: str = "multiplication",
        exclude_session_id: str | None = None,
    ) -> None:
        """Warm the cache off the request path.

        The first retrieval of a session costs ~2.6s, and after caching that is
        the *only* slow call left — which puts it on the first question of
        session 2, the exact moment the memory reveal is supposed to land.

        Starting a new session is the natural trigger: in the demo that is the
        browser refresh, and there are several seconds of human time between it
        and the first click. Fire it there and the reveal is instant.
        """
        threading.Thread(
            target=lambda: self.retrieve_learner_context(
                learner_id, topic, exclude_session_id
            ),
            name="everos-prefetch",
            daemon=True,
        ).start()

    def _retrieve_uncached(
        self,
        learner_id: str,
        topic: str,
        exclude_session_id: str | None,
    ) -> LearnerContext:
        query = f"{topic}. {RETRIEVAL_QUERY}"

        def request(session_id: str | None = None):
            return self._SearchRequest(
                user_id=_slug(learner_id),
                app_id=self.app_id,
                project_id=self.project_id,
                query=query,
                method=self._method(),
                top_k=self.top_k,
                filters=(
                    self._FilterNode(session_id=session_id) if session_id else None
                ),
            )

        # Two passes, because EverOS keeps extracted and buffered memory behind
        # different query dimensions. The unfiltered pass finds episodes (owned
        # by user_id); the per-session passes find anything not yet extracted.
        # Skipping either loses memory depending on whether a key is configured,
        # which is exactly the kind of thing that only shows up on stage.
        requests = [request()]
        past = [
            sid
            for sid in self._known_sessions(learner_id)
            if sid != exclude_session_id
        ][-SESSION_LOOKBACK:]
        requests.extend(request(sid) for sid in reversed(past))

        records: list[dict] = []
        for req in requests:
            try:
                response = self._loop.submit(self._search(req)).result(
                    timeout=self.read_timeout
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("everos search failed: %s", exc)
                continue
            records.extend(self._flatten(response, exclude_session_id))

        if not records:
            return LearnerContext()

        # Same precedence as the local store: a correction is direct evidence
        # that a format unstuck this learner, a summary is a roll-up. Recency
        # alone lets the weaker record win.
        records.sort(key=lambda r: (0 if r["kind"] == "correction" else 1, -r["ts"]))

        remembered: QuestionFormat | None = None
        for record in records:
            remembered = _format_in(record["text"])
            if remembered:
                break

        notes = [r["text"].splitlines()[0][:160] for r in records[:3]]

        if remembered is None:
            return LearnerContext(found=True, source=self.backend_name, notes=notes)

        label = STRATEGY_LABELS[remembered]
        return LearnerContext(
            found=True,
            remembered_format=remembered,
            memory_note=compose_memory_note(label),
            strategy_label=label,
            source=self.backend_name,
            notes=notes,
        )

    def _flatten(self, response: Any, exclude_session_id: str | None) -> list[dict]:
        """Normalise EverOS's four result buckets into one ranked list.

        ``unprocessed_messages`` matters more than it looks: it is the raw
        buffer EverOS has not extracted yet, and it is the reason retrieval
        still works with no LLM key configured. Without it, an unkeyed EverOS
        would search an empty index and the demo would silently lose memory.
        """
        data = getattr(response, "data", None)
        if data is None:
            return []

        records: list[dict] = []

        def add(text: str, session_id: str | None, ts: float, kind: str) -> None:
            if not text:
                return
            if exclude_session_id and session_id == exclude_session_id:
                return
            records.append(
                {"text": text, "kind": kind, "ts": ts, "session_id": session_id}
            )

        for episode in getattr(data, "episodes", []):
            body = "\n".join(
                part
                for part in (
                    getattr(episode, "episode", ""),
                    getattr(episode, "summary", ""),
                    getattr(episode, "subject", ""),
                )
                if part
            )
            facts = getattr(episode, "atomic_facts", []) or []
            body += "\n" + "\n".join(str(getattr(f, "content", f)) for f in facts)
            kind_match = _KIND_RE.search(body)
            add(
                body,
                getattr(episode, "session_id", None),
                _ts(getattr(episode, "timestamp", None)),
                kind_match.group(1) if kind_match else "episode",
            )

        for message in getattr(data, "unprocessed_messages", []):
            content = getattr(message, "content", "")
            text = content if isinstance(content, str) else str(content)
            kind_match = _KIND_RE.search(text)
            add(
                text,
                getattr(message, "session_id", None),
                _ts(getattr(message, "timestamp", None)),
                kind_match.group(1) if kind_match else "message",
            )

        for profile in getattr(data, "profiles", []):
            add(str(getattr(profile, "profile_data", "")), None, 0.0, "profile")

        return records

    # --- housekeeping -----------------------------------------------------

    def describe(self, learner_id: str) -> str:
        return str(self.root.resolve())

    def close(self) -> None:
        """Stop EverOS, then the loop it runs on — in that order.

        Registered with atexit rather than left to the caller: EverOS's offline
        engine owns background tasks, and tearing the loop down first strands
        them into `Event loop closed` warnings at interpreter exit. Harmless,
        but not something to have scrolling past during a demo.
        """
        if self._closed:
            return
        self._closed = True
        self.flush(timeout=15)
        self._writes.put(None)
        try:
            self._loop.submit(shutdown_schema(self._shim)).result(timeout=10)
        except Exception as exc:  # noqa: BLE001
            logger.warning("everos shutdown failed: %s", exc)
        self._loop.close()


def _format_in(text: str) -> QuestionFormat | None:
    """Recover which teaching format helped, from whatever EverOS gives back.

    Two passes, because the text arrives in two very different states. Before
    extraction it is our own message verbatim, so the `effective_support:`
    marker is intact. After extraction it is an LLM's summary of that message,
    and there is no guarantee a machine-readable marker survives being
    paraphrased — but the human phrase very likely does, because it is the
    sentence the summary is about. Matching the label as well as the marker is
    what keeps retrieval working once a real key is in play.
    """
    match = _MARKER_RE.search(text)
    if match and match.group(1) in STRATEGY_LABELS:
        return match.group(1)  # type: ignore[return-value]

    lowered = text.lower()
    for fmt, label in STRATEGY_LABELS.items():
        if label in lowered:
            return fmt  # type: ignore[return-value]
    return None


def _ts(value: Any) -> float:
    if isinstance(value, datetime):
        return value.replace(tzinfo=value.tzinfo or timezone.utc).timestamp()
    if isinstance(value, (int, float)):
        return float(value)
    return 0.0
