"""Snowflake sink contract tests without a live warehouse."""

from __future__ import annotations

from app.telemetry.base import AttemptRow, QuestEventRow, TokenUsageRow
from app.telemetry.snowflake_sink import SnowflakeAnalyticsSink, connection_settings


class FakeCursor:
    def __init__(self, connection):
        self.connection = connection
        self.rows = []

    def execute(self, sql, params=None):
        self.connection.calls.append((" ".join(sql.split()), params))
        if sql.startswith("SELECT session_id"):
            self.rows = list(self.connection.query_rows)
        return self

    def fetchall(self):
        return self.rows

    def close(self):
        pass


class FakeConnection:
    def __init__(self):
        self.calls = []
        self.query_rows = []
        self.closed = False

    def cursor(self):
        return FakeCursor(self)

    def close(self):
        self.closed = True


def env():
    return {
        "SNOWFLAKE_ACCOUNT": "acct",
        "SNOWFLAKE_USER": "user",
        "SNOWFLAKE_PASSWORD": "secret",
        "SNOWFLAKE_WAREHOUSE": "compute_wh",
        "SNOWFLAKE_DATABASE": "blockquest",
        "SNOWFLAKE_SCHEMA": "public",
    }


def test_connection_settings_require_credentials():
    try:
        connection_settings({})
    except ValueError as exc:
        assert "SNOWFLAKE_ACCOUNT" in str(exc)
    else:
        raise AssertionError("missing credentials were accepted")


def test_schema_and_parameterized_writes(tmp_path):
    connection = FakeConnection()
    seen_kwargs = {}

    def connect(**kwargs):
        seen_kwargs.update(kwargs)
        return connection

    sink = SnowflakeAnalyticsSink(tmp_path, connect=connect, env=env())
    sink.log_attempt(AttemptRow(
        learner_id="alex", session_id="s1", quest_id=1, question_id="3x4",
        fact_a=3, fact_b=4, correct_answer=12, chosen_answer=7,
        is_correct=False, response_ms=1200, explanation_style="groups", hint_level=1,
    ))
    sink.log_quest_event(QuestEventRow(
        learner_id="alex", session_id="s1", quest_id=1,
        event_type="adaptation_triggered", event_data={"format": "groups"},
    ))
    sink.log_token_usage(TokenUsageRow(
        learner_id="alex", session_id="s1", call_type="explain",
        model_used="rule_engine", prompt_tokens=10, completion_tokens=5,
        total_tokens=15, memory_was_used=False,
    ))
    sink.flush()

    assert seen_kwargs["database"] == "BLOCKQUEST"
    assert sum(sql.startswith("CREATE TABLE") for sql, _ in connection.calls) == 3
    inserts = [(sql, params) for sql, params in connection.calls if sql.startswith("INSERT")]
    assert len(inserts) == 3
    assert all("%s" in sql and params for sql, params in inserts)
    assert sink.local.session_token_totals("alex") == {"s1": 15}
    sink.close()


def test_reads_use_snowflake_aggregates(tmp_path):
    connection = FakeConnection()
    connection.query_rows = [("s1", 120), ("s2", 60)]
    sink = SnowflakeAnalyticsSink(tmp_path, connect=lambda **_: connection, env=env())
    assert sink.session_token_totals("alex") == {"s1": 120, "s2": 60}
    sink.close()


def test_reads_fall_back_to_local_on_warehouse_error(tmp_path):
    class BrokenCursor(FakeCursor):
        def execute(self, sql, params=None):
            if sql.startswith("SELECT"):
                raise RuntimeError("warehouse offline")
            return super().execute(sql, params)

    class BrokenConnection(FakeConnection):
        def cursor(self):
            return BrokenCursor(self)

    connection = BrokenConnection()
    sink = SnowflakeAnalyticsSink(tmp_path, connect=lambda **_: connection, env=env())
    sink.log_token_usage(TokenUsageRow(
        learner_id="alex", session_id="local", call_type="diagnose",
        model_used="rule_engine", prompt_tokens=8, completion_tokens=2,
        total_tokens=10, memory_was_used=False,
    ))
    assert sink.session_token_totals("alex") == {"local": 10}
    sink.close()