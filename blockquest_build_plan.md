# BlockQuest — 4-Hour Build Plan
**Event:** Snowflake x Beta Fund x EverMind Agent & Token Economy Hackathon
**Track:** Track 1 — Cost of Intelligence (primary framing); willingness-to-pay ($12/mo, $6/student) as secondary closer
**Team size:** 2
**Mandatory:** EverOS (open-source) as the memory/personalization layer. Snowflake as the token-economy ledger + Cortex Agent for the adaptive decision.

---

## 1. One-sentence pitch

BlockQuest is a voxel multiplication tutor where EverOS remembers each learner's misconceptions and what fixed them, so the second time a concept comes up the agent skips expensive re-diagnosis — a measurable, Snowflake-logged drop in tokens-per-mastered-fact.

## 2. The "aha" moment the whole build exists to produce

- **Session 1 (live, ~90 sec):** Player answers 3×4 as 7. Backend runs a short diagnose→explain→check loop (multiple LLM calls). EverOS stores: misconception, the explanation style that worked, resulting mastery.
- **Reset the browser tab** (prove it's not local session state).
- **Session 2 (live, ~60 sec):** New multiplication fact, same learner. Backend retrieves the EverOS memory *before* calling the LLM, skips diagnosis, goes straight to "last time, grouping blocks helped — let's use that again."
- **Reveal card:** mastery 33%→83%, questions 6→4, tokens per mastered fact −42%, pulled live from Snowflake.

Everything below exists to make this 3-minute sequence bulletproof, not to build a full game.

---

## 3. System architecture

```
┌─────────────────────┐        REST/JSON         ┌──────────────────────────┐
│   FRONTEND (Person A)│ ───────────────────────▶ │  BACKEND (Person B)      │
│  Voxel quest UI       │ ◀─────────────────────── │  "Challenge Orchestrator"│
│  (web app, isometric  │      contract below      │  single FastAPI service  │
│  grid, answer buttons,│                          └───────────┬──────────────┘
│  block-build anims,   │                                      │
│  boss fight, reveal   │                     ┌────────────────┼────────────────┐
│  card, low-stim mode) │                     ▼                                 ▼
└─────────────────────┘          ┌──────────────────────┐        ┌──────────────────────────┐
                                  │ EverOS (open-source)  │        │ Snowflake                │
                                  │ - per-learner memory  │        │ - PLAYERS                │
                                  │   (markdown, local)   │        │ - ATTEMPTS               │
                                  │ - stores: misconcep-  │        │ - QUEST_EVENTS           │
                                  │   tion, working style, │        │ - AI_TOKEN_USAGE         │
                                  │   mastery per fact     │        │ - Cortex Agent: picks    │
                                  │ - retrieved BEFORE     │        │   difficulty/format/hint │
                                  │   each LLM call        │        │   given memory + budget  │
                                  └──────────────────────┘        └──────────────────────────┘
```

**The one contract that must be locked before anyone splits up (do this jointly, ~15 min, during opening remarks):**

`POST /next-challenge`
Request: `{ learner_id, quest_id, last_answer_correct, last_response_ms }`
Response: `{ question_text, format: "numeric"|"groups"|"array", options: [4 numbers], difficulty: "easy"|"medium"|"hard", hint_level: 0|1|2, boss_trigger: bool }`

`POST /submit-answer`
Request: `{ learner_id, quest_id, question_id, chosen_answer }`
Response: `{ correct: bool, blocks_awarded: int, explanation_style_used: string }`

`GET /session-summary/{learner_id}`
Response: `{ mastery_before, mastery_after, questions_session1, questions_session2, tokens_session1, tokens_session2, token_reduction_pct, strategy_retrieved }`

This is the **only** surface the two of you share. Everything on either side of it can be built, tested, and demoed independently with mocked data until integration.

---

## 4. Why the split is clean (no merge conflicts)

- Person A never touches EverOS, Snowflake, or the orchestrator's internals — only calls the 3 endpoints above.
- Person B never touches frontend code — only returns JSON matching the contract.
- Both work in separate folders (`/frontend`, `/backend`) with the contract as a single shared markdown file (`/contracts/api.md`) neither edits after hour 1 without a 2-minute sync.
- Person A can build the entire game against **hand-written mock JSON** matching the contract before Person B's service exists at all — so there's no idle time waiting on integration.

---

## 5. Teammate split

### Person A — Game & Demo (frontend, narrative, deck)
Owns: `/frontend`, the slide deck, the live demo script.

- Build the 2.5D isometric quest UI: bridge (Quest 1), shelter (Quest 2), Glitch Golem (Quest 3).
- Build the answer-buttons + block-build animation (block-by-block placement, not full voxel physics).
- Build branching UI logic driven purely by the response fields (`format`, `difficulty`, `hint_level`) — e.g. `format: "groups"` renders an animated array of dot-groups instead of a bare equation.
- Build the boss fight (3 health segments = 3 correct answers) and the low-stimulation toggle (removes animations/sound, per attention-friendly design principles).
- Build the reveal card UI bound to `/session-summary`.
- Own the 3-minute demo script and rehearsal.
- Own the slide deck (see §7), pulling real numbers from Person B once available.

### Person B — Memory, Data, Economics (backend, EverOS, Snowflake)
Owns: `/backend`, EverOS integration, Snowflake schema, Cortex Agent call.

- Stand up the FastAPI orchestrator implementing the 3 contract endpoints, initially returning realistic mock/rule-based data.
- Wire EverOS (open-source, local-first): one markdown memory file per learner, written after each attempt with observation / inferred misconception / effective support style / mastery-per-fact. Retrieve relevant memory scoped to `learner_id` + current fact *before* constructing any LLM prompt.
- Design and create the 4 Snowflake tables: `PLAYERS`, `ATTEMPTS`, `QUEST_EVENTS`, `AI_TOKEN_USAGE`. Log every attempt and every LLM call's estimated token count.
- Implement the decision step: start with a simple rule (mastery + preference → difficulty/format/hint), then upgrade to a Snowflake Cortex Agent call if time allows in Hour 3 — keep the rule-based version as a live fallback so a Cortex outage never breaks the demo.
- Compute and expose the token-reduction metric (`tokens_session1` vs `tokens_session2`) from `AI_TOKEN_USAGE`.
- Pre-seed a reliable demo profile ("Alex") with Session 1 already completed and stored in EverOS + Snowflake, so the live demo only has to perform the fast, reliable Session 2 half live (never re-run the slow diagnostic path on stage).

---

## 6. Hour-by-hour schedule

**Hour 0 (during opening remarks, ~15 min, joint):**
Lock the API contract above. Agree on tech stack (Python/FastAPI backend to match EverOS's native Python SDK; plain JS or lightweight React frontend). Create the two folders + `/contracts/api.md`. Grab EverOS quickstart + Snowflake credits from sponsor tables now.

**Hour 1:**
- A: Build Quest 1 (bridge) UI end-to-end against hand-mocked JSON matching the contract. Get the diagnostic 3-question flow (3×, 4×, 6× tables) fully clickable.
- B: Get EverOS running locally, write/read one test memory file. Create the 4 Snowflake tables. Stand up the FastAPI skeleton returning mock responses matching the contract (unblocks A immediately if A wants to swap early).

**Hour 2:**
- A: Build Quest 2 (adaptive shelter) and Quest 3 (boss fight) UI, including the "two mistakes → simplified mode" branch and low-stimulation toggle. Wire real fetch calls to Person B's endpoints (still fine if B's logic is still rule-based mock — contract is what matters).
- B: Implement real EverOS write/read tied to actual attempts. Implement the rule-based decision logic. Start logging attempts + estimated token counts into Snowflake tables. Begin Cortex Agent call as a stretch item.

**Hour 2:45 — Integration checkpoint (joint, 15 min):**
Run the full Session 1 → reset → Session 2 flow together once, end to end. Fix contract mismatches now, not at Hour 4.

**Hour 3:**
- A: Build the reveal card bound to `/session-summary`. Polish block-build animation and boss defeat sequence. Start the demo script.
- B: Finish `AI_TOKEN_USAGE` aggregation and the token-reduction % calculation. Finish Cortex Agent integration if feasible; otherwise finalize the rule-based fallback as the shipped version. Seed the seeded "Alex" profile with a completed Session 1 so the stage demo is reliable.

**Hour 3:30 — second integration checkpoint (joint, 10 min):**
Full dry run with the seeded profile. Time it — must fit 3 minutes.

**Hour 4:**
- Joint: bug bash, rehearse the demo twice, record a backup screen-capture video in case live/wifi fails.
- A: Finalize slide deck.
- B: Pull 1–2 real Snowflake screenshots (query result or simple chart) into the deck as backup evidence of the cost curve in case the live counter doesn't render well on the projector.
- Submit before 4:00 PM hard deadline.

---

## 7. Slide deck outline (Person A leads, ~6–8 slides)

1. **Title** — BlockQuest + one-line pitch + Track 1 framing.
2. **The problem** — agents that don't remember re-pay the same diagnostic cost every session; that's the real cost center in AI tutoring, not inference itself.
3. **The mechanism** — EverOS as the memory layer: what gets stored (misconception, working style, mastery), when it's retrieved (before the LLM call, not after).
4. **The demo walkthrough** — Session 1 vs Session 2 side-by-side, screenshot each.
5. **The number** — token-reduction %, mastery gain, questions-to-mastery, sourced from the Snowflake `AI_TOKEN_USAGE` table.
6. **System architecture** — the diagram from §3, simplified.
7. **Why this scales** — $12/mo parent, $6/student school; cost curve improves further as EverOS accumulates more Cases per learner (Track 2 closer, kept brief).
8. **What we cut for the 4-hour build** — multiplayer, accounts, full 3D, multiple subjects (signals scoping discipline to judges).

---

## 8. Explicit scope cuts (say these out loud in the demo)

Multiplayer, user accounts/auth, full 3D/procedural terrain, crafting, more than one boss, teacher dashboard, parent auth, voice input. One world, three quests, one seeded profile, one live adaptive moment.
