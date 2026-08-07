import { useEffect, useState } from 'react'
import { useGame } from '../state/GameContext'
import { QUEST_NAMES, TOTAL_QUESTS, totalQuestions } from '../constants'
import './Overlays.css'

/**
 * Hold an overlay back for a beat so the world's own flourish — a bridge being
 * crossed, a golem coming apart — plays out before a card covers it.
 */
function useDelayed(ms) {
  const [ready, setReady] = useState(ms === 0)
  useEffect(() => {
    if (ms === 0) return
    const id = setTimeout(() => setReady(true), ms)
    return () => clearTimeout(id)
  }, [ms])
  return ready
}

/** Opening screen. Also where the presenter starts the run on stage. */
export function IntroOverlay() {
  const { startQuest, sessionNumber } = useGame()
  const warm = sessionNumber === 2

  return (
    <div className="overlay">
      <div className={`overlay__card ${warm ? 'overlay__card--warm' : ''}`}>
        <div className={`overlay__badge ${warm ? 'overlay__badge--memory' : ''}`}>
          Session {sessionNumber}
          {warm ? ' · Pip remembers you' : ' · first meeting'}
        </div>

        <h1 className="overlay__title">BlockQuest</h1>
        <p className="overlay__sub">Every mistake builds your next adventure.</p>

        <p className="overlay__body">
          The storm broke the bridge, took the shelter, and left something in the
          village that shouldn't be there. Answer well and the world rebuilds
          itself around you.
        </p>

        <p className="overlay__meta">
          {totalQuestions(sessionNumber)} questions · 3 quests
          {warm && ' · shorter, because Pip already knows how you learn'}
        </p>

        <button className="overlay__btn" onClick={() => startQuest(1)}>
          {warm ? 'Pick up where we left off' : 'Begin'}
        </button>

        {sessionNumber === 1 && (
          <p className="overlay__hint">
            Add <code>?session=2</code> to the URL to replay with memory.
          </p>
        )}
      </div>
    </div>
  )
}

export function QuestCompleteOverlay() {
  const { currentQuest, advance, blocksEarned } = useGame()
  const last = currentQuest >= TOTAL_QUESTS

  // Quest 1 ends with a walk across the new bridge; Quest 3 with the golem
  // dissolving. Both deserve to be watched.
  const ready = useDelayed(currentQuest === 1 ? 2400 : currentQuest === 3 ? 1800 : 900)
  if (!ready) return null

  const headline =
    currentQuest === 1
      ? 'The bridge holds.'
      : currentQuest === 2
        ? 'Shelter stands.'
        : 'The Golem is broken.'

  return (
    <div className="overlay">
      <div className="overlay__card">
        <div className="overlay__badge overlay__badge--win">Quest {currentQuest} complete</div>
        <h1 className="overlay__title">{headline}</h1>
        <p className="overlay__body">
          {blocksEarned} blocks placed.{' '}
          {last ? 'The village is whole again.' : `${QUEST_NAMES[currentQuest + 1]} is next.`}
        </p>
        <button className="overlay__btn" onClick={advance}>
          {last ? 'See what it cost' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}

export function TransitionOverlay() {
  const { currentQuest } = useGame()

  return (
    <div className="overlay overlay--transition">
      <div className="overlay__transwrap">
        <div className="overlay__transnum">Quest {currentQuest}</div>
        <div className="overlay__transtext">{QUEST_NAMES[currentQuest]}</div>
      </div>
    </div>
  )
}
