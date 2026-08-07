/**
 * All BlockQuest game state lives here. Components read from context and
 * dispatch — none of them hold game state locally.
 */

import { questLengths } from '../constants'

export const PHASE = {
  INTRO: 'intro',
  LOADING: 'loading',
  QUESTION: 'question',
  FEEDBACK: 'feedback',
  BUILDING: 'building',
  QUEST_COMPLETE: 'questComplete',
  TRANSITION: 'transition',
  REVEAL: 'reveal',
}

export function initialState(sessionNumber) {
  // The golem has one shield per question in Quest 3, so Session 2's shorter
  // quest visibly means a shorter boss fight.
  const bossMax = questLengths(sessionNumber)[3]

  return {
    sessionNumber,
    lengths: questLengths(sessionNumber),
    currentQuest: 1,
    gamePhase: PHASE.INTRO,

    blocksEarned: 0,
    placedBlocks: [], // indices into the current scene's build slots
    questProgress: 0, // correct answers in the current quest
    questProgressAll: { 1: 0, 2: 0, 3: 0 },

    currentQuestion: null,
    lastResult: null,
    selectedAnswer: null,
    consecutiveErrors: 0,
    focusHearts: 3,

    bossMaxHealth: bossMax,
    bossHealth: bossMax,
    bossDefeated: false,

    tokensUsed: 0,
    memoryNote: null,
    narrative: null,
    summary: null,

    lowStim: false,
    muted: false,
    questionShownAt: null,

    // Story surface. `dialogue` is whatever Pip is currently saying; the id
    // lets the dialogue box restart its typewriter on a repeated line.
    dialogue: null,
    dialogueId: 0,
    golemTaunt: null,
    memorySpoken: false,
  }
}

export function gameReducer(state, action) {
  switch (action.type) {
    case 'START_QUEST':
      return {
        ...state,
        gamePhase: PHASE.LOADING,
        questProgress: 0,
        placedBlocks: [],
        narrative: action.intro ?? state.narrative,
      }

    case 'QUESTION_LOADED':
      return {
        ...state,
        gamePhase: PHASE.QUESTION,
        currentQuestion: action.question,
        // A memory note, once shown, stays up for the rest of the quest so the
        // audience has time to read it.
        memoryNote: action.question.memory_note ?? state.memoryNote,
        selectedAnswer: null,
        lastResult: null,
        questionShownAt: Date.now(),
      }

    case 'ANSWER_SELECTED':
      return { ...state, selectedAnswer: action.answer, gamePhase: PHASE.FEEDBACK }

    case 'ANSWER_GRADED': {
      const r = action.result
      const correct = r.correct

      return {
        ...state,
        lastResult: r,
        consecutiveErrors: r.consecutive_errors,
        tokensUsed: state.tokensUsed + (r.tokens_used_this_call ?? 0),
        blocksEarned: state.blocksEarned + (r.blocks_awarded ?? 0),
        questProgress: correct ? state.questProgress + 1 : state.questProgress,
        questProgressAll: correct
          ? { ...state.questProgressAll, [state.currentQuest]: state.questProgressAll[state.currentQuest] + 1 }
          : state.questProgressAll,
        // Hearts are a gentle signal, never a fail state — they never hit zero.
        focusHearts: correct ? state.focusHearts : Math.max(1, state.focusHearts - 1),
        bossHealth:
          state.currentQuest === 3 && correct ? Math.max(0, state.bossHealth - 1) : state.bossHealth,
        bossDefeated: state.bossDefeated || Boolean(r.boss_defeated),
        narrative: correct ? null : r.explanation,
        gamePhase: correct ? PHASE.BUILDING : PHASE.FEEDBACK,
      }
    }

    case 'PLACE_BLOCKS': {
      const start = state.placedBlocks.length
      const added = Array.from({ length: action.count }, (_, i) => start + i)
      return { ...state, placedBlocks: [...state.placedBlocks, ...added] }
    }

    case 'BUILD_DONE': {
      const done = state.questProgress >= state.lengths[state.currentQuest]
      return { ...state, gamePhase: done ? PHASE.QUEST_COMPLETE : PHASE.LOADING }
    }

    case 'CONTINUE_AFTER_WRONG':
      return { ...state, gamePhase: PHASE.LOADING, selectedAnswer: null }

    case 'ADVANCE_QUEST': {
      const next = state.currentQuest + 1
      return {
        ...state,
        gamePhase: PHASE.TRANSITION,
        currentQuest: next,
        questProgress: 0,
        placedBlocks: [],
        currentQuestion: null,
        narrative: null,
        // The memory bubble has made its point during Quest 1; retire it so it
        // stops covering the later scenes (notably the golem).
        memoryNote: null,
      }
    }

    case 'SHOW_REVEAL':
      return { ...state, gamePhase: PHASE.REVEAL, summary: action.summary }

    case 'TOGGLE_LOW_STIM':
      return { ...state, lowStim: !state.lowStim }

    case 'TOGGLE_MUTE':
      return { ...state, muted: !state.muted }

    /** Pip speaks. See story/dialogue.js — the engine never speaks directly. */
    case 'SAY':
      if (!action.line) return state
      return {
        ...state,
        dialogue: action.line,
        dialogueId: state.dialogueId + 1,
        memorySpoken: state.memorySpoken || action.isMemory === true,
      }

    case 'GOLEM_TAUNT':
      return { ...state, golemTaunt: action.text }

    case 'SET_NARRATIVE':
      return { ...state, narrative: action.text }

    default:
      return state
  }
}
