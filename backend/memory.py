"""EverOS memory helper — talks to the hosted EverOS Cloud API.

Corrected from the build plan's assumption of bare `everos.add()` /
`everos.search()` functions. The real pip package (`pip install everos`) is an
HTTP client SDK; calls are namespaced under `client.v1.memories`. See
PREP_NOTES.md at the repo root for the full writeup.

Usage:
    export EVEROS_API_KEY=...      # from the EverMind sponsor table
    from memory import store_observation, retrieve_learner_context
"""

from __future__ import annotations

import os
import time
import uuid

from everos import EverOS

_client: EverOS | None = None


def get_client() -> EverOS:
    """Lazily construct the shared EverOS client (reads EVEROS_API_KEY)."""
    global _client
    if _client is None:
        api_key = os.environ.get("EVEROS_API_KEY")
        if not api_key:
            raise RuntimeError(
                "EVEROS_API_KEY is not set — get it from the EverMind sponsor "
                "table and export it before starting the backend."
            )
        _client = EverOS(api_key=api_key)
    return _client


def store_observation(learner_id: str, observation: str, session_id: str | None = None) -> None:
    """Write one observation into the learner's memory.

    `observation` is a plain-text string like:
      "Alex answered 3x4 as 7, likely treating x as +. Visual groups helped."
    """
    client = get_client()
    client.v1.memories.add(
        user_id=learner_id,
        session_id=session_id,
        messages=[
            {
                "sender_id": learner_id,
                "role": "user",
                "timestamp": int(time.time() * 1000),
                "content": observation,
            }
        ],
    )


def retrieve_learner_context(learner_id: str, skill_topic: str, top_k: int = 3) -> list[str]:
    """Search the learner's memory for the top-k relevant observations."""
    client = get_client()
    result = client.v1.memories.search(
        query=skill_topic,
        filters={"user_id": learner_id},
        top_k=top_k,
        method="hybrid",
    )
    # Adjust field access once you've inspected a real response shape on-site —
    # the SDK models this as SearchMemoriesResponse; treat this as a starting point.
    episodes = getattr(result, "episodes", None) or getattr(result, "data", {}).get("episodes", [])
    return [ep.summary if hasattr(ep, "summary") else str(ep) for ep in episodes]


def new_session_id() -> str:
    return str(uuid.uuid4())
