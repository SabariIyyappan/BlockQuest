"""Memory backend selection.

`BQ_MEMORY_BACKEND=local` (default) runs anywhere. `everos` requires Linux and
lands in Phase 3 — asking for it on Windows falls back to local with a warning
rather than crashing the app, because a demo that boots degraded beats a demo
that does not boot.
"""

from __future__ import annotations

import logging

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


def build_memory_store() -> MemoryStore:
    backend = settings.memory_backend.lower()

    if backend == "none":
        return NullMemoryStore()

    if backend == "everos":
        try:
            from .everos_store import EverOSMemory  # noqa: PLC0415

            return EverOSMemory(settings.memory_dir)
        except ImportError as exc:
            logger.warning(
                "everos backend unavailable (%s); falling back to local markdown. "
                "EverOS needs Linux — run the backend in Docker.",
                exc,
            )
            return LocalMarkdownMemory(settings.memory_dir)

    return LocalMarkdownMemory(settings.memory_dir)
