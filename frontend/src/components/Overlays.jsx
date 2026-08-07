import { useGame } from '../state/GameContext'
import { QUEST_NAMES, QUEST_INTRO, TOTAL_QUESTS } from '../constants'
import './Overlays.css'

/** Opening screen. Also where the presenter starts the run on stage. */
export function IntroOverlay() {
  const { startQuest, sessionNumber } = useGame()

  return (
    <div className="overlay">
      <div className="overlay__card">
        <div className="overlay__badge">Session {sessionNumber}</div>
        <h1 className="overlay__title">BlockQuest</h1>
        <p className="overlay__sub">Every mistake builds your next adventure.</p>
        <p className="overlay__body">{QUEST_INTRO[1]}</p>
        <button className="overlay__btn" onClick={() => startQuest(1)}>
          Start Quest 1
        </button>
        {sessionNumber === 1 && (
          <p className="overlay__hint">
            Tip: add <code>?session=2</code> to the URL to replay with memory.
          </p>
        )}
      </div>
    </div>
  )
}

export function QuestCompleteOverlay() {
  const { currentQuest, advance, blocksEarned } = useGame()
  const last = currentQuest >= TOTAL_QUESTS

  const headline =
    currentQuest === 1 ? 'Bridge repaired!' : currentQuest === 2 ? 'Shelter built!' : 'Golem defeated!'

  return (
    <div className="overlay">
      <div className="overlay__card">
        <div className="overlay__badge overlay__badge--win">Quest {currentQuest} complete</div>
        <h1 className="overlay__title">{headline}</h1>
        <p className="overlay__body">
          {blocksEarned} blocks earned.{' '}
          {last ? 'The village is safe.' : `${QUEST_NAMES[currentQuest + 1]} awaits.`}
        </p>
        <button className="overlay__btn" onClick={advance}>
          {last ? 'See results' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}

export function TransitionOverlay() {
  const { currentQuest } = useGame()

  return (
    <div className="overlay overlay--transition">
      <div className="overlay__transtext">{QUEST_NAMES[currentQuest]}</div>
    </div>
  )
}
