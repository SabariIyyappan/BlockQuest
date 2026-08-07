/**
 * Isometric projection for the voxel world.
 *
 * A 2:1 dimetric grid. World space is (x, y, z) in whole tiles; screen space is
 * pixels relative to the world origin, before the camera transform is applied.
 *
 *   +x runs down-right, +y runs down-left, +z runs up.
 *
 * A cube's anchor point is the CENTRE of its top face. Every sprite in
 * textures.js is baked so that blitting it at (sx - TILE_W/2, sy - TILE_H/2)
 * lands the top face exactly on that anchor.
 */

export const TILE_W = 72
export const TILE_H = 36
export const BLOCK_H = 34

const HALF_W = TILE_W / 2
const HALF_H = TILE_H / 2

/** World tile -> screen pixels (centre of the top face). */
export function project(x, y, z = 0) {
  return {
    sx: (x - y) * HALF_W,
    sy: (x + y) * HALF_H - z * BLOCK_H,
  }
}

/** Screen pixels -> world tile on the z=0 plane. Used for hover/pointer tests. */
export function unproject(sx, sy) {
  return {
    x: (sx / HALF_W + sy / HALF_H) / 2,
    y: (sy / HALF_H - sx / HALF_W) / 2,
  }
}

/**
 * Painter's-algorithm sort key. Everything in a frame goes into one list and is
 * drawn back-to-front by this. `bias` breaks ties so that, say, a character
 * standing on a block draws after the block it stands on.
 */
export function depth(x, y, z = 0, bias = 0) {
  return (x + y) * 1000 + z * 100 + bias
}

/** Corners of the top-face diamond, for procedural drawing (water, ghosts). */
export function topFace(sx, sy) {
  return [
    [sx, sy - HALF_H],
    [sx + HALF_W, sy],
    [sx, sy + HALF_H],
    [sx - HALF_W, sy],
  ]
}

export function pathDiamond(ctx, sx, sy, scale = 1) {
  const w = HALF_W * scale
  const h = HALF_H * scale
  ctx.beginPath()
  ctx.moveTo(sx, sy - h)
  ctx.lineTo(sx + w, sy)
  ctx.lineTo(sx, sy + h)
  ctx.lineTo(sx - w, sy)
  ctx.closePath()
}

/**
 * Pixel extents of a `cols x rows` grid whose tallest column reaches `maxZ`.
 * Used to centre the world under the camera.
 */
export function gridBounds(cols, rows, maxZ = 3) {
  const left = -(rows - 1) * HALF_W - HALF_W
  const right = (cols - 1) * HALF_W + HALF_W
  const top = -maxZ * BLOCK_H - HALF_H
  const bottom = (cols - 1 + rows - 1) * HALF_H + HALF_H + BLOCK_H
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    centreX: (left + right) / 2,
    centreY: (top + bottom) / 2,
  }
}
