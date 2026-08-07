# EverOS Pre-Hackathon Prep — Findings (2026-08-07)

Verified against the real repo/package, not the docs summary in the build plan. Two things in the original "Both" checklist were wrong — fixed below.

## The correction that matters most

**Don't clone/build EverOS from source.** `git clone EverMind-AI/EverOS` gets you the
*self-hosted server* — and it hard-imports `fcntl` (POSIX-only) at CLI startup, so it
**does not run on native Windows at all**, not even `--version`. It also needs Python
3.12+, OpenRouter + DeepInfra API keys, and ~150MB of deps (lancedb/pyarrow/pillow).
None of that matches "EverOS credits from the sponsor table" in the plan.

What actually matches "credits": `pip install everos` gives you a thin HTTP client
(`from everos import EverOS`) whose default `base_url` is `https://api.evermind.ai` —
the **hosted EverOS Cloud API**. That's what sponsor credits unlock. Just:

```bash
pip install everos
```

```python
from everos import EverOS
client = EverOS(api_key="...")  # get this from the EverMind sponsor table on-site
```

No git clone, no server process, no WSL, no Python 3.12 requirement — works fine on
Python 3.11 (confirmed installed clean here).

## Corrected SDK surface (`memory.py` helper, B1.3 in the plan)

The plan assumed `everos.add()` / `everos.search()` as bare functions. The real shape is
namespaced under `client.v1.memories`:

```python
client.v1.memories.add(user_id=..., messages=[...], session_id=...)
client.v1.memories.search(query=..., filters={"user_id": ...}, top_k=5, method="hybrid")
client.v1.memories.flush(user_id=..., session_id=...)
```

`messages` is a list of `{sender_id, role, timestamp(ms), content}` dicts — same shape
either you're chatting or logging structured observations as a single "message". Search
`method` options: `keyword` / `vector` / `hybrid` (default) / `agentic`. `memory_types`
filter: `episodic_memory` / `profile` / `raw_message` / `agent_memory`.

A ready-to-use `backend/memory.py` implementing `store_observation()` /
`retrieve_learner_context()` against this real API is in this repo — swap in the
sponsor API key and it's live.

## Still true from the original plan

- Memory is markdown-backed conceptually (episodes/profile/cases), scoped by `user_id`.
- `everos.search()` (→ `client.v1.memories.search`) is how Session 2 retrieves what
  Session 1 learned.

## Action items before event day

- [ ] Get the EverMind sponsor-table API key format confirmed (is it per-team, rate
      limited?) — ask in Discord now rather than at the table.
- [ ] Since this hits `api.evermind.ai` over the network, confirm venue wifi reliability
      is factored into the risk table (already is, generically — this makes it concrete:
      EverOS calls are now a network dependency, not local).
- [ ] `pip install everos` on both laptops tonight (verified working on Python 3.11here).

## Files added

- `backend/memory.py` — corrected EverOS helper (`store_observation`,
  `retrieve_learner_context`) using the real hosted-API SDK shape.
- `backend/test_everos_roundtrip.py` — the B1.4 round-trip test, updated to the real
  client. Needs an API key to actually run; wire yours in and execute on-site during
  Hour 0.
