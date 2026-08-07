import { useGame } from '../state/GameContext'
import TokenCounter from './TokenCounter'
import { QUEST_NAMES } from '../constants'
import './TopBar.css'

export default function TopBar() {
  const { currentQuest, blocksEarned, focusHearts, lowStim, toggleLowStim, sessionNumber } =
    useGame()

  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="topbar__hearts" title="Focus">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className={`heart ${i < focusHearts ? '' : 'heart--dim'}`}>
              ♥
            </span>
          ))}
        </div>
        <div className="topbar__quest">
          <span className="topbar__questnum">Quest {currentQuest}</span>
          <span className="topbar__questname">{QUEST_NAMES[currentQuest]}</span>
        </div>
      </div>

      <div className="topbar__right">
        <div className="topbar__blocks">
          <span className="topbar__blockicon" />
          {blocksEarned} blocks
        </div>
        <TokenCounter />
        <div className={`topbar__session topbar__session--${sessionNumber}`}>
          Session {sessionNumber}
        </div>
        <button
          className="topbar__toggle"
          onClick={toggleLowStim}
          title="Low-stimulation mode"
        >
          {lowStim ? '🌙' : '☀️'}
        </button>
      </div>
    </header>
  )
}
