/**
 * Multiplication question bank.
 *
 * Each entry carries three deliberately-chosen distractors:
 *   - additive:  a + b        (the misconception we want to detect — "3x4 = 7")
 *   - offByOne:  product - a  (skipped a group)
 *   - random:    a plausible near-miss
 *
 * `difficulty_tier` drives selection: easy for the diagnostic quest, harder
 * once mastery climbs.
 */

const q = (a, b, tier, random) => ({
  fact_id: `${a}x${b}`,
  question_id: `q_${a}x${b}_01`,
  a,
  b,
  product: a * b,
  difficulty_tier: tier,
  distractors: {
    additive: a + b,
    offByOne: a * b - a,
    random,
  },
})

export const QUESTION_BANK = [
  // 3x table — the diagnostic core
  q(3, 4, 'easy', 15),
  q(3, 5, 'easy', 18),
  q(3, 6, 'easy', 21),
  q(3, 7, 'medium', 24),
  q(3, 8, 'medium', 27),

  // 4x table
  q(4, 5, 'easy', 24),
  q(4, 6, 'medium', 28),
  q(4, 7, 'medium', 32),
  q(4, 8, 'hard', 36),

  // 6x table
  q(6, 3, 'easy', 21),
  q(6, 4, 'medium', 28),
  q(6, 6, 'medium', 40),
  q(6, 7, 'hard', 48),

  // 7x table — the hardest, saved for the boss
  q(7, 6, 'hard', 49),
  q(7, 7, 'hard', 42),
  q(7, 8, 'hard', 63),
]

export const byFactId = (factId) => QUESTION_BANK.find((x) => x.fact_id === factId)

/**
 * Build the answer options for a question.
 * `count` is 4 normally, or 2 once the learner has struggled twice — in which
 * case we keep only the correct answer and the single most diagnostic
 * distractor (the additive one).
 */
export function buildOptions(question, count = 4) {
  const { product, distractors } = question

  if (count === 2) {
    return shuffleStable([product, distractors.additive], question.fact_id)
  }

  // Dedupe: some facts produce colliding distractors (e.g. 3x6 offByOne == 15).
  const opts = new Set([product])
  for (const candidate of [distractors.additive, distractors.offByOne, distractors.random]) {
    if (candidate > 0) opts.add(candidate)
  }
  // Top up if collisions left us short.
  let pad = product + 1
  while (opts.size < 4) {
    opts.add(pad)
    pad += 2
  }

  return shuffleStable([...opts].slice(0, 4), question.fact_id)
}

/**
 * Deterministic shuffle keyed on fact_id, so the same question always renders
 * its options in the same order. Stability matters on stage: re-running the
 * demo shouldn't reshuffle buttons under the presenter's finger.
 */
function shuffleStable(arr, seed) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0

  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0
    const j = h % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
