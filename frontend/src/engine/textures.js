/**
 * Cube sprite baking.
 *
 * Every voxel in the world is a pre-rendered offscreen canvas, blitted with a
 * single drawImage. Speckle, grain and edge highlights are drawn once at bake
 * time — the frame loop never touches a pixel it doesn't have to.
 *
 * Each material bakes VARIANTS copies at slightly different values. Terrain
 * picks a variant from a hash of (x, y) so a field of grass has grain instead
 * of reading as one flat shape, and the pick is stable across frames.
 */

import { TILE_W, TILE_H, BLOCK_H } from './iso'
import { MATERIALS, shade, rgba } from './palette'

const VARIANTS = 4
const PAD = 1 // guards against seams from sub-pixel positioning

/** Sprite canvas dimensions. Top face + the tallest side face we ever draw. */
export const SPRITE_W = TILE_W + PAD * 2
export const SPRITE_H = TILE_H + BLOCK_H + PAD * 2

/** Where to blit a baked sprite so its top-face centre lands on (sx, sy). */
export const SPRITE_OFFSET_X = -TILE_W / 2 - PAD
export const SPRITE_OFFSET_Y = -TILE_H / 2 - PAD

const cache = new Map()

/* --------------------------------------------------------------- rng utils */

/** Deterministic PRNG so a rebuild bakes identical textures every time. */
function mulberry(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable per-tile variant pick — same tile, same look, every frame. */
export function variantFor(x, y, count = VARIANTS) {
  const h = Math.imul(x * 374761393 + y * 668265263, 1274126177)
  return ((h ^ (h >>> 13)) >>> 0) % count
}

/* ------------------------------------------------------------ face geometry */

const HW = TILE_W / 2
const HH = TILE_H / 2

function topPath(ctx, ox, oy) {
  ctx.beginPath()
  ctx.moveTo(ox + HW, oy)
  ctx.lineTo(ox + TILE_W, oy + HH)
  ctx.lineTo(ox + HW, oy + TILE_H)
  ctx.lineTo(ox, oy + HH)
  ctx.closePath()
}

function leftPath(ctx, ox, oy, h) {
  ctx.beginPath()
  ctx.moveTo(ox, oy + HH)
  ctx.lineTo(ox + HW, oy + TILE_H)
  ctx.lineTo(ox + HW, oy + TILE_H + h)
  ctx.lineTo(ox, oy + HH + h)
  ctx.closePath()
}

function rightPath(ctx, ox, oy, h) {
  ctx.beginPath()
  ctx.moveTo(ox + HW, oy + TILE_H)
  ctx.lineTo(ox + TILE_W, oy + HH)
  ctx.lineTo(ox + TILE_W, oy + HH + h)
  ctx.lineTo(ox + HW, oy + TILE_H + h)
  ctx.closePath()
}

/* ------------------------------------------------------------------- detail */

function speckleTop(ctx, ox, oy, spec, rnd) {
  const [colour, density, size] = spec
  const count = Math.round(density * 260)
  ctx.fillStyle = colour
  // Sample in the diamond's own axes (u, v in [-1,1], |u|+|v| <= 1) so grain
  // stays inside the face without needing a clip test per dot.
  for (let i = 0; i < count; i++) {
    let u = rnd() * 2 - 1
    let v = rnd() * 2 - 1
    const m = Math.abs(u) + Math.abs(v)
    if (m > 1) {
      u /= m
      v /= m
    }
    const px = ox + HW + u * HW
    const py = oy + HH + v * HH
    ctx.fillRect(px, py, size, Math.max(1, size - 1))
  }
}

function grainSide(ctx, ox, oy, h, spec, rnd, side) {
  const [colour, strength] = spec
  ctx.save()
  ctx.globalAlpha = strength * 0.55
  ctx.fillStyle = colour
  const cols = 5
  for (let i = 0; i < cols; i++) {
    if (rnd() > 0.7) continue
    const t = (i + 0.5) / cols
    const x = side === 'left' ? ox + t * HW : ox + HW + t * HW
    const yTop = side === 'left' ? oy + HH + t * HH : oy + TILE_H - t * HH
    const len = h * (0.4 + rnd() * 0.6)
    const off = h * rnd() * 0.3
    ctx.fillRect(x, yTop + off, 2, len)
  }
  ctx.restore()
}

/** A bright rim along the two top edges facing the light, plus a dark base. */
function edgeLight(ctx, ox, oy, h, mat) {
  ctx.save()
  ctx.strokeStyle = rgba('#ffffff', 0.16)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(ox, oy + HH)
  ctx.lineTo(ox + HW, oy)
  ctx.lineTo(ox + TILE_W, oy + HH)
  ctx.stroke()

  ctx.strokeStyle = rgba(mat.edge, 0.55)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(ox, oy + HH + h)
  ctx.lineTo(ox + HW, oy + TILE_H + h)
  ctx.lineTo(ox + TILE_W, oy + HH + h)
  ctx.stroke()

  // Centre seam where the two side faces meet — reads as a hard corner.
  ctx.strokeStyle = rgba(mat.edge, 0.35)
  ctx.beginPath()
  ctx.moveTo(ox + HW, oy + TILE_H)
  ctx.lineTo(ox + HW, oy + TILE_H + h)
  ctx.stroke()
  ctx.restore()
}

/** Ambient occlusion: side faces darken towards the ground. */
function aoSides(ctx, ox, oy, h) {
  const g = ctx.createLinearGradient(0, oy + HH, 0, oy + TILE_H + h)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.28)')
  ctx.fillStyle = g
  leftPath(ctx, ox, oy, h)
  ctx.fill()
  rightPath(ctx, ox, oy, h)
  ctx.fill()
}

