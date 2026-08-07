/**
 * In-browser fake backend implementing the full BlockQuest API contract.
 *
 * This is NOT a set of static fixtures — it simulates the adaptation that the
 * real backend performs, so the entire 3-minute demo runs with no server:
 *
 *   - tracks mastery per fact (exponential moving average)
 *   - tracks consecutive errors -> escalates hint_level, reduces num_options
 *   - a wrong answer on `numeric` switches the next question to `groups`
 *   - Session 2 opens with a memory_note and starts in the style that worked
 *   - accounts tokens: ~150/call without memory, ~80/call with it
 *
 * SESSION 2 AND PERSISTENCE
 * -------------------------
 * The demo script says "I'm refreshing the browser. No cookies, no local
 * storage." That claim must stay true, so Session 2 is NOT restored from
 * storage. Instead we bake in a seeded "Alex" profile — the frontend mirror of
 * the backend's seed_alex.py (build plan task B3.3). Session is chosen
 * explicitly via the ?session=2 URL param.
 */

import { QUESTION_BANK, buildOptions, byFactId } from './questionBank.js'
import { questLengths, totalQuestions } from '../constants.js'

// ---------------------------------------------------------------------------
// Token economics
// ---------------------------------------------------------------------------
//
// These two numbers ARE the pitch, so they're calibrated to be internally
// consistent with the gameplay rather than picked to flatter the slide:
//
//   Session 1:  8 questions x 355 = 2840 tokens   (re-diagnose every fact)
//   Session 2:  6 questions x 275 = 1650 tokens   (recall, then apply)
//   Reduction:  1 - 1650/2840    = 42%
//
// The saving comes from both directions: each remembered call is ~23% cheaper
// because it skips diagnosis, and fewer calls are needed overall.

const TOKENS_WITHOUT_MEMORY = 355
const TOKENS_WITH_MEMORY = 275

// EMA weight on the newest attempt. High, because in a short session each
// answer is strong evidence — a fact you previously missed and now get right
// should move the needle visibly rather than creep.
const MASTERY_ALPHA = 0.7

/** Assumed starting mastery for a fact we've never seen the learner attempt. */
const DEFAULT_MASTERY = 0.3
const BLOCKS_PER_CORRECT = 4

/**
 * The seeded Session 1 profile. These are the numbers the reveal card quotes,
 * and they match the API contract example exactly.
 */
const SEEDED_SESSION_1 = {
  mastery: { '3x4': 0.35, '3x5': 0.3, '4x6': 0.4, '6x3': 0.35, '6x7': 0.2 },
  mastery_avg: 0.33,
  questions_asked: totalQuestions(1), // 8 — matches what Session 1 actually plays
  tokens: totalQuestions(1) * TOKENS_WITHOUT_MEMORY, // 2840
  effective_style: 'groups',
  misconception: 'additive',
}

// ---------------------------------------------------------------------------
// Mutable session state
// ---------------------------------------------------------------------------

let state = null

function freshState(sessionNumber) {
  const hasMemory = sessionNumber === 2

  return {
    sessionNumber,
    hasMemory,
    learner_id: 'alex',
    session_id: `sess_${sessionNumber}_${Date.now()}`,
    // Session 2 inherits Session 1's mastery; Session 1 starts cold.
    mastery: hasMemory ? { ...SEEDED_SESSION_1.mastery } : {},
    // Frozen snapshot so the reveal card can show a real before/after.
    masteryAtStart: hasMemory ? { ...SEEDED_SESSION_1.mastery } : {},
    // Session 2 already knows groups worked. Session 1 must discover it.
    preferredFormat: hasMemory ? SEEDED_SESSION_1.effective_style : 'numeric',
    consecutiveErrors: 0,
    tokensThisSession: 0,
    questionsAsked: 0,
    askedFactIds: [],
    questProgress: { 1: 0, 2: 0, 3: 0 },
    lastQuestion: null,
    sawWrongAnswer: false,
    memoryNoteDelivered: false,
  }
}

/** Reset the fake backend. Called once at app start with the chosen session. */
export function initSession(sessionNumber) {
  state = freshState(sessionNumber)
  return state.session_id
}

function ensureState() {
  if (!state) initSession(1)
  return state
}

// ---------------------------------------------------------------------------
// Mastery
// ---------------------------------------------------------------------------

