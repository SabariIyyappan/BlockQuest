/** Quest structure — frontend game config, independent of which backend is live. */

/**
 * Questions needed per quest, per session.
 *
 * Session 2 is deliberately shorter: the learner arrives with mastery already
 * built, so fewer questions are needed to clear each quest. That shortening is
 * half the cost story (the other half is that each remembered call is cheaper).
 *
 *   Session 1: 3 + 2 + 3 = 8 questions
 *   Session 2: 2 + 2 + 2 = 6 questions
 */
export const QUEST_LENGTH_BY_SESSION = {
  1: { 1: 3, 2: 2, 3: 3 },
  2: { 1: 2, 2: 2, 3: 2 },
}

export const questLengths = (sessionNumber) =>
  QUEST_LENGTH_BY_SESSION[sessionNumber] ?? QUEST_LENGTH_BY_SESSION[1]

export const totalQuestions = (sessionNumber) =>
  Object.values(questLengths(sessionNumber)).reduce((a, b) => a + b, 0)

export const QUEST_NAMES = {
  1: 'The Broken Bridge',
  2: 'Shelter Before Nightfall',
  3: 'The Glitch Golem',
}

export const QUEST_INTRO = {
  1: 'The bridge is out. Answer correctly to earn blocks and rebuild it.',
  2: 'Night is coming. Build the shelter before dark.',
  3: 'The Glitch Golem blocks the village. Break its shields!',
}

export const TOTAL_QUESTS = 3
