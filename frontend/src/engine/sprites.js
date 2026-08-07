/**
 * Everything in the world that isn't terrain: the hero, Pip, the Glitch Golem,
 * and the props that make a scene feel inhabited.
 *
 * All of it is built from one primitive — `box()`, an isometric cuboid with
 * three shaded faces — so characters and terrain catch the light identically.
 * Units are tiles: a box of size (1, 1, 1) is exactly one terrain voxel.
 */

import { TILE_W, TILE_H, BLOCK_H } from './iso'
import { shade, rgba, ACCENT } from './palette'
import Particles from './particles'

const HW = TILE_W / 2
const HH = TILE_H / 2

const LEFT_SHADE = 0.7
const RIGHT_SHADE = 0.86

/* ------------------------------------------------------------------- prims */

/**
 * An isometric cuboid.
 *
 * (sx, sy) is the screen position of the tile centre the box stands on.
 * `w`/`d` are half-extents along world x/y in tiles; `h` is height in tiles.
 * `lift` raises the box off the ground before drawing (floating things).
 */
export function box(ctx, sx, sy, w, d, h, colour, opts = {}) {
  const lift = (opts.lift ?? 0) * BLOCK_H
  const hp = h * BLOCK_H
  const baseY = sy - lift

  const cx = (u, v) => sx + (u * w - v * d) * HW
  const cy = (u, v) => baseY + (u * w + v * d) * HH

  const top = shade(colour, opts.topShade ?? 1)
  const left = shade(colour, opts.leftShade ?? LEFT_SHADE)
  const right = shade(colour, opts.rightShade ?? RIGHT_SHADE)

  // Left face (normal +y, faces down-left).
  ctx.fillStyle = left
  ctx.beginPath()
  ctx.moveTo(cx(-1, 1), cy(-1, 1) - hp)
  ctx.lineTo(cx(1, 1), cy(1, 1) - hp)
  ctx.lineTo(cx(1, 1), cy(1, 1))
  ctx.lineTo(cx(-1, 1), cy(-1, 1))
  ctx.closePath()
  ctx.fill()

  // Right face (normal +x, faces down-right).
  ctx.fillStyle = right
  ctx.beginPath()
  ctx.moveTo(cx(1, 1), cy(1, 1) - hp)
  ctx.lineTo(cx(1, -1), cy(1, -1) - hp)
  ctx.lineTo(cx(1, -1), cy(1, -1))
  ctx.lineTo(cx(1, 1), cy(1, 1))
  ctx.closePath()
  ctx.fill()

  // Top face.
  ctx.fillStyle = top
  ctx.beginPath()
  ctx.moveTo(cx(-1, -1), cy(-1, -1) - hp)
  ctx.lineTo(cx(1, -1), cy(1, -1) - hp)
  ctx.lineTo(cx(1, 1), cy(1, 1) - hp)
  ctx.lineTo(cx(-1, 1), cy(-1, 1) - hp)
  ctx.closePath()
  ctx.fill()

  if (opts.outline !== false) {
    ctx.strokeStyle = rgba(shade(colour, 0.55), 0.5)
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

/** Soft contact shadow. Everything that stands on the ground gets one. */
export function shadow(ctx, sx, sy, rx, ry = rx * 0.5, alpha = 0.3) {
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rx)
  g.addColorStop(0, `rgba(0,0,0,${alpha})`)
  g.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.5})`)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.save()
  ctx.translate(sx, sy)
  ctx.scale(1, ry / rx)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/* -------------------------------------------------------------------- hero */

const SKIN = '#f0c49a'
const HAIR = '#5a3d2b'
const TUNIC = '#3f8ecc'
const TROUSER = '#3b4a6b'
const BOOT = '#5b4230'

/**
 * The hero. `phase` drives the walk cycle, `walking` swaps idle bob for stride,
 * `cheer` raises both arms.
 */
export function drawHero(ctx, sx, sy, opts = {}) {
  const { phase = 0, walking = false, cheer = 0, facing = 1, motion = 1 } = opts

  const swing = walking ? Math.sin(phase * 9) * 0.42 : 0
  const bob = walking
    ? Math.abs(Math.sin(phase * 9)) * 0.06
    : Math.sin(phase * 2) * 0.025 * motion

  shadow(ctx, sx, sy, 17, 8, walking ? 0.24 : 0.32)

  const y = sy - bob * BLOCK_H
  const s = 0.19 // half-extent of a limb, in tiles

  // Legs — offset along the facing axis so the stride reads in isometric.
  const legOff = 0.17
  box(ctx, sx + facing * swing * 9, y + Math.abs(swing) * 3, s * 0.8, s * 0.8, 0.34, TROUSER, {
    lift: 0,
  })
  box(ctx, sx - facing * swing * 9, y - Math.abs(swing) * 3, s * 0.8, s * 0.8, 0.34, shade(TROUSER, 0.85))
  box(ctx, sx + facing * swing * 9, y + Math.abs(swing) * 3, s * 0.85, s * 0.85, 0.08, BOOT)

  // Torso.
  box(ctx, sx, y, s * 1.25, s * 1.05, 0.42, TUNIC, { lift: 0.34 })
  // Belt.
  box(ctx, sx, y, s * 1.3, s * 1.1, 0.06, '#7a5a30', { lift: 0.36, outline: false })

  // Arms.
  const armLift = 0.4 + cheer * 0.28
  const armSwing = walking ? -swing : 0
  box(ctx, sx + HW * legOff, y + HH * legOff, s * 0.5, s * 0.5, 0.3 - cheer * 0.05, SKIN, {
    lift: armLift + armSwing * 0.12,
  })
  box(ctx, sx - HW * legOff, y - HH * legOff, s * 0.5, s * 0.5, 0.3 - cheer * 0.05, shade(SKIN, 0.9), {
    lift: armLift - armSwing * 0.12,
  })

  // Head + hair.
  box(ctx, sx, y, s * 1.05, s * 1.05, 0.34, SKIN, { lift: 0.76 })
  box(ctx, sx, y, s * 1.12, s * 1.12, 0.1, HAIR, { lift: 1.04 })
  box(ctx, sx, y - 1, s * 1.14, s * 0.4, 0.08, HAIR, { lift: 0.98, outline: false })

  // Eyes on the down-right face, so the hero reads as looking into the scene.
  ctx.fillStyle = '#20232e'
  const ey = y - (0.76 + 0.2) * BLOCK_H
  ctx.fillRect(sx + 3, ey + 2, 2.5, 3.5)
  ctx.fillRect(sx + 9, ey + 5, 2.5, 3.5)
}

/* --------------------------------------------------------------------- Pip */

/**
 * Pip: a small lantern-spirit. Bobs, glows, trails embers, and is the only
 * character who carries memory across sessions — which is why the glow gets
 * warmer and brighter when Pip is speaking or remembering.
 */
export function drawPip(ctx, sx, sy, opts = {}) {
  const {
    phase = 0,
    mood = 'idle', // idle | happy | thinking | remember | worried
    motion = 1,
    particles = null,
  } = opts

  const bob = Math.sin(phase * 2.4) * 6 * motion
  const y = sy - 46 + bob
  const excited = mood === 'happy' || mood === 'remember'
  const pulse = 0.5 + 0.5 * Math.sin(phase * (excited ? 6 : 2.6))

  const glowColour = mood === 'remember' ? '#ffd0f0' : mood === 'worried' ? '#9ec6ff' : ACCENT.pip
  const radius = (mood === 'remember' ? 62 : 46) + pulse * 10 * motion

  Particles.glow(ctx, sx, y + 6, radius, glowColour, 0.34 + pulse * 0.14)

  if (particles && motion > 0 && Math.random() < (excited ? 0.5 : 0.16)) {
    particles.ember(sx, y + 10, glowColour)
  }

  // Cast a faint pool of light on the ground beneath.
  Particles.glow(ctx, sx, sy - 2, 34, glowColour, 0.14)

  // Lantern frame.
  const s = 0.15
  box(ctx, sx, y, s, s, 0.06, '#8a6a3a', { outline: false }) // base
  box(ctx, sx, y, s * 0.78, s * 0.78, 0.3, ACCENT.pipCore, {
    lift: 0.06,
    topShade: 1,
    leftShade: 0.92,
    rightShade: 0.98,
    outline: false,
  })
  box(ctx, sx, y, s, s, 0.06, '#8a6a3a', { lift: 0.36, outline: false }) // cap

  // Handle hoop.
  ctx.strokeStyle = '#8a6a3a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(sx, y - 0.44 * BLOCK_H, 7, Math.PI, 0)
  ctx.stroke()

  // Face on the core.
  const fy = y - 0.19 * BLOCK_H
  ctx.fillStyle = '#4a3a1a'
  if (mood === 'happy' || mood === 'remember') {
    ctx.beginPath()
    ctx.arc(sx - 5, fy, 2.6, Math.PI, 0, true)
    ctx.arc(sx + 5, fy, 2.6, Math.PI, 0, true)
    ctx.lineWidth = 1.8
    ctx.strokeStyle = '#4a3a1a'
    ctx.stroke()
  } else {
    ctx.fillRect(sx - 6, fy - 2, 2.6, 4)
    ctx.fillRect(sx + 4, fy - 2, 2.6, 4)
  }
  ctx.fillStyle = rgba('#e08a6a', 0.5)
  ctx.beginPath()
  ctx.arc(sx - 9, fy + 4, 2.4, 0, Math.PI * 2)
  ctx.arc(sx + 9, fy + 4, 2.4, 0, Math.PI * 2)
  ctx.fill()

  // Mouth.
  ctx.strokeStyle = '#4a3a1a'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  if (mood === 'worried') {
    ctx.arc(sx, fy + 9, 3.2, Math.PI * 1.15, Math.PI * 1.85)
  } else if (excited) {
    ctx.arc(sx, fy + 5, 4, 0.15 * Math.PI, 0.85 * Math.PI)
  } else {
    ctx.moveTo(sx - 3, fy + 7)
    ctx.lineTo(sx + 3, fy + 7)
  }
  ctx.stroke()

  // Memory sparkles — only when Pip is recalling. This is the pitch, visualised.
  if (mood === 'remember' && motion > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 5; i++) {
      const a = phase * 1.6 + (i / 5) * Math.PI * 2
      const r = 26 + Math.sin(phase * 3 + i) * 5
      const px = sx + Math.cos(a) * r
      const py = y + 6 + Math.sin(a) * r * 0.5
      ctx.fillStyle = rgba('#ffe6ff', 0.75)
      ctx.beginPath()
      ctx.arc(px, py, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

/* ------------------------------------------------------------- glitch golem */

/**
 * The boss. `health`/`maxHealth` drive the shield ring; `hurt` is a 0-1 flash
 * that decays after a hit; `defeat` is a 0-1 dissolve.
 */
export function drawGolem(ctx, sx, sy, opts = {}) {
  const {
    phase = 0,
    health = 3,
    maxHealth = 3,
    hurt = 0,
    defeat = 0,
    motion = 1,
    particles = null,
  } = opts

  if (defeat >= 1) return

  const alive = 1 - defeat
  const bob = Math.sin(phase * 1.6) * 5 * motion
  const body = hurt > 0.02 ? '#e6d4ff' : ACCENT.golem
  const jitter = motion > 0 ? (Math.random() - 0.5) * (2 + hurt * 8) : 0

  // The golem is drawn at tile scale then blown up about its feet — it has to
  // tower over the hero to read as the thing that broke the bridge.
  const SCALE = 1.75
  ctx.save()
  ctx.globalAlpha = alive
  ctx.translate(sx, sy)
  ctx.scale(SCALE, SCALE)
  ctx.translate(-sx, -sy)

  const y = sy + bob - defeat * 20

  shadow(ctx, sx, sy + 6, 46 * alive, 22 * alive, 0.38 * alive)

  Particles.glow(ctx, sx, y - 60, 110, hurt > 0.02 ? '#ffffff' : ACCENT.golem, 0.24 + hurt * 0.4)

  // Legs.
  box(ctx, sx - 14, y + 6, 0.24, 0.24, 0.5, shade(body, 0.8))
  box(ctx, sx + 14, y + 6, 0.24, 0.24, 0.5, shade(body, 0.72))

  // Torso: a stack of three slabs, each drifting slightly out of alignment.
  box(ctx, sx + jitter, y, 0.62, 0.55, 0.62, body, { lift: 0.5 })
  box(ctx, sx - jitter * 0.6, y, 0.7, 0.62, 0.5, shade(body, 1.06), { lift: 1.12 })
  box(ctx, sx + jitter * 0.4, y, 0.5, 0.46, 0.42, shade(body, 0.92), { lift: 1.62 })

  // Arms.
  box(ctx, sx - 34, y - 6, 0.2, 0.2, 0.8, shade(body, 0.78), { lift: 0.7 })
  box(ctx, sx + 34, y - 6, 0.2, 0.2, 0.8, shade(body, 0.86), { lift: 0.7 })

  // Head with a single scanning eye.
  const hy = y - 2.04 * BLOCK_H
  box(ctx, sx + jitter, y, 0.36, 0.34, 0.4, shade(body, 1.12), { lift: 2.04 })
  const eyeX = sx + jitter + Math.sin(phase * 1.1) * 5 * motion
  ctx.fillStyle = hurt > 0.02 ? '#ffffff' : '#ffe066'
  ctx.beginPath()
  ctx.ellipse(eyeX, hy - 12, 9, 5.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#2a1a4a'
  ctx.beginPath()
  ctx.ellipse(eyeX + 2, hy - 12, 3.4, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // Chromatic tear-lines across the body — the "glitch" of the Glitch Golem.
  if (motion > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) {
      const ly = y - (0.4 + Math.abs(Math.sin(phase * 0.9 + i * 2.1)) * 2.1) * BLOCK_H
      ctx.fillStyle = rgba(i === 0 ? '#ff5ea8' : i === 1 ? '#5eefff' : '#c9a0ff', 0.28)
      ctx.fillRect(sx - 52, ly, 104, 2.5)
    }
    ctx.restore()
  }

  // Shield ring: one orbiting rune per remaining question.
  for (let i = 0; i < maxHealth; i++) {
    const broken = i >= health
    const a = phase * 0.9 + (i / maxHealth) * Math.PI * 2
    const r = 66
    const px = sx + Math.cos(a) * r
    const py = y - 1.1 * BLOCK_H + Math.sin(a) * r * 0.42
    ctx.save()
    ctx.globalAlpha = alive * (broken ? 0.12 : 0.95)
    ctx.translate(px, py)
    ctx.rotate(a * 0.7)
    ctx.fillStyle = broken ? '#4a3a6a' : ACCENT.golemHot
    ctx.beginPath()
    ctx.moveTo(0, -11)
    ctx.lineTo(8, 0)
    ctx.lineTo(0, 11)
    ctx.lineTo(-8, 0)
    ctx.closePath()
    ctx.fill()
    if (!broken) {
      ctx.strokeStyle = rgba('#ffffff', 0.6)
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.restore()
  }

  ctx.restore()

  if (particles && hurt > 0.4 && Math.random() < 0.6) {
    particles.shards(sx + (Math.random() - 0.5) * 50, y - 40, { count: 2 })
  }
}

/* ------------------------------------------------------------------- props */

function drawTree(ctx, sx, sy, seed, phase, motion) {
  const sway = Math.sin(phase * 1.1 + seed) * 3 * motion
  const tall = seed % 3
  shadow(ctx, sx, sy, 26, 13, 0.3)
  box(ctx, sx, sy, 0.17, 0.17, 0.9 + tall * 0.2, '#6b4a2b')
  const ly = 0.85 + tall * 0.2
  box(ctx, sx + sway * 0.4, sy, 0.62, 0.62, 0.42, '#3f8f4e', { lift: ly })
  box(ctx, sx + sway * 0.7, sy, 0.46, 0.46, 0.4, '#4aa35b', { lift: ly + 0.42 })
  box(ctx, sx + sway, sy, 0.28, 0.28, 0.34, '#57b366', { lift: ly + 0.82 })
}

function drawRock(ctx, sx, sy, seed) {
  shadow(ctx, sx, sy, 18, 9, 0.26)
  box(ctx, sx - 4, sy + 2, 0.3, 0.28, 0.3, '#8792a6')
  box(ctx, sx + 6, sy - 2, 0.2, 0.2, 0.2, '#788496')
  if (seed % 2 === 0) box(ctx, sx + 1, sy + 5, 0.16, 0.16, 0.14, '#9aa5b8')
}

function drawTuft(ctx, sx, sy, seed, phase, motion) {
  const sway = Math.sin(phase * 2 + seed) * 2.4 * motion
  ctx.strokeStyle = '#4f9c46'
  ctx.lineWidth = 2
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath()
    ctx.moveTo(sx + i * 4, sy)
    ctx.quadraticCurveTo(sx + i * 4 + sway, sy - 8, sx + i * 5 + sway * 1.6, sy - 14)
    ctx.stroke()
  }
}

function drawFlower(ctx, sx, sy, seed, phase, motion) {
  const sway = Math.sin(phase * 1.7 + seed) * 2 * motion
  const colours = ['#f2c14e', '#ef6f8f', '#c9a0ff', '#ffffff']
  ctx.strokeStyle = '#4f9c46'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.quadraticCurveTo(sx + sway, sy - 7, sx + sway * 1.4, sy - 12)
  ctx.stroke()
  ctx.fillStyle = colours[seed % colours.length]
  ctx.beginPath()
  ctx.arc(sx + sway * 1.4, sy - 13, 3.2, 0, Math.PI * 2)
  ctx.fill()
}

function drawPost(ctx, sx, sy) {
  shadow(ctx, sx, sy, 12, 6, 0.24)
  box(ctx, sx, sy, 0.14, 0.14, 0.6, '#8a5a2b')
  box(ctx, sx, sy, 0.2, 0.2, 0.08, '#a06a35', { lift: 0.6 })
}

function drawSign(ctx, sx, sy) {
  shadow(ctx, sx, sy, 12, 6, 0.22)
  box(ctx, sx, sy, 0.08, 0.08, 0.5, '#7a5230')
  box(ctx, sx, sy, 0.42, 0.06, 0.28, '#c98f4e', { lift: 0.5 })
  ctx.fillStyle = rgba('#5a3b1e', 0.75)
  ctx.fillRect(sx - 13, sy - 0.72 * BLOCK_H, 20, 2)
  ctx.fillRect(sx - 13, sy - 0.64 * BLOCK_H, 14, 2)
}

function drawCrate(ctx, sx, sy) {
  shadow(ctx, sx, sy, 16, 8, 0.26)
  box(ctx, sx, sy, 0.32, 0.32, 0.5, '#b0763c')
  ctx.strokeStyle = rgba('#6b451f', 0.7)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sx - 22, sy - 12)
  ctx.lineTo(sx, sy)
  ctx.lineTo(sx + 22, sy - 12)
  ctx.stroke()
}

function drawFlame(ctx, sx, sy, phase, scale, motion, particles) {
  const f = motion > 0 ? Math.sin(phase * 11) * 0.16 + Math.sin(phase * 6.3) * 0.1 : 0
  const h = (16 + f * 8) * scale
  const w = (7 + f * 2) * scale

  Particles.glow(ctx, sx, sy - h * 0.4, 60 * scale, '#ffb04a', 0.4 + f * 0.12)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const grd = ctx.createLinearGradient(sx, sy, sx, sy - h)
  grd.addColorStop(0, rgba('#ff7a2a', 0.95))
  grd.addColorStop(0.55, rgba('#ffc248', 0.9))
  grd.addColorStop(1, rgba('#fff2c0', 0.2))
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.moveTo(sx - w, sy)
  ctx.quadraticCurveTo(sx - w * 0.7, sy - h * 0.6, sx, sy - h)
  ctx.quadraticCurveTo(sx + w * 0.7, sy - h * 0.6, sx + w, sy)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  if (particles && motion > 0 && Math.random() < 0.3) {
    particles.ember(sx, sy - h * 0.7, '#ffb04a')
  }
}

function drawCampfire(ctx, sx, sy, phase, motion, particles) {
  shadow(ctx, sx, sy, 24, 12, 0.3)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI
    box(ctx, sx + Math.cos(a) * 9, sy + Math.sin(a) * 5, 0.26, 0.07, 0.1, '#6b451f')
  }
  box(ctx, sx, sy, 0.16, 0.16, 0.06, '#3a2a1a', { lift: 0.1, outline: false })
  drawFlame(ctx, sx, sy - 4, phase, 1.5, motion, particles)
}

function drawTorch(ctx, sx, sy, phase, motion, particles) {
  shadow(ctx, sx, sy, 10, 5, 0.2)
  box(ctx, sx, sy, 0.07, 0.07, 0.85, '#6b451f')
  drawFlame(ctx, sx, sy - 0.9 * BLOCK_H, phase, 1, motion, particles)
}

function drawCrystal(ctx, sx, sy, seed, phase, motion) {
  const pulse = 0.5 + 0.5 * Math.sin(phase * 2.2 + seed) * motion
  shadow(ctx, sx, sy, 16, 8, 0.3)
  Particles.glow(ctx, sx, sy - 24, 54, ACCENT.golem, 0.2 + pulse * 0.22)
  ctx.save()
  ctx.fillStyle = rgba(ACCENT.golemHot, 0.9)
  ctx.strokeStyle = rgba('#ffffff', 0.4)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(sx, sy - 44 - pulse * 4)
  ctx.lineTo(sx + 11, sy - 20)
  ctx.lineTo(sx, sy - 2)
  ctx.lineTo(sx - 11, sy - 20)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function drawRubble(ctx, sx, sy, seed) {
  shadow(ctx, sx, sy, 20, 10, 0.24)
  box(ctx, sx - 8, sy + 3, 0.2, 0.2, 0.16, '#5b6478')
  box(ctx, sx + 7, sy - 1, 0.16, 0.16, 0.24, '#4a5266')
  if (seed % 2) box(ctx, sx, sy + 7, 0.12, 0.12, 0.1, '#6f7a8c')
}

const PROP_DRAW = {
  tree: (ctx, sx, sy, p, phase, motion) => drawTree(ctx, sx, sy, p.seed, phase, motion),
  rock: (ctx, sx, sy, p) => drawRock(ctx, sx, sy, p.seed),
  tuft: (ctx, sx, sy, p, phase, motion) => drawTuft(ctx, sx, sy, p.seed, phase, motion),
  flower: (ctx, sx, sy, p, phase, motion) => drawFlower(ctx, sx, sy, p.seed, phase, motion),
  post: (ctx, sx, sy) => drawPost(ctx, sx, sy),
  sign: (ctx, sx, sy) => drawSign(ctx, sx, sy),
  crate: (ctx, sx, sy) => drawCrate(ctx, sx, sy),
  campfire: (ctx, sx, sy, p, phase, motion, parts) => drawCampfire(ctx, sx, sy, phase, motion, parts),
  torch: (ctx, sx, sy, p, phase, motion, parts) => drawTorch(ctx, sx, sy, phase, motion, parts),
  crystal: (ctx, sx, sy, p, phase, motion) => drawCrystal(ctx, sx, sy, p.seed, phase, motion),
  rubble: (ctx, sx, sy, p) => drawRubble(ctx, sx, sy, p.seed),
}

export function drawProp(ctx, prop, sx, sy, phase, motion, particles) {
  const fn = PROP_DRAW[prop.type]
  if (fn) fn(ctx, sx, sy, prop, phase, motion, particles)
}

/** Props that emit light — the scene queries these for the night light pass. */
export const LIGHT_PROPS = new Set(['campfire', 'torch', 'crystal'])
