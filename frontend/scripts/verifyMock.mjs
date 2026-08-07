/**
 * Headless check of the fake backend's adaptive behaviour.
 * Run: node scripts/verifyMock.mjs
 *
 * Verifies the exact claims the demo makes on stage, so a regression here is
 * caught before it's caught by an audience.
 */

import { initSession, nextChallenge, submitAnswer, sessionSummary } from '../src/api/mockApi.js'
import { questLengths } from '../src/constants.js'

let failures = 0

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`)
  if (!ok) failures++
}

function checkThat(label, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : `  ${detail}`}`)
  if (!cond) failures++
}

// ---------------------------------------------------------------------------
console.log('\n--- Session 1: cold start, must discover the strategy ---')
initSession(1)

const q1 = nextChallenge({ quest_id: 1 })
check('opens in numeric format (no memory)', q1.format, 'numeric')
check('no memory note in session 1', q1.memory_note, null)
check('starts with 4 options', q1.num_options, 4)
check('no hint at first', q1.hint_level, 0)
checkThat('options contain the correct answer', q1.options.includes(q1.correct_answer))
checkThat(
  'options contain the additive distractor (the misconception)',
  q1.options.includes(q1.a + q1.b),
  `a+b=${q1.a + q1.b}, options=${q1.options}`,
)

// Answer with the additive misconception, exactly as the demo script does.
const r1 = submitAnswer({ quest_id: 1, chosen_answer: q1.a + q1.b })
check('additive answer graded wrong', r1.correct, false)
check('no blocks removed on a wrong answer', r1.blocks_awarded, 0)
check('consecutive errors now 1', r1.consecutive_errors, 1)
checkThat(
  'explanation names the additive misconception',
  /\+/.test(r1.explanation) && r1.explanation.includes('groups'),
  r1.explanation,
)

const q2 = nextChallenge({ quest_id: 1 })
check('switches to visual groups after the error', q2.format, 'groups')
check('offers a nudge hint at 1 error', q2.hint_level, 1)

// Second error in a row -> full scaffolding.
const r2 = submitAnswer({ quest_id: 1, chosen_answer: q2.a + q2.b })
check('consecutive errors now 2', r2.consecutive_errors, 2)

const q3 = nextChallenge({ quest_id: 1 })
check('two mistakes -> worked example', q3.hint_level, 2)
check('two mistakes -> options cut to 2', q3.num_options, 2)
check('two mistakes -> exactly 2 buttons rendered', q3.options.length, 2)
checkThat('worked example is a step list', Array.isArray(q3.hint_text), typeof q3.hint_text)

// Recover.
const r3 = submitAnswer({ quest_id: 1, chosen_answer: q3.correct_answer })
check('correct answer resets the error streak', r3.consecutive_errors, 0)
checkThat('correct answer awards blocks', r3.blocks_awarded > 0, `${r3.blocks_awarded}`)

const s1 = sessionSummary()
checkThat('session 1 spent tokens', s1.tokens_session2 > 0, `${s1.tokens_session2}`)

// ---------------------------------------------------------------------------
console.log('\n--- Session 2: memory-powered ---')
initSession(2)

const m1 = nextChallenge({ quest_id: 1 })
checkThat('memory note present on first question', Boolean(m1.memory_note), `${m1.memory_note}`)
check('starts directly in the style that worked', m1.format, 'groups')
checkThat('no re-diagnosis: starts with 0 hints', m1.hint_level === 0)

const m2 = nextChallenge({ quest_id: 1 })
check('memory note fires only once', m2.memory_note, null)

// ---------------------------------------------------------------------------
console.log('\n--- Token economics (the pitch) ---')
initSession(1)
const cold = submitAnswer.call(null, { quest_id: 1, chosen_answer: (nextChallenge({ quest_id: 1 }), 0) })
const coldTokens = cold.tokens_used_this_call

initSession(2)
nextChallenge({ quest_id: 1 })
const warm = submitAnswer({ quest_id: 1, chosen_answer: 0 })
const warmTokens = warm.tokens_used_this_call

checkThat(
  'memory-assisted calls cost fewer tokens',
  warmTokens < coldTokens,
  `warm=${warmTokens} cold=${coldTokens}`,
)

// Full session 2 playthrough to confirm the headline reduction lands in range.
initSession(2)
const s2Lengths = questLengths(2)
for (const quest of [1, 2, 3]) {
  for (let i = 0; i < s2Lengths[quest]; i++) {
    const q = nextChallenge({ quest_id: quest })
    submitAnswer({ quest_id: quest, chosen_answer: q.correct_answer })
  }
}
const s2 = sessionSummary()
console.log(
  `      session1=${s2.tokens_session1} session2=${s2.tokens_session2} reduction=${s2.token_reduction_pct}%`,
)
check('token reduction matches the 42% on the slide', s2.token_reduction_pct, 42)
checkThat(
  'session 2 needs fewer questions than session 1',
  s2.questions_session2 < s2.questions_session1,
  `${s2.questions_session1} -> ${s2.questions_session2}`,
)
checkThat('mastery climbs after a clean run', s2.mastery_after > s2.mastery_before,
  `${s2.mastery_before} -> ${s2.mastery_after}`)
checkThat('summary reports EverOS as the memory source', s2.memory_source === 'EverOS')
checkThat('pricing CTA present', Boolean(s2.pricing_cta))

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
