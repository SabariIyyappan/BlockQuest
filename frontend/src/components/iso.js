/**
 * 2:1 isometric projection.
 *
 * We place tiles with plain absolute positioning rather than a CSS 3D
 * transform, so children (text, sprites, health bars) stay upright and legible
 * and stacking blocks vertically is just a subtraction on `top`.
 */

export const TILE_W = 64
export const TILE_H = 32
export const BLOCK_H = 26 // vertical rise per stacked block

/** Grid coordinate -> screen offset, in px, relative to the grid origin. */
export function tileToScreen(x, y, z = 0) {
  return {
    left: (x - y) * (TILE_W / 2),
    top: (x + y) * (TILE_H / 2) - z * BLOCK_H,
  }
}

/**
 * Origin offset that centres a cols x rows grid inside a container.
 * The widest point of an iso diamond is (cols + rows) * TILE_W / 2.
 */
export function gridOrigin(cols, rows, containerW) {
  return {
    x: containerW / 2 - TILE_W / 2,
    y: TILE_H,
    width: (cols + rows) * (TILE_W / 2),
    height: (cols + rows) * (TILE_H / 2),
  }
}

/** Painter's algorithm — draw back-to-front so nearer tiles overlap farther ones. */
export function depthOf(x, y, z = 0) {
  return (x + y) * 10 + z
}
