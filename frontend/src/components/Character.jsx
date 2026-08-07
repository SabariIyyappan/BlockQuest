import { tileToScreen, depthOf, TILE_W } from './iso'
import './Character.css'

/** The player: a small blocky figure that slides between tiles as it walks. */
export default function Character({ x, y, z = 1, walking = false }) {
  const { left, top } = tileToScreen(x, y, z)

  return (
    <div
      className={`character ${walking ? 'character--walking' : ''}`}
      style={{ left: left + TILE_W / 2 - 14, top: top - 18, zIndex: depthOf(x, y, z) + 5 }}
    >
      <div className="character__head" />
      <div className="character__body" />
      <div className="character__shadow decorative" />
    </div>
  )
}
