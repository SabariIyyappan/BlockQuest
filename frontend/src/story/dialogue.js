/**
 * Pip's lines.
 *
 * Pip is the tutor with a face. Everything the adaptive engine does — noticing
 * a misconception, switching to a visual representation, remembering you next
 * time — reaches the player as Pip saying something, never as a system message.
 *
 * The session-2 recall line is the exception that proves the rule: its text
 * comes from the API's `memory_note` field, unchanged. Pip only delivers it.
 * That keeps the demo's claim honest — the memory is the backend's, not ours.
 */

/** Pick deterministically so a replayed demo says the same thing. */
function pick(lines, seed = 0) {
  return lines[Math.abs(seed) % lines.length]
}

const QUEST_INTRO = {
  1: [
    "The bridge is out — the storm took it. Answer right and I'll turn the answers into planks.",
    'No bridge, no village. But every answer you get right becomes a block. Ready?',
  ],
  2: [
    "The sun's going down and there's nothing between us and the dark. Let's build walls, fast.",
    "We need shelter before nightfall. Each right answer is another wall up.",
  ],
  3: [
    'That thing broke the bridge. The Glitch Golem — every shield is a problem it stole.',
    "There it is. Break its shields, and the village gets its light back.",
  ],
}

const CORRECT = [
  'Yes! Straight into the wall.',
  'Perfect. Another block.',
  "That's it — you've got the pattern.",
  'Clean. Keep going.',
  'Nice. The build is holding.',
]

const CORRECT_AFTER_STRUGGLE = [
  'There it is. That was the one that was tripping you.',
  'See? Groups, not adding. You have it now.',
  "That's the trick working. Remember this feeling.",
]

const WRONG_FOLLOWUP = [
  "No blocks lost — mistakes never take anything away here. Look again.",
  "Nothing falls down. Take another run at it.",
  "Still standing. Let's try that a different way.",
]

const QUEST_COMPLETE = {
  1: "The bridge holds! Come on — the village is just over the water.",
  2: 'Walls up, roof on, fire lit. Let the dark come.',
  3: "It's done. Look — the light's coming back.",
}

const BOSS_TAUNT = [
  'It stole that fact from someone. Take it back.',
  'One shield down. It flickers when it is scared.',
  'It is running out of shields. Finish it.',
  "Don't look at the eye. Look at the numbers.",
]

const BOSS_DEFEAT = "It's gone. Every fact it was hoarding just went back where it belongs."

const REVEAL = {
  1: "That's the whole village rebuilt. I'll remember how you did it.",
  2: "Told you I'd remember. That's why tonight was faster.",
}

/* -------------------------------------------------------------------- API */

/**
 * Build the line Pip should say for a game event.
 *
 * Returns `{ text, mood, sound }` or null when Pip has nothing to add.
 * `mood` feeds the in-world sprite; `sound` names a cue in audio/sfx.
 */
export function pipLine(event, ctx = {}) {
  const { questId = 1, sessionNumber = 1, consecutiveErrors = 0, seed = 0, text } = ctx

  switch (event) {
    case 'greet':
      return sessionNumber === 2
        ? {
            text: "You're back! Give me a second — I remember how last time went.",
            mood: 'remember',
            sound: 'remember',
          }
        : {
            text: "Hello! I'm Pip. I carry the light, you carry the answers. Deal?",
            mood: 'happy',
            sound: 'pip',
          }

    case 'questIntro':
      return { text: pick(QUEST_INTRO[questId] ?? QUEST_INTRO[1], seed), mood: 'idle', sound: 'pip' }

    /**
     * The memory beat. `text` is the API's memory_note, passed through verbatim.
     */
    case 'memory':
      return text ? { text, mood: 'remember', sound: 'remember' } : null

    case 'correct':
      return {
        text:
          consecutiveErrors > 0
            ? pick(CORRECT_AFTER_STRUGGLE, seed)
            : pick(CORRECT, seed),
        mood: 'happy',
        sound: 'correct',
      }

    /**
     * On a wrong answer Pip delivers the engine's own explanation — the one
     * that names the misconception — then adds the reassurance.
     */
    case 'wrong':
      return { text: text ?? pick(WRONG_FOLLOWUP, seed), mood: 'worried', sound: 'wrong' }

    case 'wrongFollowup':
      return { text: pick(WRONG_FOLLOWUP, seed), mood: 'thinking', sound: null }

    case 'questComplete':
      return { text: QUEST_COMPLETE[questId] ?? QUEST_COMPLETE[1], mood: 'happy', sound: 'fanfare' }

    case 'bossTaunt':
      return { text: pick(BOSS_TAUNT, seed), mood: 'thinking', sound: null }

    case 'bossDefeat':
      return { text: BOSS_DEFEAT, mood: 'happy', sound: null }

    case 'reveal':
      return { text: REVEAL[sessionNumber] ?? REVEAL[1], mood: 'remember', sound: 'reveal' }

    default:
      return null
  }
}

/** The Glitch Golem's own lines, shown on its health bar during Quest 3. */
export const GOLEM_LINES = [
  'THREE TIMES FOUR IS SEVEN. I REMEMBER IT WRONG. SO WILL YOU.',
  'ONE SHIELD IS NOTHING. I HAVE TAKEN MORE THAN THAT.',
  'YOU COUNT. I CORRUPT. WE ARE NOT THE SAME.',
  'NO. NOT THAT ONE. NOT THAT ONE—',
]

export function golemLine(shieldsBroken) {
  return GOLEM_LINES[Math.min(shieldsBroken, GOLEM_LINES.length - 1)]
}

export const PIP_NAME = 'Pip'
