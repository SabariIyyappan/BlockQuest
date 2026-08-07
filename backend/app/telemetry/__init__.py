"""Analytics sink selection.

`BQ_ANALYTICS_SINK=jsonl` (default) writes locally. `snowflake` lands in
Phase 4 and degrades to jsonl if credentials are missing or the warehouse is
unreachable — the demo must survive a dead sponsor booth wifi.
"""

from __future__ import annotations

import logging

from ..config import settings
from .base import (
    AnalyticsSink,
    AttemptRow,
    QuestEventRow,
    TokenUsageRow,
)
from .jsonl import JsonlAnalyticsSink

logger = logging.getLogger(__name__)

__all__ = [
    "AnalyticsSink",
    "AttemptRow",
    "JsonlAnalyticsSink",
    "QuestEventRow",
    "TokenUsageRow",
    "build_analytics_sink",
]


def build_analytics_sink() -> AnalyticsSink:
    sink = settings.analytics_sink.lower()

    if sink == "snowflake":
        try:
            from .snowflake_sink import SnowflakeAnalyticsSink  # noqa: PLC0415

            return SnowflakeAnalyticsSink()
        except Exception as exc:  # noqa: BLE001 - any failure means fall back
            logger.warning(
                "snowflake sink unavailable (%s); falling back to local jsonl", exc
            )

    return JsonlAnalyticsSink(settings.telemetry_dir)