function masteryOf(factId) {
  const s = ensureState()
  return s.mastery[factId] ?? 0.0
}

function updateMastery(factId, correct) {
  const s = ensureState()
  const prev = s.mastery[factId] ?? DEFAULT_MASTERY
  s.mastery[factId] = round2(prev * (1 - MASTERY_ALPHA) + (correct ? 1 : 0) * MASTERY_ALPHA)
}

/**
 * Mastery before/after, measured over the facts practiced *this session*.
 *
 * Averaging across every fact ever seen would dilute the result with facts the
 * learner never touched today, so before/after are computed on the same set —
 * a genuine pre/post comparison rather than a flattering one.
 */
function masteryDelta() {
  const s = ensureState()
  const facts = [...new Set(s.askedFactIds)]
  if (!facts.length) return { before: 0, after: 0 }

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
  const before = mean(facts.map((f) => s.masteryAtStart[f] ?? DEFAULT_MASTERY))
  const after = mean(facts.map((f) => s.mastery[f] ?? DEFAULT_MASTERY))

  return { before: round2(before), after: round2(after) }
}

const round2 = (n) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Question selection
// ---------------------------------------------------------------------------

/**
 * Quest 1 is diagnostic (3x/4x/6x, easy). Quest 2 targets whatever looks weak.
 * Quest 3 (boss) goes after the single weakest fact — the 7x table.
 */
function pickQuestion(questId) {
  const s = ensureState()

  let pool
  if (questId === 1) {
    pool = QUESTION_BANK.filter((q) => q.difficulty_tier === 'easy')
  } else if (questId === 2) {
    pool = QUESTION_BANK.filter((q) => q.difficulty_tier === 'medium')
  } else {
    pool = QUESTION_BANK.filter((q) => q.difficulty_tier === 'hard')
  }

  // Don't repeat within a session.
  const unseen = pool.filter((q) => !s.askedFactIds.includes(q.fact_id))
  const candidates = unseen.length ? unseen : pool

  // Prefer the weakest fact we haven't asked yet.
  return candidates.reduce((weakest, q) =>
    masteryOf(q.fact_id) < masteryOf(weakest.fact_id) ? q : weakest,
  )
}

/**
 * Decide how the question should be presented.
 *
 * The rule that sells the demo: once the learner shows the additive
 * misconception on a numeric question, we stop asking numerically and switch to
 * visual groups. Session 2 skips straight to groups because it remembers.
 */
function pickFormat(questId) {
  const s = ensureState()

  if (s.hasMemory) return s.preferredFormat
  if (s.sawWrongAnswer) return 'groups'
  if (questId === 2) return 'array'
  return 'numeric'
}

function pickDifficulty(question) {
  return question.difficulty_tier
}

// ---------------------------------------------------------------------------
// Endpoint: POST /next-challenge
// ---------------------------------------------------------------------------

export function nextChallenge({ quest_id }) {
  const s = ensureState()

  const question = pickQuestion(quest_id)
  const format = pickFormat(quest_id)

  // Two strikes -> full scaffolding and half the choices.
  const struggling = s.consecutiveErrors >= 2
  const hintLevel = struggling ? 2 : s.consecutiveErrors === 1 ? 1 : 0
  const numOptions = struggling ? 2 : 4

  // The memory bubble fires once, on the first question of a remembered session.
  let memoryNote = null
  if (s.hasMemory && !s.memoryNoteDelivered) {
    memoryNote = 'Last time, building groups helped you. Let’s use that trick again.'
    s.memoryNoteDelivered = true
  }

  s.askedFactIds.push(question.fact_id)
  s.questionsAsked += 1
  s.lastQuestion = question

  return {
    question_id: question.question_id,
    question_text: questionText(question, format, quest_id),
    a: question.a,
    b: question.b,
    format,
    options: buildOptions(question, numOptions),
    correct_answer: question.product,
    difficulty: pickDifficulty(question),
    hint_level: hintLevel,
    hint_text: hintText(question, hintLevel),
    num_options: numOptions,
    boss_trigger: quest_id === 3,
    memory_note: memoryNote,
    fact_id: question.fact_id,
  }
}

