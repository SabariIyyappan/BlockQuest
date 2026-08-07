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