/* -------------------------------------------------------------------- bake */

function bake(name, variant, sideHeight) {
  const mat = MATERIALS[name] ?? MATERIALS.stone
  const rnd = mulberry(name.length * 7919 + variant * 104729 + sideHeight)

  // Per-variant value jitter, symmetric around the base so a field averages out.
  const j = 1 + (variant / (VARIANTS - 1) - 0.5) * 2 * mat.jitter

  const c = document.createElement('canvas')
  c.width = SPRITE_W
  c.height = TILE_H + sideHeight + PAD * 2
  const ctx = c.getContext('2d')
  const ox = PAD
  const oy = PAD

  ctx.fillStyle = shade(mat.left, j)
  leftPath(ctx, ox, oy, sideHeight)
  ctx.fill()

  ctx.fillStyle = shade(mat.right, j)
  rightPath(ctx, ox, oy, sideHeight)
  ctx.fill()

  if (mat.grain) {
    ctx.save()
    leftPath(ctx, ox, oy, sideHeight)
    ctx.clip()
    grainSide(ctx, ox, oy, sideHeight, mat.grain, rnd, 'left')
    ctx.restore()
    ctx.save()
    rightPath(ctx, ox, oy, sideHeight)
    ctx.clip()
    grainSide(ctx, ox, oy, sideHeight, mat.grain, rnd, 'right')
    ctx.restore()
  }

  aoSides(ctx, ox, oy, sideHeight)

  ctx.fillStyle = shade(mat.top, j)
  topPath(ctx, ox, oy)
  ctx.fill()

  ctx.save()
  topPath(ctx, ox, oy)
  ctx.clip()
  speckleTop(ctx, ox, oy, mat.speckle, rnd)
  ctx.restore()

  edgeLight(ctx, ox, oy, sideHeight, mat)

  return c
}

/**
 * A baked cube sprite. `sideHeight` lets a terrain column be drawn as one tall
 * sprite instead of a stack of cubes — fewer blits, no internal seams.
 */
export function cubeSprite(name, variant = 0, sideHeight = BLOCK_H) {
  const key = `${name}|${variant}|${sideHeight}`
  let s = cache.get(key)
  if (!s) {
    s = bake(name, variant % VARIANTS, sideHeight)
    cache.set(key, s)
  }
  return s
}

/** Blit a cube so its top-face centre sits at (sx, sy). */
export function drawCube(ctx, name, sx, sy, variant = 0, sideHeight = BLOCK_H) {
  ctx.drawImage(cubeSprite(name, variant, sideHeight), sx + SPRITE_OFFSET_X, sy + SPRITE_OFFSET_Y)
}

/** Warm the cache for the materials a scene is about to use. */
export function preload(names, heights = [BLOCK_H]) {
  for (const n of names) {
    for (const h of heights) {
      for (let v = 0; v < VARIANTS; v++) cubeSprite(n, v, h)
    }
  }
}

export { VARIANTS }
