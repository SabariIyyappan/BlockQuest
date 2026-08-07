# BlockQuest Backend

FastAPI service for the adaptive multiplication quest. Runs fully offline —
no credentials, no network, no Linux required.

## Run it

```bash
conda activate blockquest
cd backend
uvicorn app.main:app --reload --port 8000
```

Interactive docs at http://localhost:8000/docs, health at `/health`.

EverOS validation runs in Linux containers:

```bash
docker compose run --rm probe  # real memorize/search round-trip
docker compose run --rm tests  # 33 tests including EverOS + Snowflake contracts
```

```bash
pytest -q          # 26 native tests, ~1s
```

## Layout

| File | Does |
|---|---|
| `app/main.py` | Routes, CORS, health. Thin. |
| `app/service.py` | Orchestration — one method per endpoint. |
| `app/models.py` | The frozen contract. Source of truth for `/contracts/api.md`. |
| `app/adaptation.py` | Rule engine: difficulty, format, hints, simplification. |
| `app/mastery.py` | EMA mastery scores per fact. |
| `app/misconceptions.py` | Wrong-answer classifier + explanations. |
| `app/question_bank.py` | Fact loading, selection, question phrasing. |
| `app/session.py` | Per-learner runtime state. Deliberately forgetful. |
| `app/token_meter.py` | Measured token cost via tiktoken. |
| `app/memory/` | `MemoryStore` boundary + local markdown stand-in. |
| `app/telemetry/` | `AnalyticsSink` boundary + local JSONL sink. |
| `tools/gen_questions.py` | Regenerates `data/questions.json` (36 facts). |

## Why the adapters exist

**EverOS is POSIX-only.** It imports `fcntl` at module scope, so on Windows it
cannot even be imported — upstream states plainly that Windows is unsupported.
Everything therefore talks to `MemoryStore`, and `LocalMarkdownMemory` writes
the same markdown shape EverOS produces. Phase 3 swaps the implementation
inside Docker; no call site changes.

`AnalyticsSink` exists for the same reason applied to Snowflake: no credentials
before hackathon day, and no appetite for a demo that dies with the wifi.

Switch backends via `.env` (see `.env.example`):

```
BQ_MEMORY_BACKEND=local|everos|none
BQ_ANALYTICS_SINK=jsonl|snowflake
```

Both degrade to the local implementation with a warning rather than crashing.

## The demo loop

```bash
# Session 1 — cold. Answer 3x4 as 7 to trigger the additive misconception.
curl -X POST localhost:8000/next-challenge \
  -H 'content-type: application/json' \
  -d '{"learner_id":"alex","quest_id":1,"last_answer_correct":null,"last_response_ms":null}'

# Simulate the browser refresh from the demo script.
curl -X POST localhost:8000/debug/new-session/alex

# Session 2 — memory_note is now populated and format has switched.
```

Observed behaviour end to end:

| | Session 1 | Session 2 |
|---|---|---|
| Questions | 4 | 3 |
| Tokens | 774 | 207 |
| Strategy | discovered | recalled: visual block groups |
| Per-call cost | 207 | 69 |

## Design decisions worth knowing

**Quest 1 walks a fixed ladder** (`3x4 → 4x6 → 6x7`). Every fact starts at the
same prior, so there is no signal to select on, and a fixed probe order makes
the demo rehearsable.

**Scaffolding responds to evidence, not priors.** A learner's first question is
always `numeric`. Without that guard the default mastery of 0.30 sits below the
visual threshold, every learner opens on `groups`, and the switch-to-groups
adaptation becomes invisible.

**Quest summaries record the format that *worked*, not the last one seen.**
Otherwise the summary buries the correction and Session 2 recalls "plain
equations" for a learner who needed visual groups.

**The memory bubble fires once per session.** Memory still drives every
decision and every token measurement — it just stops shouting.

**Wrong answers never cost blocks.** `blocks_awarded` is 0 or positive, never
negative.

## Token numbers are measured, not estimated

The build plan proposed flat estimates (150 / 80). Instead, `token_meter` builds
the prompt each path would actually send and counts it with `tiktoken`. The
no-memory prompt has to carry the mastery table and the full format menu to
diagnose from scratch; the memory-assisted prompt carries a one-line recall.

That measures at **207 vs 69 tokens per call — a 67% per-call reduction**, and
73% across a full session once Session 2's shorter question count is included.
Both are higher than the 42% in the deck. `model_used` stays `rule_engine`
until a real LLM is wired in, so nothing conflates measured prompts with
billed ones.
