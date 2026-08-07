"""Local append-only analytics sink.

Stands in for Snowflake through Phase 3 and doubles as the offline fallback
for the demo. Rows are held in memory for instant aggregation and flushed to
disk by a background thread, so `/submit-answer` never waits on I/O.

Existing files are loaded at startup, which is what lets `seed_alex.py` run as
a separate process and still show up in the session summary.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
from collections import OrderedDict
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .base import AttemptRow, QuestEventRow, TokenUsageRow

logger = logging.getLogger(__name__)

FILES = {
    "attempts": "attempts.jsonl",
    "quest_events": "quest_events.jsonl",
    "token_usage": "token_usage.jsonl",
}


class JsonlAnalyticsSink:
    sink_name = "jsonl"

    def __init__(self, telemetry_dir: Path):
        self.root = Path(telemetry_dir)
        self.root.mkdir(parents=True, exist_ok=True)

        self._lock = threading.Lock()
        self._rows: dict[str, list[dict[str, Any]]] = {k: [] for k in FILES}
        self._queue: queue.Queue[tuple[str, dict] | None] = queue.Queue()

        self._load_existing()

        self._worker = threading.Thread(
            target=self._drain, name="telemetry-writer", daemon=True
        )
        self._worker.start()

    # --- write path -------------------------------------------------------

    def _load_existing(self) -> None:
        for table, filename in FILES.items():
            path = self.root / filename
            if not path.exists():
                continue
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    self._rows[table].append(json.loads(line))
                except json.JSONDecodeError:
                    logger.warning("skipping malformed telemetry line in %s", path)

    def _drain(self) -> None:
        while True:
            item = self._queue.get()
            if item is None:
                self._queue.task_done()
                return
            table, payload = item
            try:
                with (self.root / FILES[table]).open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(payload) + "\n")
            except OSError as exc:
                # Losing a telemetry line is acceptable; losing the demo is not.
                logger.warning("telemetry write failed for %s: %s", table, exc)
            finally:
                self._queue.task_done()

    def _record(self, table: str, row: Any) -> None:
        payload = asdict(row)
        with self._lock:
            self._rows[table].append(payload)
        self._queue.put((table, payload))

    def log_attempt(self, row: AttemptRow) -> None:
        self._record("attempts", row)

    def log_quest_event(self, row: QuestEventRow) -> None:
        self._record("quest_events", row)

    def log_token_usage(self, row: TokenUsageRow) -> None:
        self._record("token_usage", row)

    def flush(self, timeout: float = 2.0) -> None:
        """Block until queued writes hit disk. Tests and seeding only."""
        done = threading.Event()

        def _mark() -> None:
            self._queue.join()
            done.set()

        threading.Thread(target=_mark, daemon=True).start()
        done.wait(timeout)

    # --- read path --------------------------------------------------------

    def _for_learner(self, table: str, learner_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return [r for r in self._rows[table] if r.get("learner_id") == learner_id]

    def session_token_totals(self, learner_id: str) -> dict[str, int]:
        """{session_id: total_tokens}, in the order sessions first appeared."""
        totals: OrderedDict[str, int] = OrderedDict()
        for row in self._for_learner("token_usage", learner_id):
            sid = row["session_id"]
            totals[sid] = totals.get(sid, 0) + int(row["total_tokens"])
        return dict(totals)

    def session_question_counts(self, learner_id: str) -> dict[str, int]:
        counts: OrderedDict[str, int] = OrderedDict()
        for row in self._for_learner("attempts", learner_id):
            sid = row["session_id"]
            counts[sid] = counts.get(sid, 0) + 1
        return dict(counts)

    def memory_split(self, learner_id: str) -> dict[bool, dict[str, int]]:
        """Token cost with memory vs without — the reveal card's core claim."""
        split: dict[bool, dict[str, int]] = {
            False: {"calls": 0, "total_tokens": 0},
            True: {"calls": 0, "total_tokens": 0},
        }
        for row in self._for_learner("token_usage", learner_id):
            bucket = split[bool(row["memory_was_used"])]
            bucket["calls"] += 1
            bucket["total_tokens"] += int(row["total_tokens"])
        return split

    def purge(self, learner_id: str) -> None:
        """Drop a learner's rows from memory and rewrite the files. Seeding only."""
        with self._lock:
            for table in FILES:
                self._rows[table] = [
                    r for r in self._rows[table] if r.get("learner_id") != learner_id
                ]
                path = self.root / FILES[table]
                path.write_text(
                    "".join(json.dumps(r) + "\n" for r in self._rows[table]),
                    encoding="utf-8",
                )
