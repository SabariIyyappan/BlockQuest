"""Snowflake analytics sink with durable local fallback.

Every row is recorded to JSONL first, then queued for Snowflake. Warehouse
latency or an outage never blocks an answer response and never loses the local
copy used by the offline demo.
"""

from __future__ import annotations

import json
import logging
import os
import queue
import re
import threading
from collections import OrderedDict
from pathlib import Path
from typing import Any, Callable, Mapping

from .base import AttemptRow, QuestEventRow, TokenUsageRow
from .jsonl import JsonlAnalyticsSink

logger = logging.getLogger(__name__)
_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")

_SCHEMA = {
    "ATTEMPTS": """
        CREATE TABLE IF NOT EXISTS ATTEMPTS (
            attempt_id VARCHAR PRIMARY KEY, learner_id VARCHAR, session_id VARCHAR,
            quest_id INTEGER, question_id VARCHAR, fact_a INTEGER, fact_b INTEGER,
            correct_answer INTEGER, chosen_answer INTEGER, is_correct BOOLEAN,
            response_ms INTEGER, explanation_style VARCHAR, hint_level INTEGER,
            misconception VARCHAR, timestamp TIMESTAMP_TZ
        )
    """,
    "QUEST_EVENTS": """
        CREATE TABLE IF NOT EXISTS QUEST_EVENTS (
            event_id VARCHAR PRIMARY KEY, learner_id VARCHAR, session_id VARCHAR,
            quest_id INTEGER, event_type VARCHAR, event_data VARIANT,
            timestamp TIMESTAMP_TZ
        )
    """,
    "AI_TOKEN_USAGE": """
        CREATE TABLE IF NOT EXISTS AI_TOKEN_USAGE (
            usage_id VARCHAR PRIMARY KEY, learner_id VARCHAR, session_id VARCHAR,
            call_type VARCHAR, model_used VARCHAR, prompt_tokens INTEGER,
            completion_tokens INTEGER, total_tokens INTEGER,
            memory_was_used BOOLEAN, timestamp TIMESTAMP_TZ
        )
    """,
}

_INSERTS = {
    "ATTEMPTS": (
        "INSERT INTO ATTEMPTS (attempt_id, learner_id, session_id, quest_id, "
        "question_id, fact_a, fact_b, correct_answer, chosen_answer, is_correct, "
        "response_ms, explanation_style, hint_level, misconception, timestamp) "
        "SELECT %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s"
    ),
    "QUEST_EVENTS": (
        "INSERT INTO QUEST_EVENTS (event_id, learner_id, session_id, quest_id, "
        "event_type, event_data, timestamp) "
        "SELECT %s, %s, %s, %s, %s, PARSE_JSON(%s), %s"
    ),
    "AI_TOKEN_USAGE": (
        "INSERT INTO AI_TOKEN_USAGE (usage_id, learner_id, session_id, call_type, "
        "model_used, prompt_tokens, completion_tokens, total_tokens, "
        "memory_was_used, timestamp) "
        "SELECT %s, %s, %s, %s, %s, %s, %s, %s, %s, %s"
    ),
}


def _identifier(value: str, label: str) -> str:
    if not _IDENTIFIER.fullmatch(value):
        raise ValueError(f"invalid Snowflake {label}: {value!r}")
    return value.upper()


def connection_settings(env: Mapping[str, str] | None = None) -> dict[str, str]:
    source = env if env is not None else os.environ
    required = ("SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PASSWORD")
    missing = [name for name in required if not source.get(name)]
    if missing:
        raise ValueError("missing " + ", ".join(missing))
    result = {
        "account": source["SNOWFLAKE_ACCOUNT"],
        "user": source["SNOWFLAKE_USER"],
        "password": source["SNOWFLAKE_PASSWORD"],
        "warehouse": source.get("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"),
        "database": _identifier(source.get("SNOWFLAKE_DATABASE", "BLOCKQUEST"), "database"),
        "schema": _identifier(source.get("SNOWFLAKE_SCHEMA", "PUBLIC"), "schema"),
    }
    if source.get("SNOWFLAKE_ROLE"):
        result["role"] = source["SNOWFLAKE_ROLE"]
    return result


