# BlockQuest — 3-Minute Demo Script

**Setup before you present**

1. `cd frontend && npm run dev`
2. Open **two browser tabs**:
   - Tab A: `http://localhost:3000/` (Session 1)
   - Tab B: `http://localhost:3000/?session=2` (Session 2)
3. Leave both on the intro screen. Zoom to ~110% if the projector is far away.

> Tab B is a *seeded* profile — the frontend equivalent of `seed_alex.py`. It is
> **not** restored from localStorage, so the "no local storage" claim below is
> literally true.

---

## [0:00 – 0:15] Hook

> "Every AI tutor forgets its students between sessions. That means every session
> starts with expensive re-diagnosis — you pay full price to rediscover the same
> misconception. We built BlockQuest to fix that."

## [0:15 – 0:30] Show the game

*(Tab A, intro screen)*

> "A voxel multiplication game for kids 8 to 12. Three quests, one adventure.
> Watch what happens when Alex plays for the first time."

Click **Start Quest 1**.

## [0:30 – 1:20] Session 1 — the expensive path

The question shows as a plain equation: **3 × 4 = ?**

> "It starts with no idea who Alex is, so it asks the plainest possible question."

**Click `7`** — deliberately. *(That's 3 + 4.)*

> "Alex adds instead of multiplying. That's the classic additive misconception.
> Watch the bottom bar — it doesn't just say 'wrong'."

Point at the narrative bar: *"Careful — that's 3 + 4. Multiplying means 3 groups of 4, which is 12."*

Click **Try another →**.

> "And now the game has changed shape. Same maths, different representation —
> visual groups instead of an equation."

**Get one more wrong**, then continue.

> "Two mistakes in a row, and the interface calms down: four choices become two,
> the text gets bigger, and it walks through a worked example step by step.
> That's the attention-friendly design, driven entirely by the backend."

Answer correctly. Blocks drop into the river.

> "Correct answers build the bridge. Notice we never *remove* blocks for a wrong
> answer — mistakes cost time, never progress."

Point at the token counter climbing (355 per call).

## [1:20 – 1:35] The reset

> "Session over. Now I'm opening a brand-new session. No cookies, no local
> storage, no browser state. The only thing that persists is the EverOS memory —
> stored as a plain markdown file — and the token log in Snowflake."

**Switch to Tab B.** Click **Start Quest 1**.

## [1:35 – 2:20] Session 2 — the cheap path

The gold memory bubble appears immediately.

> "There it is. 'Last time, building groups helped you. Let's use that trick
> again.' It didn't re-diagnose anything — it *recalled*."

Point out three things fast:
- The question is **already** in groups format — no rediscovery needed.
- The quest is **shorter** (0/2 instead of 0/3) — mastery is already partly built.
- The token counter reads **275 per call**, not 355.

Play through Quests 1 → 2 → 3. Beat the golem.

> "Same game, same child, far less work — because it remembered."

## [2:20 – 2:50] The reveal

The card animates up.

> "Mastery, thirty to seventy-nine percent. Questions needed, eight down to six.
> Token cost, two thousand eight hundred and forty down to sixteen fifty. That's
> a **forty-two percent** reduction in the cost of teaching the same child the
> same material."

*(If the backend is wired: point at the Snowflake line — every figure is a live
query. If you're on the mock, the card says "Demo mode" and you should say so.)*

## [2:50 – 3:00] Close

> "Memory turns expensive re-diagnosis into cheap recall. Twelve dollars a month
> per child. Every mistake builds your next adventure. Questions?"

---

## Contingencies

| If… | Do this |
|---|---|
| You fumble an answer in Session 1 | Doesn't matter — wrong answers *are* the demo. Keep going. |
| A quest is running long | Skip Quest 2. Go Quest 1 → Quest 3. The story only needs two scenes. |
| Animations distract / projector is harsh | Hit the ☀️/🌙 toggle. It also *is* a feature — call it out. |
| Backend is down | Nothing happens. The frontend runs the whole demo on its own mock. |
| Everything breaks | Play the backup recording. |

## Numbers to have in your head

- Session 1: **8 questions × 355 tokens = 2,840**
- Session 2: **6 questions × 275 tokens = 1,650**
- Reduction: **42%**
- Mastery: **30% → 79%** (measured on the facts practiced this session)

Run `npm run verify` to confirm these still hold before you present.
