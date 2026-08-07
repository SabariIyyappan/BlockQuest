/**
 * The single boundary between the UI and the backend.
 *
 * No component imports mockApi directly. To move onto Person B's real backend,
 * flip USE_MOCK to false — nothing else in the app changes.
 */

import * as mock from './mockApi'

export const USE_MOCK = true
export const BASE_URL = 'http://localhost:8000'

/** Small delay so the mock feels like a network call rather than a synchronous jump. */
const LATENCY_MS = 180

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
  return res.json()
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
  return res.json()
}

export function initSession(sessionNumber) {
  // The real backend mints its own session_id on first /next-challenge; for the
  // mock we seed it up front so Session 2 has its memory in place.
  if (USE_MOCK) return mock.initSession(sessionNumber)
  return null
}

export async function nextChallenge({ learnerId = 'alex', questId, lastAnswerCorrect = null, lastResponseMs = null }) {
  if (USE_MOCK) {
    await sleep(LATENCY_MS)
    return mock.nextChallenge({ quest_id: questId })
  }
  return post('/next-challenge', {
    learner_id: learnerId,
    quest_id: questId,
    last_answer_correct: lastAnswerCorrect,
    last_response_ms: lastResponseMs,
  })
}

export async function submitAnswer({ learnerId = 'alex', questId, questionId, chosenAnswer, responseMs }) {
  if (USE_MOCK) {
    await sleep(LATENCY_MS)
    return mock.submitAnswer({ quest_id: questId, chosen_answer: chosenAnswer })
  }
  return post('/submit-answer', {
    learner_id: learnerId,
    quest_id: questId,
    question_id: questionId,
    chosen_answer: chosenAnswer,
    response_ms: responseMs,
  })
}

export async function sessionSummary(learnerId = 'alex') {
  if (USE_MOCK) {
    await sleep(LATENCY_MS)
    return mock.sessionSummary()
  }
  return get(`/session-summary/${learnerId}`)
}
