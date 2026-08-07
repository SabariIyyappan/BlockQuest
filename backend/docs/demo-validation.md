# Backend Demo Validation

Validated on 2026-08-07 using Docker Compose, EverOS 1.2.3, the local OpenAI-compatible extraction stub, and JSONL telemetry.

## Commands

```bash
docker compose run --rm probe
docker compose run --rm tests
docker compose up -d api
conda run -n blockquest python backend/tools/demo_run.py --learner backend-demo-fixed-20260807
```

## Result

| Metric | Session 1 | Session 2 |
|---|---:|---:|
| Questions | 4 | 3 |
| Session tokens | 774 | 207 |
| Average strategy-selection tokens | 186 | 69 |

Memory-assisted strategy selection reduced average tokens by 63%. Total session tokens fell by 73%. Session 2 retrieved `visual block groups` from EverOS and displayed the memory note on its first question.

The slowest call was the cold Session 1 retrieval at roughly 2.7 seconds. Session 2's first question returned in 18 ms because the reset boundary synchronously warmed the cache after queued writes completed.

## Snowflake status

The Snowflake sink is covered by contract tests for credential validation, table creation, parameterized writes, aggregate reads, and local fallback. Live account validation remains pending because no Snowflake credentials are configured in this environment.

## Frontend status

Browser/UI validation, reveal-card rendering, slide capture, and backup recording remain pending until the frontend is available.