# BlockQuest — Detailed Step-by-Step Build Plan

**Event:** Snowflake × Beta Fund × EverMind Agent & Token Economy Hackathon
**Track:** Track 1 — Cost of Intelligence
**Team:** 2 people (Person A = Frontend/Demo/Deck, Person B = Backend/EverOS/Snowflake)
**Build window:** 11:00 AM → 4:00 PM (5 clock hours, ~4 effective after breaks/syncs)
**Demo:** 3 minutes, audience vote
**Submission:** Working demo + slide deck

---

## Pre-Hackathon Prep (before event day)

Do as much of this as possible the night before. None of it depends on sponsor credits.

### Both

- [ ] Clone EverOS repo: `git clone https://github.com/EverMind-AI/EverOS.git` — read the quickstart README, run the hello-world example, confirm `pip install everos` works on both laptops.
- [ ] Create a shared GitHub repo `blockquest/` with three folders: `/frontend`, `/backend`, `/contracts`.
- [ ] Agree on local dev ports: frontend on `:3000`, backend on `:8000`.
- [ ] Install Python 3.12+, Node 20+, and verify both machines can run FastAPI (`uvicorn`) and a basic React/Vite app.
- [ ] Create a Snowflake trial account (or confirm hackathon credit redemption steps so you can do it in <5 min on-site).
- [ ] Join the hackathon Discord. Introduce yourselves in the EverMind and Snowflake channels.
- [ ] Read EverOS docs on: `everos.add()`, `everos.search()`, memory scoping by `user_id`, markdown file structure. Understand that memories are stored as `.md` files and indexed via SQLite + LanceDB.
- [ ] Bookmark Snowflake Cortex Agent docs and the `COMPLETE()` function reference.
- [ ] Prepare a `seed_alex.py` script skeleton that will write Session 1 data into EverOS + Snowflake (you'll fill in exact values during the build).

### Person A (Frontend)

- [ ] Scaffold a Vite + React project (or plain HTML/JS if faster for you — pick whichever you'll move fastest in).
- [ ] Find and download 3–5 free isometric/voxel sprite assets (character, bridge pieces, shelter pieces, boss creature, grass/river tiles). Sources: kenney.nl, itch.io free asset packs. No Minecraft assets.
- [ ] Build a bare canvas/div grid (e.g., 12×8) that renders tile sprites. Confirm you can place/remove a block visually with a click.
- [ ] Prepare a `mock_api.js` file that returns hardcoded JSON matching the API contract (so you never block on Person B).

### Person B (Backend)

- [ ] Scaffold a FastAPI project with three route stubs (`/next-challenge`, `/submit-answer`, `/session-summary/{learner_id}`).
- [ ] Write the multiplication question bank: a JSON file with ~30 entries covering 2× through 9× tables, each tagged with `fact_id`, `a`, `b`, `product`, `difficulty_tier` (easy/medium/hard), and 3 plausible wrong answers (one additive misconception like a+b, one off-by-one, one random).
- [ ] Write a `mastery.py` module: a dict of `{fact_id: float}` mastery scores (0.0–1.0) with functions `update_mastery(fact_id, correct: bool)` using a simple exponential moving average.
- [ ] Confirm you can write and read an EverOS memory locally with their Python SDK.

---

## The API Contract (lock this before splitting)

Write this into `/contracts/api.md` and do not edit it after Hour 0 without a 2-minute verbal sync.

```
### POST /next-challenge

Request:
{
  "learner_id": "alex",
  "quest_id": 1,                        // 1=bridge, 2=shelter, 3=boss
  "last_answer_correct": null,           // null on first call of a quest
  "last_response_ms": null
}

Response:
{
  "question_id": "q_3x4_01",
  "question_text": "The bridge needs 3 rows of 4 blocks. How many blocks?",
  "a": 3,
  "b": 4,
  "format": "numeric",                   // "numeric" | "groups" | "array"
  "options": [7, 10, 12, 14],
  "correct_answer": 12,
  "difficulty": "easy",                  // "easy" | "medium" | "hard"
  "hint_level": 0,                       // 0=none, 1=small hint, 2=worked example
  "num_options": 4,                      // 4 or 2 (reduced after errors)
  "boss_trigger": false,
  "memory_note": null                    // e.g., "Last time, grouping blocks helped."
}

### POST /submit-answer

Request:
{
  "learner_id": "alex",
  "quest_id": 1,
  "question_id": "q_3x4_01",
  "chosen_answer": 12,
  "response_ms": 4200
}

Response:
{
  "correct": true,
  "blocks_awarded": 4,
  "explanation": null,                    // null if correct; explanation string if wrong
  "explanation_style": "groups",          // which style was used
  "quest_complete": false,
  "boss_defeated": false,
  "consecutive_errors": 0
}

### GET /session-summary/{learner_id}

Response:
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

## Hour 0 — Setup & Contract Lock (11:00–11:15 AM, joint)

| # | Task | Who | Duration | Done |
|---|------|-----|----------|------|
| 0.1 | Redeem Snowflake credits at sponsor table; get connection string, account URL, username. | B | 5 min | ☐ |
| 0.2 | Get EverOS credits / quickstart guide from EverMind table; confirm SDK version matches what you tested. | B | 5 min | ☐ |
| 0.3 | Pull shared repo on both machines, confirm `/frontend` and `/backend` run. | Both | 3 min | ☐ |
| 0.4 | Open `/contracts/api.md`, read aloud together, confirm "this is frozen." | Both | 2 min | ☐ |

**Exit criteria:** Both machines boot the skeleton app. Snowflake creds work. EverOS SDK installed. Contract agreed.

---

## Hour 1 — Foundations (11:15 AM–12:15 PM)

### Person A — Quest 1 UI (Bridge)

| # | Task | Detail | Duration | Done |
|---|------|--------|----------|------|
| A1.1 | Game state manager | Create a React context (or plain JS state object) holding: `currentQuest` (1/2/3), `blocksEarned`, `questProgress` (array of answered question results), `playerPosition`, `gamePhase` ("playing" / "answering" / "building" / "complete"). All UI reads from this single state. | 15 min | ☐ |
| A1.2 | Layout shell | Build the screen layout from the spec: top bar (focus hearts, quest name, block count), left panel (isometric grid ~600×400px), right panel (question + answer buttons), bottom bar (narrative text). Use CSS grid, fixed proportions. | 15 min | ☐ |
| A1.3 | Isometric grid renderer | Render a 10×8 grid of flat grass tiles. Add a 3-tile-wide river gap in the middle. Place a simple character sprite on the left side. Use CSS transforms (`rotateX(60deg) rotateZ(45deg)`) on a flat div grid — no 3D library needed. Alternatively, use a flat top-down pixel-art grid if isometric is taking too long (the adaptation story is what matters, not the perspective). | 20 min | ☐ |
| A1.4 | Answer button component | Build a `<QuestionPanel>` component: displays `question_text` from the API response, renders `options` as large tappable buttons (4 or 2, driven by `num_options`), highlights correct/incorrect on click with green/red flash, calls `POST /submit-answer` (or `mock_api.js` for now). | 10 min | ☐ |
| A1.5 | Bridge-building animation | On correct answer: animate N blocks (from `blocks_awarded`) appearing one-by-one over the river gap (CSS transition, `opacity 0→1` + `translateY` drop, 150ms stagger per block). After all bridge blocks placed, character walks across (translate sprite position). | 15 min | ☐ |
| A1.6 | Quest 1 flow integration | Wire the full sequence: load quest → call `/next-challenge` → show question → player answers → call `/submit-answer` → animate blocks → repeat for 3 questions → quest complete screen ("Bridge repaired!"). Use mock API data for now. Test the full loop 3 times. | 15 min | ☐ |
| A1.7 | Wrong-answer feedback | On wrong answer: blocks wobble/shake animation (CSS `@keyframes shake`), red flash on the gap, no blocks placed — but NO blocks removed from earned count (never punish). Show the `explanation` text from the API response in the bottom bar. | 10 min | ☐ |

**A1 exit criteria:** You can click through all 3 Quest 1 questions using mock data, see blocks build the bridge, see wrong-answer feedback, and the character crosses at the end.

### Person B — EverOS + Snowflake + FastAPI skeleton

| # | Task | Detail | Duration | Done |
|---|------|--------|----------|------|
| B1.1 | FastAPI skeleton with CORS | Set up FastAPI with CORS middleware allowing `localhost:3000`. Create the three route handlers returning hardcoded JSON matching the contract exactly. Test with `curl`. Deploy this immediately so A can switch from mock to real API whenever convenient. | 10 min | ☐ |
| B1.2 | Question bank loader | Load the pre-written question bank JSON. Build a `pick_question(learner_id, quest_id, mastery_scores, difficulty)` function that selects the next question: for Quest 1, always pick from 3×, 4×, 6× tables (diagnostic). For Quest 2, pick based on weak facts. For Quest 3 (boss), pick the single weakest fact. | 15 min | ☐ |
| B1.3 | EverOS initialization | Initialize EverOS with a `memory_dir` at `./everos_data/`. Create a helper module `memory.py` with two functions: `store_observation(learner_id, observation_dict)` — writes a memory using `everos.add()` with fields: `user_id=learner_id`, content=formatted observation string (misconception, effective style, mastery snapshot). `retrieve_learner_context(learner_id, skill_topic)` — calls `everos.search()` scoped to the learner, returns the top 3 relevant memories as a list of strings. | 20 min | ☐ |
| B1.4 | Test EverOS round-trip | Write a test: store an observation ("Alex answered 3×4 as 7, may be treating × as +, visual groups helped"), then retrieve it by searching "multiplication 3 times table". Confirm the memory comes back with the right content. Print the markdown file to verify it's human-readable. | 10 min | ☐ |
| B1.5 | Snowflake connection | Connect to Snowflake using the `snowflake-connector-python` package. Create the database `BLOCKQUEST` and schema `PUBLIC`. | 5 min | ☐ |
| B1.6 | Create Snowflake tables | Run `CREATE TABLE` for all four tables: | 15 min | ☐ |

```sql
CREATE TABLE PLAYERS (
    learner_id VARCHAR PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_sessions INT DEFAULT 0,
    current_mastery_json VARIANT  -- JSON blob of {fact_id: score}
);

CREATE TABLE ATTEMPTS (
    attempt_id VARCHAR PRIMARY KEY,
    learner_id VARCHAR,
    session_id VARCHAR,
    quest_id INT,
    question_id VARCHAR,
    fact_a INT,
    fact_b INT,
    correct_answer INT,
    chosen_answer INT,
    is_correct BOOLEAN,
    response_ms INT,
    explanation_style VARCHAR,    -- "numeric", "groups", "array"
    hint_level INT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE QUEST_EVENTS (
    event_id VARCHAR PRIMARY KEY,
    learner_id VARCHAR,
    session_id VARCHAR,
    quest_id INT,
    event_type VARCHAR,           -- "quest_start", "quest_complete", "boss_defeated", "adaptation_triggered"
    event_data VARIANT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE AI_TOKEN_USAGE (
    usage_id VARCHAR PRIMARY KEY,
    learner_id VARCHAR,
    session_id VARCHAR,
    call_type VARCHAR,            -- "diagnose", "explain", "select_strategy", "retrieve_memory"
    model_used VARCHAR,
    prompt_tokens INT,
    completion_tokens INT,
    total_tokens INT,
    memory_was_used BOOLEAN,      -- KEY FIELD: did this call use EverOS memory?
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

| # | Task | Detail | Duration | Done |
|---|------|--------|----------|------|
| B1.7 | Snowflake write helper | Build `snowflake_log.py` with functions: `log_attempt(...)`, `log_quest_event(...)`, `log_token_usage(...)`. Each wraps an INSERT statement. Use UUIDs for IDs. Make these fire-and-forget (don't block the API response on Snowflake writes — use `asyncio.create_task` or a background thread). | 15 min | ☐ |
| B1.8 | Verify Snowflake writes | Call each log function once with test data. Query the tables in the Snowflake web console to confirm rows appeared. | 5 min | ☐ |

**B1 exit criteria:** FastAPI returns valid contract JSON. EverOS stores and retrieves a test memory. All 4 Snowflake tables exist and accept inserts. Person A can point their frontend at `:8000` and get real responses.

---

## Hour 2 — Game Depth + Adaptation Logic (12:15–1:15 PM)

*Lunch is served at noon; grab a plate and keep building.*

### Person A — Quest 2, Quest 3, Adaptive UI

| # | Task | Detail | Duration | Done |
|---|------|--------|----------|------|
| A2.1 | Quest transition system | Build a quest-progression manager: Quest 1 complete → fade/slide transition → Quest 2 scene loads. Swap the isometric grid content (river → open field with shelter frame). Update the top bar quest name. Keep the block count persistent across quests. | 10 min | ☐ |
| A2.2 | Quest 2 scene — Shelter | Replace the grid content: show a half-built shelter (some blocks present, gaps visible). Correct answers fill in shelter sections with the block-build animation from A1.5. 2 questions to complete. | 10 min | ☐ |
| A2.3 | Format-driven question rendering | The `format` field from the API drives how the question looks. Build three render modes inside `<QuestionPanel>`: **"numeric"** — plain text equation "3 × 4 = ?" with 4 buttons (already built). **"groups"** — show N groups of M dots/blocks as colored circles arranged in clusters, e.g., three groups of four blue dots, with the question "How many blocks in total?" **"array"** — show an N×M rectangular grid of squares (like graph paper filled in), with the question "What is the area?" The backend decides which format; the frontend just renders what it's told. | 20 min | ☐ |
| A2.4 | Hint-level rendering | The `hint_level` field from the API drives additional scaffolding: **0** — no extra help. **1** — show a small hint text below the question (e.g., "Think about groups, not adding"). **2** — show a step-by-step worked example: "3 × 4 means 3 groups of 4. Group 1: 4. Group 2: 4+4=8. Group 3: 8+4=12." Animate each step appearing with a 500ms delay. | 10 min | ☐ |
| A2.5 | Two-mistake simplification | Track `consecutive_errors` from the API response. When it reaches 2, trigger UI simplification: reduce answer buttons from 4 to 2 (`num_options` field), enlarge button text, fade out decorative elements, show a calming message ("Let's slow down. You've got this."). This is the attention-friendly design moment. | 10 min | ☐ |
| A2.6 | Quest 3 — Boss fight | New scene: the Glitch Golem (a big pixelated blob with 3 health segments shown as colored bars). Each correct answer: one health segment shatters (CSS animation — scale down + opacity + particle-like scattered divs). After 3 correct: boss explodes, village background lights up (filter: brightness transition), "Village Restored!" text. | 15 min | ☐ |
| A2.7 | Memory note display | When the API response includes `memory_note` (non-null, Session 2 only), show it as a special speech bubble above the character: "Last time, building groups helped. Let's use that trick again." Style it distinctly (gold border, ✨ icon) so it's visually obvious this is retrieved memory. This is the "aha" moment — make it unmissable. | 10 min | ☐ |
| A2.8 | Token counter (live, small) | Add a small, unobtrusive counter in the top-right corner: "🔢 Tokens: 1,240". Increment it whenever an API call returns. In Session 2, this number should visibly grow slower, proving the cost reduction in real-time. Read the token count from a new optional field `tokens_used_this_call` added to the `/submit-answer` response. (Tell Person B about this field at the next sync.) | 5 min | ☐ |

**A2 exit criteria:** All three quests playable end-to-end. Format/hint/simplification rendering works driven by API fields. Boss fight animates. Memory note shows when present. Swap to real API endpoint if B is ready.

### Person B — Real Adaptation Logic + EverOS Integration

| # | Task | Detail | Duration | Done |
|---|------|--------|----------|------|
| B2.1 | Wire `/next-challenge` to real logic | Replace hardcoded responses. Flow: (1) Load learner's mastery scores from in-memory state. (2) Call `retrieve_learner_context(learner_id, "multiplication")` from EverOS. (3) If memory exists and mentions a successful style → set `format` to that style, set `memory_note` to a retrieval message. (4) If no memory → use rule-based selection: mastery < 0.4 → easy + groups format; 0.4–0.7 → medium + numeric; > 0.7 → hard + numeric. (5) Pick a question from the bank matching the difficulty + targeting the weakest fact. (6) Log the decision to `QUEST_EVENTS`. | 20 min | ☐ |
| B2.2 | Wire `/submit-answer` to real logic | On answer submission: (1) Check correctness. (2) Update mastery score for that fact. (3) Track consecutive errors per learner. (4) If `consecutive_errors >= 2`: set next question's `hint_level` to 2, `num_options` to 2. (5) Estimate token usage for this interaction (use a simple heuristic: ~150 tokens for a no-memory call, ~80 tokens for a memory-assisted call — you'll calibrate with real numbers if using an actual LLM). (6) Call `log_attempt()` and `log_token_usage()` to write to Snowflake. (7) If the answer is wrong, compose an `explanation` string based on the current `format`. | 20 min | ☐ |
| B2.3 | EverOS observation storage on wrong answers | After a wrong answer, write an observation to EverOS: content like "Alex answered 3×4 as 7. This is the additive misconception (3+4=7). Attempted style: numeric." After a *correct* answer that followed a wrong one, write: "Alex answered 3×4 correctly after seeing visual groups. Effective support: groups format." These are the memories that Session 2 retrieves. | 15 min | ☐ |
| B2.4 | EverOS observation storage on quest completion | When a quest completes, write a summary observation: "Alex completed Quest 1 (Bridge). Mastery: 3×table=0.4, 4×table=0.7. Preferred format: groups. Session length: 3 questions." This is the richer memory that the Cortex Agent or rule engine uses. | 10 min | ☐ |
| B2.5 | Session management | Add a `session_id` (UUID) generated on the first `/next-challenge` call per browser session. Track session start time. All Snowflake logs include this session_id so you can compare Session 1 vs Session 2 costs. | 5 min | ☐ |
| B2.6 | Token tracking accuracy | If using an actual LLM (e.g., calling Anthropic API or Snowflake Cortex `COMPLETE()`) for generating explanations or selecting strategies: capture the real token counts from the API response. If rule-based only: use the heuristic estimates (150 vs 80 tokens) but log `model_used = "rule_engine"` so the Snowflake dashboard can distinguish. Add `tokens_used_this_call` to the `/submit-answer` response so Person A's live counter works. | 10 min | ☐ |
| B2.7 | Build `/session-summary` endpoint | Query Snowflake: `SELECT SUM(total_tokens) FROM AI_TOKEN_USAGE WHERE learner_id=? AND session_id=?` for both sessions. Calculate `token_reduction_pct`. Query `ATTEMPTS` for question counts per session. Pull current mastery from in-memory state. Assemble the full summary JSON per the contract. | 15 min | ☐ |

**B2 exit criteria:** The three endpoints return real, adaptive, data-driven responses. EverOS has memories written on errors and corrections. Snowflake has rows in all 4 tables. `/session-summary` returns real aggregated numbers.

---

## Hour 2:45 — Integration Checkpoint #1 (1:45 PM, joint, 15 min)

| # | Task | Detail | Done |
|---|------|--------|------|
| IC1.1 | Point frontend at real backend | Change `fetch` base URL from mock to `localhost:8000`. | ☐ |
| IC1.2 | Full Session 1 run-through | Play Quest 1 → Quest 2 → Quest 3 as "alex". Deliberately answer 3×4 wrong as 7. Observe: does the game switch to groups format? Does EverOS store the observation? | ☐ |
| IC1.3 | Check Snowflake | Open Snowflake console. Run `SELECT * FROM ATTEMPTS ORDER BY timestamp DESC LIMIT 10`. Confirm rows exist. Run `SELECT * FROM AI_TOKEN_USAGE`. Confirm token counts are logged. | ☐ |
| IC1.4 | Check EverOS | Look at the `./everos_data/` markdown files. Confirm observations are human-readable and contain the misconception + working style. | ☐ |
| IC1.5 | Simulate Session 2 | Clear the frontend state (refresh browser). Call `/next-challenge` again as "alex". Confirm: (a) `memory_note` is non-null and references the previous session's strategy; (b) `format` is set to the style that worked before; (c) the memory bubble shows in the UI. | ☐ |
| IC1.6 | Fix contract mismatches | If any field names, types, or behaviors don't match, fix them NOW. List every mismatch, assign each to A or B, fix in parallel, re-test in 5 min. | ☐ |

**IC1 exit criteria:** The full Session 1 → Session 2 loop works end-to-end with real data. If it doesn't, this is the moment to simplify (e.g., drop Cortex Agent, hardcode the adaptation, reduce to 2 quests).

---

## Hour 3 — Polish, Reveal Card, Cortex Stretch (2:00–3:00 PM)

### Person A — Reveal Card + Demo Polish

| # | Task | Detail | Duration | Done |
|---|------|--------|----------|------|
| A3.1 | Reveal card UI | After Quest 3 boss is defeated, fetch `/session-summary/alex` and render a results card: big numbers with labels — "Mastery: 33% → 83%", "Questions needed: 6 → 4", "Token cost: −42%", "Strategy: visual block groups", "Memory source: EverOS". Use a clean card layout with the numbers animating up (count-up animation from 0 to final value over 1.5 sec). | 20 min | ☐ |
| A3.2 | Pricing CTA on reveal card | Below the metrics, show the `pricing_cta` string from the API: "Alex mastered 4 new multiplication facts in 8 minutes. Continue tomorrow — $12/month." Style as a subtle call-to-action button (not garish). | 5 min | ☐ |
| A3.3 | Low-stimulation toggle | Add a small toggle button (☀️/🌙) in the top bar. When active: disable all CSS animations, reduce color saturation (CSS `filter: saturate(0.5)`), hide decorative elements, increase font size slightly. This demonstrates the attention-friendly design claim. It doesn't need to be perfect — just visually distinct. | 10 min | ☐ |
| A3.4 | Visual polish pass | Go through each scene and fix the most jarring visual issues. Priority order: (1) block-build animation timing, (2) boss health bar appearance, (3) memory bubble styling, (4) color consistency. Don't chase perfection — stop after 10 minutes regardless. | 10 min | ☐ |
| A3.5 | Write demo script | Write the exact spoken script for the 3-minute demo. Structure: [0:00–0:20] Problem statement: "AI tutors forget everything between sessions — that costs money." [0:20–1:30] Session 1 live: play Quest 1, deliberately get 3×4 wrong, show adaptation, beat the boss. [1:30–1:45] "Watch what happens when we start a new session. The browser is refreshed. No local storage." [1:45–2:30] Session 2 live: new quest, memory bubble appears, faster completion, boss defeated. [2:30–2:50] Reveal card: show the numbers. [2:50–3:00] "42% fewer tokens because it remembered. $12/month. Questions?" | 10 min | ☐ |
| A3.6 | Start slide deck | Open Google Slides / PowerPoint. Create title slide + problem slide + architecture slide. Leave placeholders for Snowflake screenshots from Person B. (See slide outline in §7 of the earlier plan.) | 15 min | ☐ |

### Person B — Economics Dashboard + Cortex Agent + Seed Profile

| # | Task | Detail | Duration | Done |
|---|------|--------|----------|------|
| B3.1 | Snowflake analytics queries | Write and test the queries that power the final metrics. Save them as `.sql` files for the deck: | 15 min | ☐ |

```sql
-- Accuracy by multiplication fact
SELECT fact_a, fact_b,
       COUNT(*) as attempts,
       SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
       ROUND(correct / attempts * 100, 1) as accuracy_pct
FROM ATTEMPTS WHERE learner_id = 'alex'
GROUP BY fact_a, fact_b ORDER BY accuracy_pct ASC;

-- Token cost comparison: memory vs no-memory
SELECT memory_was_used,
       COUNT(*) as calls,
       SUM(total_tokens) as total_tokens,
       ROUND(AVG(total_tokens), 0) as avg_tokens_per_call
FROM AI_TOKEN_USAGE WHERE learner_id = 'alex'
GROUP BY memory_was_used;

-- Mastery gain per 1000 tokens
SELECT session_id,
       SUM(total_tokens) as session_tokens,
       -- mastery_delta would come from QUEST_EVENTS
       ROUND(mastery_delta / (session_tokens / 1000), 2) as mastery_per_1k_tokens
FROM ... ;

-- Which intervention worked
SELECT explanation_style, is_correct,
       COUNT(*) as occurrences
FROM ATTEMPTS WHERE learner_id = 'alex'
GROUP BY explanation_style, is_correct;
```

| # | Task | Detail | Duration | Done |
|---|------|--------|----------|------|
| B3.2 | Cortex Agent integration (STRETCH — skip if behind) | Call Snowflake Cortex `COMPLETE('mistral-large', prompt)` where the prompt includes: the learner's current mastery JSON, the EverOS-retrieved memory context, the available question bank, and the instruction: "Choose the next question and teaching format that maximizes predicted mastery gain within a 200-token budget." Parse the response to extract `question_id`, `format`, `hint_level`. If this works, set `model_used = "cortex_agent"` in token logging. If it fails or is too slow, fall back to the rule-based engine (already working from Hour 2) — set `model_used = "rule_engine"`. The live demo should work either way. | 20 min | ☐ |
| B3.3 | Seed the "Alex" demo profile | Run `seed_alex.py` to pre-populate: (1) EverOS memories for Session 1 — the misconception observation, the effective strategy observation, the quest completion summary. (2) Snowflake `ATTEMPTS` rows for 6 questions in Session 1 (3 correct, 3 wrong, specific facts). (3) Snowflake `AI_TOKEN_USAGE` rows showing ~2,840 total tokens for Session 1 (higher cost, no memory). (4) Snowflake `PLAYERS` row with Session 1 mastery snapshot. This ensures the live demo only needs to play Session 2 (the fast, cheap, memory-powered half) — never risk the slow diagnostic path on stage. | 15 min | ☐ |
| B3.4 | Verify seeded profile works | Call `/next-challenge` with `learner_id=alex`, `quest_id=3`. Confirm: `memory_note` is populated, `format` matches what worked in Session 1, difficulty is appropriate given mastery. Call `/session-summary/alex` and confirm all numbers are present and the token-reduction % is in the 35–50% range. | 5 min | ☐ |
| B3.5 | Screenshot Snowflake for deck | Take 2 screenshots in the Snowflake web console: (1) the token-cost comparison query result, (2) the accuracy-by-fact query result. Send to Person A for the slide deck. | 5 min | ☐ |

**Hour 3 exit criteria:** Reveal card renders real numbers. Seeded demo profile works reliably. Slide deck has 5+ slides. Demo script exists.

---

## Hour 3:30 — Integration Checkpoint #2 (3:30 PM, joint, 10 min)

| # | Task | Detail | Done |
|---|------|--------|------|
| IC2.1 | Full dry run with seeded profile | Person A drives the browser. Person B watches the backend logs + Snowflake. Play the entire demo script from start to finish, speaking out loud as if presenting. | ☐ |
| IC2.2 | Time it | Must be under 3 minutes. If over, cut words from the script, not features from the demo. | ☐ |
| IC2.3 | Identify the single biggest risk | What's the one thing most likely to break on stage? Wifi? Snowflake latency? EverOS retrieval? Decide on the fallback: (a) if backend is slow, preload the reveal card numbers as a hardcoded fallback behind a feature flag; (b) if wifi dies, play the backup video recording. | ☐ |
| IC2.4 | Final contract check | Any last field that needs adding? `tokens_used_this_call` in submit-answer? Anything else? Fix now, not later. | ☐ |

---

## Hour 4 — Ship It (3:40–4:00 PM)

| # | Task | Who | Duration | Done |
|---|------|-----|----------|------|
| 4.1 | Record backup video | Both — screen-record the full Session 2 demo with voiceover using the seeded profile. Save as MP4. This is your insurance policy against wifi failure. | 5 min | ☐ |
| 4.2 | Finalize slide deck | A — add Snowflake screenshots from B, finalize all slides, export as PDF as backup. | 5 min | ☐ |
| 4.3 | Bug bash | Both — each person tries to break the demo in 3 ways. Fix only demo-path-blocking bugs. Ignore edge cases that won't occur during the scripted demo. | 5 min | ☐ |
| 4.4 | Submit | Both — submit the slide deck + demo link/video per hackathon submission instructions before 4:00 PM hard deadline. | 2 min | ☐ |
| 4.5 | Final rehearsal | Both — run the demo one more time with the actual projector/screen if possible. Practice transitions between speakers if both are presenting. | 3 min | ☐ |

---

## Risk Mitigation Table

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Wifi dies during demo | Medium | Critical | Backup screen recording (task 4.1). Have slides on local PDF. |
| Snowflake queries slow on stage | Medium | High | Pre-run all queries during seeding; cache the `/session-summary` response locally as a JSON fallback. |
| EverOS retrieval returns nothing | Low | High | Seed profile verified at IC2. If live retrieval fails, hardcode `memory_note` for the demo profile. |
| Cortex Agent call fails | Medium | Low | Rule-based fallback is always active (B2.1). Demo works identically either way. |
| Isometric grid looks bad | Medium | Low | Fall back to flat top-down pixel grid (A1.3 alternate). Judges care about the adaptation story, not the graphics. |
| Run out of time on Quest 3 | Low | Medium | Cut Quest 2 entirely — go from Quest 1 (diagnostic) straight to Quest 3 (boss). The adaptation story only needs two scenes. |
| Integration checkpoint reveals major mismatch | Medium | High | That's why checkpoints exist at 2:45 and 3:30. If IC1 fails badly, drop to 2 quests and simplify the API to 2 fields: `question` and `correct`. |

---

## Tech Stack Summary

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend | Vite + React (or plain HTML/JS/Canvas) | Fast scaffolding, A's preference |
| Backend | Python + FastAPI + uvicorn | Matches EverOS Python SDK natively |
| Memory | EverOS (open-source, local-first) | Hackathon requirement; markdown + SQLite + LanceDB |
| Data warehouse | Snowflake (hackathon credits) | Token usage logging, analytics queries, Cortex Agent |
| AI decision | Rule-based engine (primary) + Cortex Agent (stretch) | Rule engine is the reliable path; Cortex is the sponsor-wow path |
| Question bank | Static JSON file (~30 multiplication facts) | No generation needed; validated offline |
| Deployment | Both run locally (localhost) | No deploy needed for hackathon demo; screen-share |

---

## EverOS Memory Examples (what gets stored)

After a wrong answer:
```markdown
# Observation: alex — 2026-08-09T11:32:00

- **Topic:** multiplication
- **Event:** Alex answered 3 × 4 as 7
- **Inference:** Likely treating multiplication as addition (3 + 4 = 7)
- **Context:** Quest 1 (Bridge), first attempt, numeric format
- **Response time:** 4200ms
```

After a correction:
```markdown
# Observation: alex — 2026-08-09T11:33:00

- **Topic:** multiplication
- **Event:** Alex answered 3 × 4 correctly as 12
- **Effective support:** Visual block groups (3 groups of 4)
- **Hint level:** 2 (worked example)
- **Context:** Quest 1 (Bridge), second attempt after error
- **Response time:** 6100ms (slower but correct)
```

Quest summary:
```markdown
# Session Summary: alex — 2026-08-09T11:35:00

- **Session:** 1
- **Quests completed:** Bridge, Shelter, Boss
- **Mastery snapshot:** 3×table=0.4, 4×table=0.7, 6×table=0.5
- **Preferred format:** visual block groups
- **Preferred instructions:** short, minimal text
- **Effective reward:** block-building animation
- **Session length:** 6 questions, ~4 minutes
- **Total tokens used:** 2840
```

---

## Snowflake Query for the "Aha" Reveal

This is the query Person B runs during seeding and that `/session-summary` wraps:

```sql
WITH session_costs AS (
    SELECT
        session_id,
        memory_was_used,
        COUNT(*) AS ai_calls,
        SUM(total_tokens) AS total_tokens
    FROM AI_TOKEN_USAGE
    WHERE learner_id = 'alex'
    GROUP BY session_id, memory_was_used
)
SELECT
    s1.total_tokens AS session1_tokens,
    s2.total_tokens AS session2_tokens,
    ROUND((1 - s2.total_tokens / s1.total_tokens) * 100, 0) AS token_reduction_pct
FROM session_costs s1, session_costs s2
WHERE s1.memory_was_used = FALSE
  AND s2.memory_was_used = TRUE;
```

---

## Demo Script (3 minutes, spoken word)

**[0:00–0:15] Hook**
"Every AI tutor forgets its students between sessions. That means every session starts with expensive re-diagnosis. We built BlockQuest to fix that."

**[0:15–0:30] Show the game**
"This is a voxel multiplication game for kids ages 8–12. Three quests, one adventure. Watch what happens when Alex plays."

**[0:30–1:20] Session 1 (live)**
Play Quest 1. Answer 3×4 as 7 deliberately. Show the game switching to visual block groups. Answer correctly. Note the token counter ticking up. Beat the boss.

**[1:20–1:35] The reset**
"Session over. I'm refreshing the browser. No cookies, no local storage. The only thing that persists is EverOS memory — stored as a markdown file — and the token log in Snowflake."

**[1:35–2:20] Session 2 (live, using seeded profile)**
New session. The game immediately shows: "Last time, building groups helped. Let's use that trick again." Answer correctly. Note the token counter is growing slower. Beat the boss faster.

**[2:20–2:50] Reveal card**
Show the reveal card with animated numbers: mastery 33%→83%, questions 6→4, tokens −42%. Point at the Snowflake query behind it. "Every number on this card is a live query against Snowflake. The cost reduction is real, logged, and auditable."

**[2:50–3:00] Close**
"Memory turns expensive re-diagnosis into cheap recall. $12/month per child. Every mistake builds your next adventure."

---

## Slide Deck Structure (8 slides)

| Slide | Content | Visual |
|-------|---------|--------|
| 1. Title | "BlockQuest: Every mistake builds your next adventure" / Track 1: Cost of Intelligence / Team names | Game screenshot |
| 2. Problem | "AI tutors forget. Re-diagnosis costs tokens. Same misconception, full price, every session." | Simple diagram: Session 1 → [diagnose → explain → check] = 2800 tokens. Session 2 → [diagnose → explain → check] = 2800 tokens. Total: 5600. |
| 3. Solution | "EverOS remembers the misconception AND the fix. Session 2 skips diagnosis." | Same diagram but Session 2 → [recall → apply] = 1650 tokens. Total: 4450. Savings: 42%. |
| 4. How it works | Architecture diagram (simplified): Frontend → Backend → EverOS (memory) + Snowflake (economics) | The system diagram |
| 5. Demo screenshots | Side-by-side: Session 1 (equation mode, wrong answer) vs Session 2 (groups mode, memory bubble) | Two game screenshots |
| 6. The numbers | Mastery: 33%→83%. Questions: 6→4. Tokens: −42%. Mastery per 1K tokens: +127%. | Big numbers, Snowflake query screenshot as proof |
| 7. Why it scales | More sessions = richer memory = cheaper per-fact mastery. $12/mo parent, $6/student school. EverOS Cases compound. | Cost curve declining over sessions (sketch) |
| 8. What we built vs what we cut | Built: 3 quests, EverOS memory, Snowflake logging, adaptive format/difficulty/hints. Cut: multiplayer, accounts, 3D, multiple subjects. "4 hours, 2 people." | Clean list |
