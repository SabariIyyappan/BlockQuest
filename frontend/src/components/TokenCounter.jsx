import { useGame } from '../state/GameContext'
import './TokenCounter.css'

/**
 * Live AI cost. Small and unobtrusive, but it's the number the whole pitch
 * rests on — in Session 2 it visibly climbs slower.
 */
export default function TokenCounter() {
  const { tokensUsed, sessionNumber } = useGame()

  return (
    <div className="tokens" title="AI tokens spent this session">
      <span className="tokens__icon">🔢</span>
      <span className="tokens__value">{tokensUsed.toLocaleString()}</span>
      <span className="tokens__label">tokens</span>
      {sessionNumber === 2 && <span className="tokens__badge">memory</span>}
    </div>
  )
}
