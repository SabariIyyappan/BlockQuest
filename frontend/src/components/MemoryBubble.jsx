import { useGame } from '../state/GameContext'
import './MemoryBubble.css'

/**
 * The "aha" moment. When the backend returns a memory_note, EverOS has recalled
 * what worked last session — so this is styled to be impossible to miss.
 */
export default function MemoryBubble() {
  const { memoryNote } = useGame()
  if (!memoryNote) return null

  return (
    <div className="membubble">
      <div className="membubble__tag">✨ Remembered from last session</div>
      <div className="membubble__text">{memoryNote}</div>
      <div className="membubble__source">source: EverOS memory</div>
    </div>
  )
}
