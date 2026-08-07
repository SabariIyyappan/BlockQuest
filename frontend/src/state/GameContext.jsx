import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react'
import { gameReducer, initialState, PHASE } from './gameReducer'
import * as api from '../api/client'
import { TOTAL_QUESTS } from '../constants'
import { pipLine, golemLine } from '../story/dialogue'
import sfx, { unlock as unlockAudio } from '../audio/sfx'

const GameContext = createContext(null)

/** Session is chosen explicitly by URL param — never restored from storage. */
function readSessionNumber() {
  const p = new URLSearchParams(window.location.search)
  return p.get('session') === '2' ? 2 : 1
}

export function GameProvider({ children }) {
  const sessionNumber = readSessionNumber()
  const [state, dispatch] = useReducer(gameReducer, sessionNumber, (n) => {
    api.initSession(n)
    return initialState(n)
  })

  // Guards against double-firing in React StrictMode's double-invoked effects.
  const loadingRef = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  /** Pip says something. Plays the line's cue unless the player has muted. */
  const say = useCallback((event, ctx = {}) => {
    const line = pipLine(event, ctx)
    if (!line) return
    dispatch({ type: 'SAY', line, isMemory: event === 'memory' })
    if (line.sound && sfx[line.sound]) sfx[line.sound]()
  }, [])

  // Pip introduces themself on the title screen. In session 2 this is the
  // recognition beat — the whole pitch, delivered as a character moment.
  useEffect(() => {
    say('greet', { sessionNumber })
  }, [say, sessionNumber])

  const loadQuestion = useCallback(
    async (questId) => {
      if (loadingRef.current) return
      loadingRef.current = true
      try {
        const question = await api.nextChallenge({ questId })
        dispatch({ type: 'QUESTION_LOADED', question })

        // The memory note is the backend's text, passed through verbatim —
        // Pip only delivers it. Fires at most once per session.
        if (question.memory_note && !stateRef.current.memorySpoken) {
          say('memory', { text: question.memory_note, sessionNumber })
        }
      } finally {
        loadingRef.current = false
      }
    },
    [say, sessionNumber],
  )

  const startQuest = useCallback(
    (questId) => {
      unlockAudio()
      dispatch({ type: 'START_QUEST' })
      say('questIntro', { questId, sessionNumber, seed: questId })
      loadQuestion(questId)
    },
    [loadQuestion, say, sessionNumber],
  )

  const answer = useCallback(
    async (chosen) => {
      unlockAudio()
      dispatch({ type: 'ANSWER_SELECTED', answer: chosen })

      const result = await api.submitAnswer({
        questId: state.currentQuest,
        questionId: state.currentQuestion.question_id,
        chosenAnswer: chosen,
        responseMs: Date.now() - (state.questionShownAt ?? Date.now()),
      })

      // Brief pause so the flash is legible before the scene reacts.
      await new Promise((r) => setTimeout(r, 550))
      dispatch({ type: 'ANSWER_GRADED', result })

      if (result.correct) {
        say('correct', {
          questId: state.currentQuest,
          consecutiveErrors: state.consecutiveErrors,
          seed: state.questProgress,
        })
        if (state.currentQuest === 3) {
          const broken = state.bossMaxHealth - Math.max(0, state.bossHealth - 1)
          dispatch({ type: 'GOLEM_TAUNT', text: golemLine(broken) })
        }
      } else {
        // Pip delivers the engine's own explanation, which names the
        // misconception. The reassurance is Pip's own.
        say('wrong', { text: result.explanation, seed: state.consecutiveErrors })
      }

      if (result.correct && result.blocks_awarded > 0) {
        dispatch({ type: 'PLACE_BLOCKS', count: result.blocks_awarded })
        // Let the staggered block animation finish before moving on.
        await new Promise((r) => setTimeout(r, 150 * result.blocks_awarded + 500))
        dispatch({ type: 'BUILD_DONE' })

        // questProgress in this closure is pre-answer, so add the point we just
        // scored to decide whether the quest is finished.
        const progressAfter = state.questProgress + 1
        if (progressAfter >= state.lengths[state.currentQuest]) {
          say(state.currentQuest === 3 ? 'bossDefeat' : 'questComplete', {
            questId: state.currentQuest,
          })
        } else {
          loadQuestion(state.currentQuest)
        }
      }
    },
    [
      state.currentQuest,
      state.currentQuestion,
      state.questionShownAt,
      state.questProgress,
      state.consecutiveErrors,
      state.bossHealth,
      state.bossMaxHealth,
      state.lengths,
      loadQuestion,
      say,
    ],
  )

  const continueAfterWrong = useCallback(() => {
    dispatch({ type: 'CONTINUE_AFTER_WRONG' })
    loadQuestion(state.currentQuest)
  }, [loadQuestion, state.currentQuest])

  const advance = useCallback(async () => {
    unlockAudio()
    if (state.currentQuest >= TOTAL_QUESTS) {
      const summary = await api.sessionSummary()
      dispatch({ type: 'SHOW_REVEAL', summary })
      say('reveal', { sessionNumber })
      return
    }
    const next = state.currentQuest + 1
    dispatch({ type: 'ADVANCE_QUEST' })
    // Hold on the transition briefly, then load the next scene's first question.
    setTimeout(() => startQuest(next), 900)
  }, [state.currentQuest, startQuest, say, sessionNumber])

  const toggleLowStim = useCallback(() => dispatch({ type: 'TOGGLE_LOW_STIM' }), [])
  const toggleMute = useCallback(() => {
    unlockAudio()
    dispatch({ type: 'TOGGLE_MUTE' })
  }, [])

  const value = {
    ...state,
    questLength: state.lengths[state.currentQuest],
    pipMood: state.dialogue?.mood ?? 'idle',
    startQuest,
    loadQuestion,
    answer,
    continueAfterWrong,
    advance,
    toggleLowStim,
    toggleMute,
    say,
    PHASE,
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>')
  return ctx
}