class SnowflakeAnalyticsSink:
    sink_name = "snowflake"

    def __init__(
        self,
        telemetry_dir: Path,
        *,
        connect: Callable[..., Any] | None = None,
        env: Mapping[str, str] | None = None,
    ) -> None:
        self.local = JsonlAnalyticsSink(telemetry_dir)
        self._settings = connection_settings(env)
        if connect is None:
            from snowflake.connector import connect as snowflake_connect
            connect = snowflake_connect
        self._connection = connect(**self._settings)
        self._initialize_schema()
        self._queue: queue.Queue[tuple[str, tuple[Any, ...]] | None] = queue.Queue()
        self._worker = threading.Thread(
            target=self._drain, name="snowflake-writer", daemon=True
        )
        self._worker.start()

    def _initialize_schema(self) -> None:
        cursor = self._connection.cursor()
        try:
            for statement in _SCHEMA.values():
                cursor.execute(statement)
        finally:
            cursor.close()

    def _drain(self) -> None:
        while True:
            item = self._queue.get()
            if item is None:
                self._queue.task_done()
                return
            table, values = item
            try:
                cursor = self._connection.cursor()
                try:
                    cursor.execute(_INSERTS[table], values)
                finally:
                    cursor.close()
            except Exception as exc:  # noqa: BLE001
                logger.warning("snowflake write failed for %s: %s", table, exc)
            finally:
                self._queue.task_done()

    def log_attempt(self, row: AttemptRow) -> None:
        self.local.log_attempt(row)
        self._queue.put(("ATTEMPTS", (
            row.attempt_id, row.learner_id, row.session_id, row.quest_id,
            row.question_id, row.fact_a, row.fact_b, row.correct_answer,
            row.chosen_answer, row.is_correct, row.response_ms,
            row.explanation_style, row.hint_level, row.misconception, row.timestamp,
        )))

    def log_quest_event(self, row: QuestEventRow) -> None:
        self.local.log_quest_event(row)
        self._queue.put(("QUEST_EVENTS", (
            row.event_id, row.learner_id, row.session_id, row.quest_id,
            row.event_type, json.dumps(row.event_data), row.timestamp,
        )))

    def log_token_usage(self, row: TokenUsageRow) -> None:
        self.local.log_token_usage(row)
        self._queue.put(("AI_TOKEN_USAGE", (
            row.usage_id, row.learner_id, row.session_id, row.call_type,
            row.model_used, row.prompt_tokens, row.completion_tokens,
            row.total_tokens, row.memory_was_used, row.timestamp,
        )))

    def flush(self, timeout: float = 10.0) -> None:
        self.local.flush(timeout)
        done = threading.Event()
        threading.Thread(target=lambda: (self._queue.join(), done.set()), daemon=True).start()
        done.wait(timeout)

    def _aggregate(self, sql: str, learner_id: str) -> dict[str, int]:
        try:
            self.flush()
            cursor = self._connection.cursor()
            try:
                cursor.execute(sql, (learner_id,))
                return OrderedDict((str(row[0]), int(row[1])) for row in cursor.fetchall())
            finally:
                cursor.close()
        except Exception as exc:  # noqa: BLE001
            logger.warning("snowflake read failed; using local telemetry: %s", exc)
            raise

    def session_token_totals(self, learner_id: str) -> dict[str, int]:
        try:
            return dict(self._aggregate(
                "SELECT session_id, SUM(total_tokens) FROM AI_TOKEN_USAGE "
                "WHERE learner_id = %s GROUP BY session_id ORDER BY MIN(timestamp)",
                learner_id,
            ))
        except Exception:
            return self.local.session_token_totals(learner_id)

    def session_call_counts(self, learner_id: str) -> dict[str, int]:
        try:
            return dict(self._aggregate(
                "SELECT session_id, COUNT(*) FROM AI_TOKEN_USAGE "
                "WHERE learner_id = %s GROUP BY session_id ORDER BY MIN(timestamp)",
                learner_id,
            ))
        except Exception:
            return self.local.session_call_counts(learner_id)

    def session_strategy_token_averages(self, learner_id: str) -> dict[str, int]:
        try:
            return dict(self._aggregate(
                "SELECT session_id, ROUND(AVG(total_tokens)) FROM AI_TOKEN_USAGE "
                "WHERE learner_id = %s AND call_type = 'select_strategy' "
                "GROUP BY session_id ORDER BY MIN(timestamp)",
                learner_id,
            ))
        except Exception:
            return self.local.session_strategy_token_averages(learner_id)
    def session_question_counts(self, learner_id: str) -> dict[str, int]:
        try:
            return dict(self._aggregate(
                "SELECT session_id, COUNT(*) FROM ATTEMPTS "
                "WHERE learner_id = %s GROUP BY session_id ORDER BY MIN(timestamp)",
                learner_id,
            ))
        except Exception:
            return self.local.session_question_counts(learner_id)

    def close(self) -> None:
        self.flush()
        self._queue.put(None)
        try:
            self._connection.close()
        except Exception as exc:  # noqa: BLE001
            logger.warning("snowflake close failed: %s", exc)