"""Runtime configuration.

Every external service is optional. The defaults here produce a backend that
runs end-to-end with no credentials, no network, and no Linux — which is what
lets Person A integrate against a real API before the hackathon starts.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_ROOT / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="BQ_",
        env_file=BACKEND_ROOT / ".env",
        extra="ignore",
    )

    # "local" — markdown stand-in that runs anywhere.
    # "everos" — the real thing; requires Linux (fcntl), so Docker on Windows.
    memory_backend: str = "local"
    memory_dir: Path = BACKEND_ROOT / "memory_data"

    # EverOS namespacing — these become directory names under EVEROS_ROOT, so
    # they are restricted to a path-safe charset upstream.
    everos_app_id: str = "blockquest"
    everos_project_id: str = "tutor"
    # keyword | vector | hybrid | agentic. Keyword is the only one that works
    # without an LLM/embedding key configured, so it is the safe default.
    everos_search_method: str = "keyword"
    everos_top_k: int = 20
    # Force EverOS's extraction pipeline on every write. Needs a real LLM key;
    # without one the write fails outright. Off by default — retrieval reads
    # EverOS's unprocessed buffer too, so memory works either way.
    everos_flush_on_write: bool = False

    # "jsonl" — append-only local log. "snowflake" — the real warehouse.
    analytics_sink: str = "jsonl"
    telemetry_dir: Path = BACKEND_ROOT / "telemetry_data"

    summary_fallback: bool = True

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",  # vite default, in case A scaffolds with it
        "http://127.0.0.1:5173",
    ]


settings = Settings()
