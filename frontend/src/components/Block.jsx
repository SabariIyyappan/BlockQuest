import { tileToScreen, depthOf, TILE_W, TILE_H, BLOCK_H } from './iso'
import './Block.css'

/**
 * A voxel block: top diamond plus left/right side faces, so it reads as a cube
 * in 2:1 iso. `index` drives the staggered drop so blocks land one after
 * another rather than all at once.
 */
export default function Block({ x, y, z = 0, kind = 'wood', index = 0, animate = true }) {
  const { left, top } = tileToScreen(x, y, z)

  return (
    <div
      className={`block block--${kind} ${animate ? 'block--drop' : ''}`}
      style={{
        left,
        top,
        zIndex: depthOf(x, y, z),
        width: TILE_W,
        height: TILE_H + BLOCK_H,
        animationDelay: animate ? `calc(${index} * var(--block-stagger))` : undefined,
      }}
    >
      <div className="block__side block__side--left" />
      <div className="block__side block__side--right" />
      <div className="block__top" />
    </div>
  )
}
