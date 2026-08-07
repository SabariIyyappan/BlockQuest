# BlockQuest API Contract

**Base URL (dev):** `http://localhost:8000`
**Status:** frozen. Changes require a 2-minute verbal sync between A and B.

Source of truth is `backend/app/models.py`. This file must match it.

---

## Additive changes since the original build plan

These are all **optional / nullable** fields — existing frontend code that
ignores them keeps working.

| Field | Endpoint | Why |
|---|---|---|
| `tokens_used_this_call` | `/submit-answer` | Drives Person A's live token counter (task A2.8). The plan flagged this as a late addition; it is baked in from the start. |
| `tokens_used_session` | `/submit-answer` | Running total, so the counter survives a component remount without the frontend accumulating state itself. |
| `hint_text` | `/next-challenge` | Backend composes the `hint_level: 1` string. Frontend renders it verbatim instead of hardcoding copy. |
| `worked_example` | `/next-challenge` | Array of steps for `hint_level: 2`. Frontend animates one step per 500ms (task A2.4). |
| `session_id` | `/next-challenge` | Lets the frontend show which session it's in, and makes backend logs traceable from the browser. |

---

## POST /next-challenge

**Request**

```json
{
  "learner_id": "alex",
  "quest_id": 1,
  "last_answer_correct": null,
  "last_response_ms": null
}
```

`quest_id`: 1 = bridge, 2 = shelter, 3 = boss. `last_answer_correct` and
`last_response_ms` are `null` on the first call of a quest.

**Response**

```json
{
  "question_id": "q_3x4",
  "question_text": "The bridge needs 3 rows of 4 blocks. How many blocks?",
  "a": 3,
  "b": 4,
  "format": "numeric",
  "options": [7, 10, 12, 14],
  "correct_answer": 12,
  "difficulty": "easy",
  "hint_level": 0,
  "num_options": 4,
  "boss_trigger": false,
  "memory_note": null,
  "hint_text": null,
  "worked_example": null,
  "session_id": "3f2a...".
}
```

- `format` — `"numeric"` | `"groups"` | `"array"`. The backend decides; the
  frontend just renders what it's told.
- `hint_level` — `0` none, `1` show `hint_text`, `2` show `worked_example`.
- `num_options` — `4` normally, `2` after two consecutive errors.
- `memory_note` — non-null only when EverOS returned a prior-session strategy.
  This is the "aha" moment. Render it as the gold speech bubble.
- `options` is already truncated to `num_options` and always contains
  `correct_answer`.

---

## POST /submit-answer

**Request**

```json
{
  "learner_id": "alex",
  "quest_id": 1,
  "question_id": "q_3x4",
  "chosen_answer": 12,
  "response_ms": 4200
}
```

**Response**

```json
{
  "correct": true,
  "blocks_awarded": 4,
  "explanation": null,
  "explanation_style": "groups",
  "quest_complete": false,
  "boss_defeated": false,
  "consecutive_errors": 0,
  "tokens_used_this_call": 80,
  "tokens_used_session": 1240
}
```

- `explanation` — `null` when correct; a misconception-aware string when wrong.
- `blocks_awarded` — `0` on a wrong answer. **Never negative.** The game never
  takes blocks away.
- `boss_defeated` — `true` only on the final correct answer of quest 3.

---

## GET /session-summary/{learner_id}

**Response**

```json
{
  "learner_id": "alex",
  "session_number": 2,
  "mastery_before": 0.33,
  "mastery_after": 0.83,
  "questions_session1": 6,
  "questions_session2": 4,
  "tokens_session1": 2840,
  "tokens_session2": 1650,
  "token_reduction_pct": 42,
  "strategy_retrieved": "visual block groups",
  "memory_source": "EverOS",
  "facts_mastered": ["3x4", "3x5", "4x6", "6x3"],
  "facts_weak": ["6x7"],
  "pricing_cta": "Alex mastered 4 new multiplication facts in 8 minutes. Continue tomorrow — $12/month."
}
```

---

## GET /health

```json
{ "status": "ok", "memory_backend": "local", "analytics_sink": "jsonl" }
```

Use this to confirm which backends are live before the demo.
