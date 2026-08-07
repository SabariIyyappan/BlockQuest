# BlockQuest — 3-Minute Demo Script

**Setup before you present**

1. `cd frontend && npm run dev`
2. Open **two browser tabs**:
   - Tab A: `http://localhost:3000/` (Session 1)
   - Tab B: `http://localhost:3000/?session=2` (Session 2)
3. Leave both on the title screen. Click once anywhere in each tab ahead of
   time (even just the intro card) — browsers block audio until a click, and
   you want Pip's chime live from the first line, not the second.
4. Zoom to ~110% if the projector is far away. The world is full-bleed canvas,
   so it scales cleanly.

> Tab B is a *seeded* profile — the frontend equivalent of `seed_alex.py`. It
> is **not** restored from localStorage, so the "no local storage" claim below
> is literally true.

---

## [0:00 – 0:15] Hook

> "Every AI tutor forgets its students between sessions. That means every
> session starts with expensive re-diagnosis — you pay full price to
> rediscover the same misconception. We built BlockQuest to fix that."

## [0:15 – 0:30] Show the world

*(Tab A, title card over the bridge scene — let it breathe a second before
you talk over it)*

> "A voxel adventure for kids 8 to 12. Three quests, one storm-broken village,
> and a companion — Pip — who's about to meet Alex for the first time."

Click **Begin**.

## [0:30 – 1:20] Session 1 — the expensive path

Pip introduces themself, then the question card rises: **3 × 4 = ?**

> "Pip doesn't know Alex yet, so it starts with the plainest possible
> question."

**Click `7`** — deliberately. *(That's 3 + 4.)*

> "Alex adds instead of multiplying — the classic additive misconception.
> Watch what Pip says, not just whether the button turns red."

Point at Pip's dialogue box: the misconception explanation comes out of the
character, not a system message. No blocks fell out of the bridge.

Click **Try another →**.

> "And the question changed shape. Same math, different representation —
> visual groups instead of a bare equation."

**Get one more wrong**, then continue.

> "Two mistakes in a row, and the interface calms down: four choices become
> two, the text gets bigger, Pip walks through a worked example step by step.
> All of that is driven by the backend, not hardcoded here."

Answer correctly. Blocks arc out of the hero's hands and thunk into the
bridge.

> "Correct answers build the bridge. We never *remove* a block for a wrong
> answer — mistakes cost time, never progress."

Point at the token counter, top right, climbing (355 per call).

## [1:20 – 1:35] The reset

> "Session over. Now I'm opening a brand-new session — no cookies, no local
> storage, no browser state. The only thing that persists is the EverOS
> memory, stored as a plain markdown file, and the token log in Snowflake."

**Switch to Tab B.** Click **Pick up where we left off**.

## [1:35 – 2:20] Session 2 — the cheap path

Pip's line lands immediately, and the dialogue box turns violet:

> "'You're back! Last time, building groups helped you. Let's use that trick
> again.' Pip didn't re-diagnose anything — it *recognized* Alex, out loud,
> as a character. That line is the backend's memory note; the only thing we
> added is a face to say it."

Point out three things fast:

- The question is **already** in groups format — no rediscovery needed.
- The quest rail shows **fewer pips to fill** — mastery is already partly built.
- The token counter reads **275 per call**, not 355, and the badge next to it
  says **MEMORY**.

Play through Quests 1 → 2 → 3. Watch the world go with you: the shelter scene
darkens toward night as the walls go up, and the Glitch Golem fight opens in
storm light with taunts on its own health bar. Land the final hit.

> "Same child, same game, far less work — because Pip remembered."

## [2:20 – 2:50] The reveal

The card animates up over the restored village.

> "Mastery, thirty to seventy-nine percent. Questions needed, eight down to
> six. Token cost, two thousand eight hundred forty down to sixteen fifty.
> That's a **forty-two percent** reduction in the cost of teaching the same
> child the same material."

*(If the backend is wired: point at the Snowflake line — every figure is a
live query. If you're on the mock, the card says "Demo mode" and you should
say so.)*

## [2:50 – 3:00] Close

> "Memory turns expensive re-diagnosis into cheap recall. Twelve dollars a
> month per child. Every mistake builds your next adventure. Questions?"

---

## Contingencies

| If… | Do this |
|---|---|
| You fumble an answer in Session 1 | Doesn't matter — wrong answers *are* the demo. Keep going. |
| A quest is running long | Skip Quest 2. Go Quest 1 → Quest 3. The story only needs two scenes. |
| Animations distract / projector is harsh | Hit the ☀️/🌙 toggle top right. It also *is* a feature — call it out. |
| Room is loud / you want it quiet | Hit the 🔊 toggle to mute. Sound is a bonus, not load-bearing. |
| Backend is down | Nothing happens differently — the frontend runs the whole demo on its own mock. |
| Everything breaks | Play the backup recording. |

## What changed from the old script

The layout is now full-bleed: the world fills the screen, the question card
and Pip's dialogue float over the bottom third. Click targets that matter are
unchanged (**answer buttons**, **Try another →**, **Continue →**), but two
labels moved:

- "Start Quest 1" on the title card is now **Begin** (session 1) or **Pick up
  where we left off** (session 2).
- The narrative bar and memory bubble are gone — everything they said, Pip
  now says, in the dialogue box above the question card.

## Numbers to have in your head

- Session 1: **8 questions × 355 tokens = 2,840**
- Session 2: **6 questions × 275 tokens = 1,650**
- Reduction: **42%**
- Mastery: **30% → 79%** (measured on the facts practiced this session)

Run `npm run verify` to confirm these still hold before you present.
