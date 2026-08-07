# EverOS imports fcntl at module scope, so the real memory layer only runs on
# Linux. This image is the whole reason Phase 3 exists — the app code is
# unchanged, only BQ_MEMORY_BACKEND flips.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# EverOS pulls LanceDB, which wants a toolchain for some wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Written to by the app; the compose file mounts volumes over both.
ENV EVEROS_ROOT=/data/everos \
    BQ_MEMORY_DIR=/data/everos \
    BQ_TELEMETRY_DIR=/data/telemetry
RUN mkdir -p /data/everos /data/telemetry

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=5 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
