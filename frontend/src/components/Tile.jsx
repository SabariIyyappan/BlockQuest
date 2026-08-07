import { tileToScreen, depthOf, TILE_W, TILE_H } from './iso'
import './Tile.css'

/**
 * One flat ground tile: a 2:1 diamond drawn with clip-path, plus a thin dark
 * skirt underneath that reads as soil depth.
 */
export default function Tile({ x, y, kind = 'grass' }) {
  const { left, top } = tileToScreen(x, y)

  return (
    <div
      className={`tile tile--${kind}`}
      style={{ left, top, zIndex: depthOf(x, y), width: TILE_W, height: TILE_H }}
    >
      <div className="tile__face" />
      <div className="tile__skirt" />
    </div>
  )
}
