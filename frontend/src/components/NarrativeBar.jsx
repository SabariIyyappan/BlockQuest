import { useGame } from '../state/GameContext'
import { QUEST_INTRO } from '../constants'
import './NarrativeBar.css'

/** Bottom strip: story text normally, the explanation after a wrong answer. */
export default function NarrativeBar() {
  const { narrative, currentQuest, lastResult, questProgress, questLength } = useGame()

  const isCorrection = Boolean(narrative && lastResult && !lastResult.correct)
  const text = narrative ?? QUEST_INTRO[currentQuest]

  return (
    <footer className={`narrative ${isCorrection ? 'narrative--correction' : ''}`}>
      <span className="narrative__icon">{isCorrection ? '🧭' : '📖'}</span>
      <p className="narrative__text">{text}</p>
      <span className="narrative__progress">
        {questProgress}/{questLength}
      </span>
    </footer>
  )
}
