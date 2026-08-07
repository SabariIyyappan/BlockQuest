import { createContext, useContext, useReducer, useCallback, useRef } from 'react'
import { gameReducer, initialState, PHASE } from './gameReducer'
import * as api from '../api/client'
import { QUEST_INTRO, TOTAL_QUESTS } from '../constants'

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

  const loadQuestion = useCallback(
    async (questId) => {
      if (loadingRef.current) return
      loadingRef.current = true
      try {
        const question = await api.nextChallenge({ questId })
        dispatch({ type: 'QUESTION_LOADED', question })
      } finally {
        loadingRef.current = false
      }
    },
    [],
  )

  const startQuest = useCallback(
    (questId) => {
      dispatch({ type: 'START_QUEST', intro: QUEST_INTRO[questId] })
      loadQuestion(questId)
    },
    [loadQuestion],
  )

  const answer = useCallback(
    async (chosen) => {
      dispatch({ type: 'ANSWER_SELECTED', answer: chosen })

      const result = await api.submitAnswer({
        questId: state.currentQuest,
        questionId: state.currentQuestion.question_id,
        chosenAnswer: chosen,
        responseMs: Date.now() - (state.questionShownAt ?? Date.now()),
      })

      // Brief pause so the green/red flash is legible before the scene reacts.
      await new Promise((r) => setTimeout(r, 550))
      dispatch({ type: 'ANSWER_GRADED', result })

      if (result.correct && result.blocks_awarded > 0) {
        dispatch({ type: 'PLACE_BLOCKS', count: result.blocks_awarded })
        // Let the staggered block animation finish before moving on.
        await new Promise((r) => setTimeout(r, 150 * result.blocks_awarded + 500))
        dispatch({ type: 'BUILD_DONE' })

        // questProgress in this closure is pre-answer, so add the point we just
        // scored to decide whether the quest is finished.
        const progressAfter = state.questProgress + 1
        if (progressAfter < state.lengths[state.currentQuest]) {
          loadQuestion(state.currentQuest)
        }
      }
    },
    [state.currentQuest, state.currentQuestion, state.questionShownAt, state.questProgress, state.lengths, loadQuestion],
  )

  const continueAfterWrong = useCallback(() => {
    dispatch({ type: 'CONTINUE_AFTER_WRONG' })
    loadQuestion(state.currentQuest)
  }, [loadQuestion, state.currentQuest])

  const advance = useCallback(async () => {
    if (state.currentQuest >= TOTAL_QUESTS) {
      const summary = await api.sessionSummary()
      dispatch({ type: 'SHOW_REVEAL', summary })
      return
    }
    const next = state.currentQuest + 1
    dispatch({ type: 'ADVANCE_QUEST' })
    // Hold on the transition briefly, then load the next scene's first question.
    setTimeout(() => startQuest(next), 900)
  }, [state.currentQuest, startQuest])

  const toggleLowStim = useCallback(() => dispatch({ type: 'TOGGLE_LOW_STIM' }), [])

  const value = {
    ...state,
    questLength: state.lengths[state.currentQuest],
    startQuest,
    loadQuestion,
    answer,
    continueAfterWrong,
    advance,
    toggleLowStim,
    PHASE,
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>')
  return ctx
}