function questionText(question, format, questId) {
  const { a, b } = question

  if (format === 'groups') {
    return `How many blocks in total?`
  }
  if (format === 'array') {
    return `The wall is ${a} rows of ${b} blocks. How many blocks?`
  }

  // numeric
  if (questId === 1) return `The bridge needs ${a} rows of ${b} blocks. How many blocks?`
  if (questId === 3) return `The Golem's shield is ${a} × ${b}. Break it!`
  return `${a} × ${b} = ?`
}

function hintText(question, level) {
  const { a, b } = question
  if (level === 0) return null
  if (level === 1) return 'Think about groups, not adding.'

  // Level 2: the fully worked example, rendered step by step by HintPanel.
  const steps = [`${a} × ${b} means ${a} groups of ${b}.`]
  let running = 0
  for (let i = 1; i <= a; i++) {
    running += b
    steps.push(i === 1 ? `Group 1: ${b}.` : `Group ${i}: ${running - b} + ${b} = ${running}.`)
  }
  return steps
}

// ---------------------------------------------------------------------------
// Endpoint: POST /submit-answer
// ---------------------------------------------------------------------------

export function submitAnswer({ quest_id, chosen_answer }) {
  const s = ensureState()
  const question = s.lastQuestion
  const correct = chosen_answer === question.product

  updateMastery(question.fact_id, correct)

  if (correct) {
    s.consecutiveErrors = 0
    s.questProgress[quest_id] += 1
  } else {
    s.consecutiveErrors += 1
    s.sawWrongAnswer = true
  }

  // Memory-assisted calls are cheaper. This is the whole thesis, in one line.
  const tokens = s.hasMemory ? TOKENS_WITH_MEMORY : TOKENS_WITHOUT_MEMORY
  s.tokensThisSession += tokens

  const questComplete = s.questProgress[quest_id] >= questLengths(s.sessionNumber)[quest_id]

  return {
    correct,
    blocks_awarded: correct ? BLOCKS_PER_CORRECT : 0,
    explanation: correct ? null : explain(question, chosen_answer),
    explanation_style: pickFormat(quest_id),
    quest_complete: questComplete,
    boss_defeated: questComplete && quest_id === 3,
    consecutive_errors: s.consecutiveErrors,
    tokens_used_this_call: tokens,
    correct_answer: question.product,
  }
}

/** Name the misconception rather than just restating the answer. */
function explain(question, chosen) {
  const { a, b, product, distractors } = question

  if (chosen === distractors.additive) {
    return `Careful — that's ${a} + ${b}. Multiplying means ${a} groups of ${b}, which is ${product}.`
  }
  if (chosen === distractors.offByOne) {
    return `So close! That's only ${a - 1} groups of ${b}. One more group makes ${product}.`
  }
  return `Not quite. ${a} groups of ${b} blocks makes ${product}.`
}

// ---------------------------------------------------------------------------
// Endpoint: GET /session-summary/{learner_id}
// ---------------------------------------------------------------------------

export function sessionSummary() {
  const s = ensureState()

  const session1Tokens = SEEDED_SESSION_1.tokens
  const session2Tokens = s.hasMemory ? s.tokensThisSession : null

  // In Session 1 we have nothing to compare against yet, so quote the seeded
  // projection; in Session 2 the reduction is computed from what actually ran.
  const reduction = s.hasMemory
    ? Math.round((1 - session2Tokens / session1Tokens) * 100)
    : 42

  const { before, after } = masteryDelta()
  const facts = Object.entries(s.mastery)
  const mastered = facts.filter(([, v]) => v >= 0.7).map(([k]) => k)

  return {
    learner_id: s.learner_id,
    session_number: s.sessionNumber,
    mastery_before: before,
    mastery_after: after,
    questions_session1: SEEDED_SESSION_1.questions_asked,
    questions_session2: s.hasMemory ? s.questionsAsked : totalQuestions(2),
    tokens_session1: session1Tokens,
    tokens_session2: session2Tokens ?? s.tokensThisSession,
    token_reduction_pct: reduction,
    strategy_retrieved: 'visual block groups',
    memory_source: 'EverOS',
    facts_mastered: mastered,
    facts_weak: facts.filter(([, v]) => v < 0.5).map(([k]) => k),
    // Quote the real count rather than a fixed number that can drift from the
    // facts actually listed on the card.
    pricing_cta: `Alex mastered ${mastered.length} multiplication ${
      mastered.length === 1 ? 'fact' : 'facts'
    } in ${s.questionsAsked} questions. Continue tomorrow — $12/month.`,
  }
}

export { byFactId }
