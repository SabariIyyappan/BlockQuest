"""FastAPI entrypoint.

Run from the backend/ directory:

    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .memory import build_memory_store
from .models import (
    NextChallengeRequest,
    NextChallengeResponse,
    SessionSummaryResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
)
from .service import BlockQuestService, QuestionNotFoundError, fact_count
from .session import session_store
from .telemetry import build_analytics_sink

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("blockquest")

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info(
        "memory=%s analytics=%s facts=%d",
        memory_store.backend_name,
        analytics_sink.sink_name,
        fact_count(),
    )
    yield


app = FastAPI(
    title="BlockQuest API",
    version="0.2.0",
    description="Adaptive multiplication quest backend — memory-driven, cost-metered.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

analytics_sink = build_analytics_sink()

# The EverOS store reports its own extraction cost, and the only thing that
# knows how to book that is the service — which does not exist yet. A late-bound
# closure breaks the cycle without making either side aware of the other.
_service: "BlockQuestService | None" = None


def _on_memory_write_cost(observation, prompt_tokens: int) -> None:
    if _service is not None:
        _service.record_memory_write_cost(observation, prompt_tokens)


memory_store = build_memory_store(on_llm_usage=_on_memory_write_cost)
service = BlockQuestService(
    memory=memory_store,
    analytics=analytics_sink,
    sessions=session_store,
)
_service = service


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "memory_backend": memory_store.backend_name,
        "analytics_sink": analytics_sink.sink_name,
        "facts_loaded": fact_count(),
    }


@app.post("/next-challenge", response_model=NextChallengeResponse)
def next_challenge(req: NextChallengeRequest) -> NextChallengeResponse:
    return service.next_challenge(req)


@app.post("/submit-answer", response_model=SubmitAnswerResponse)
def submit_answer(req: SubmitAnswerRequest) -> SubmitAnswerResponse:
    try:
        return service.submit_answer(req)
    except QuestionNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"question_id '{req.question_id}' was not served or already answered",
        ) from None


@app.get("/session-summary/{learner_id}", response_model=SessionSummaryResponse)
def session_summary(learner_id: str) -> SessionSummaryResponse:
    return service.session_summary(learner_id)


@app.post("/debug/new-session/{learner_id}")
def new_session(learner_id: str) -> dict[str, str]:
    """Simulate the browser refresh from the demo script.

    Drops live state while leaving memory and telemetry intact — which is
    exactly the condition the Session 2 reveal is supposed to prove.
    """
    state = session_store.start_new_session(learner_id)

    # The next thing that happens is the first question of the new session, and
    # under EverOS that retrieval takes ~2.6s cold. Start it now, during the
    # seconds it takes a human to click, so the memory reveal lands instantly.
    try:
        memory_store.prefetch_learner_context(
            learner_id, exclude_session_id=state.session_id
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("memory prefetch failed: %s", exc)

    return {"learner_id": learner_id, "session_id": state.session_id,
            "session_number": str(state.session_number)}
