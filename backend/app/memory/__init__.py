"""Memory backend selection.

`BQ_MEMORY_BACKEND=local` (default) runs anywhere. `everos` requires Linux and
lands in Phase 3 — asking for it on Windows falls back to local with a warning
rather than crashing the app, because a demo that boots degraded beats a demo
that does not boot.
"""

from __future__ import annotations

import logging
from typing import Callable

from ..config import settings
from .base import (
    LearnerContext,
    MemoryStore,
    NullMemoryStore,
    Observation,
    compose_memory_note,
)
from .local import LocalMarkdownMemory

logger = logging.getLogger(__name__)

__all__ = [
    "LearnerContext",
    "LocalMarkdownMemory",
    "MemoryStore",
    "NullMemoryStore",
    "Observation",
    "build_memory_store",
    "compose_memory_note",
]


def build_memory_store(
    on_llm_usage: Callable[[Observation, int], None] | None = None,
) -> MemoryStore:
    """Pick a memory backend.

    `on_llm_usage` is only meaningful for EverOS, whose `memorize()` runs a real
    extraction model. The local store writes files and costs nothing, so it has
    nothing to report.
    """
    backend = settings.memory_backend.lower()

    if backend == "none":
        return NullMemoryStore()

    if backend == "everos":
        try:
            from .everos_store import EverOSMemory  # noqa: PLC0415

            return EverOSMemory(
                settings.memory_dir,
                app_id=settings.everos_app_id,
                project_id=settings.everos_project_id,
                search_method=settings.everos_search_method,
                top_k=settings.everos_top_k,
                flush_on_write=settings.everos_flush_on_write,
                on_llm_usage=on_llm_usage,
            )
        except ImportError as exc:
            logger.warning(
                "everos backend unavailable (%s); falling back to local markdown. "
                "EverOS needs Linux — run the backend in Docker.",
                exc,
            )
            return LocalMarkdownMemory(settings.memory_dir)

    return LocalMarkdownMemory(settings.memory_dir)
