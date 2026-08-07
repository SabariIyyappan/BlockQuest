# BlockQuest — Frontend

Voxel multiplication game for the EverMind × Snowflake hackathon (Track 1: Cost
of Intelligence). Vite + React, no runtime dependencies beyond React itself.

```bash
npm install
npm run dev       # http://localhost:3000
npm run verify    # headless check of the adaptive logic + token economics
npm run build
```

## Runs standalone

The backend is a separate workstream, so this app ships with a **full fake
backend in the browser** (`src/api/mockApi.js`). It is not static fixtures — it
simulates the real adaptation:

- mastery per fact (EMA), consecutive-error tracking
- a wrong answer on `numeric` switches the next question to `groups`
- two errors in a row → worked example + options cut from 4 to 2
- Session 2 opens with a memory note and starts in the style that worked
- token accounting: 355/call without memory, 275/call with it

`npm run verify` asserts all of the above, including that the headline figure is
exactly 42%. Run it before demoing.

## Switching to the real backend

One flag, in [`src/api/client.js`](src/api/client.js):

```js
export const USE_MOCK = false
export const BASE_URL = 'http://localhost:8000'
```

No component imports `mockApi` directly — everything goes through `client.js`,
so that's the only change needed. The client already speaks the exact contract
in `/contracts/api.md` (`/next-challenge`, `/submit-answer`,
`/session-summary/{id}`).

Two fields the frontend needs that aren't in the original contract:

| Field | Endpoint | Why |
|---|---|---|
| `tokens_used_this_call` | `/submit-answer` | drives the live token counter |
| `hint_text` | `/next-challenge` | hint string, or an array of steps for `hint_level: 2` |

## Sessions

Session is chosen by URL, never by storage:

- `/` → Session 1 (cold start, must discover the strategy)
- `/?session=2` → Session 2 (seeded profile, memory-powered)

Session 2 is deliberately **not** persisted to `localStorage` — the demo script
claims "no cookies, no local storage" and that claim needs to stay true. The
seeded profile is baked into the mock, mirroring the backend's `seed_alex.py`.

## Layout

```
src/
  api/          client.js (the swap point) · mockApi.js · questionBank.js
  state/        gameReducer.js · GameContext.jsx
  components/   iso.js (2:1 projection) · IsoGrid · Tile · Block · Character
                QuestionPanel/ (numeric | groups | array + HintPanel)
                TopBar · TokenCounter · NarrativeBar · MemoryBubble
                BossScene · RevealCard · Overlays
  styles/       tokens.css (incl. low-stim overrides) · animations.css
constants.js    quest lengths per session, names, intros
```

**Isometric rendering** uses plain 2:1 math (`left:(x-y)*32, top:(x+y)*16`) with
absolutely positioned diamonds, not a CSS 3D transform — children stay upright
and legible, and stacking blocks is a subtraction on `top`. All art is CSS; no
image assets.

**Low-stimulation mode** (☀️/🌙 in the top bar) zeroes the motion tokens,
desaturates, hides decorative elements and bumps the base font size.
`prefers-reduced-motion` is honoured independently.

See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the 3-minute run of show.
