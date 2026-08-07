/**
 * Particles. One flat pool, drawn in world space so they sort with the scene.
 *
 * Every emitter here exists to sell a specific beat: dust when a block lands,
 * sparks when an answer is right, embers trailing Pip, shards when the golem
 * takes a hit, fireflies once night falls.
 */

import { rgba } from './palette'

const GRAVITY = 240

export default class Particles {
  constructor(max = 420) {
    this.max = max
    this.items = []
  }

  clear() {
    this.items.length = 0
  }

  spawn(p) {
    if (this.items.length >= this.max) this.items.shift()
    this.items.push({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 1,
      maxLife: 1,
      size: 3,
      colour: '#ffffff',
      gravity: 0,
      drag: 0,
      shape: 'rect',
      spin: 0,
      angle: 0,
      glow: false,
      ...p,
    })
  }

  /** Soft dust ring — a block landing, a footfall. */
  dust(sx, sy, opts = {}) {
    const n = opts.count ?? 12
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5
      const speed = 30 + Math.random() * 55
      this.spawn({
        x: sx,
        y: sy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.42 - 18,
        life: 0.5 + Math.random() * 0.35,
        maxLife: 0.85,
        size: 2 + Math.random() * 3.5,
        colour: opts.colour ?? '#cbb79a',
        gravity: 70,
        drag: 2.4,
        shape: 'circle',
      })
    }
  }

  /** Upward burst of warm sparks — a correct answer, a quest completing. */
  sparkle(sx, sy, opts = {}) {
    const n = opts.count ?? 18
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2
      const speed = 60 + Math.random() * 140
      this.spawn({
        x: sx,
        y: sy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.6 + Math.random() * 0.6,
        maxLife: 1.2,
        size: 2 + Math.random() * 3,
        colour: opts.colour ?? '#ffd98a',
        gravity: GRAVITY * 0.5,
        drag: 0.8,
        shape: 'spark',
        glow: true,
      })
    }
  }

  /** Angular debris — golem hits, breaking blocks. */
  shards(sx, sy, opts = {}) {
    const n = opts.count ?? 14
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const speed = 70 + Math.random() * 190
      this.spawn({
        x: sx,
        y: sy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.7 - 60,
        life: 0.7 + Math.random() * 0.7,
        maxLife: 1.4,
        size: 3 + Math.random() * 5,
        colour: opts.colour ?? '#a77bff',
        gravity: GRAVITY,
        drag: 0.5,
        shape: 'shard',
        spin: (Math.random() - 0.5) * 14,
        angle: Math.random() * Math.PI,
        glow: true,
      })
    }
  }

  /** A single slow ember. Pip trails these constantly. */
  ember(sx, sy, colour = '#ffd98a') {
    this.spawn({
      x: sx + (Math.random() - 0.5) * 10,
      y: sy + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 12,
      vy: -14 - Math.random() * 16,
      life: 0.9 + Math.random() * 0.8,
      maxLife: 1.7,
      size: 1.5 + Math.random() * 2,
      colour,
      gravity: -6,
      drag: 0.9,
      shape: 'circle',
      glow: true,
    })
  }

  /** Rising motes for the sky at night. Long-lived, barely moving. */
  firefly(sx, sy) {
    this.spawn({
      x: sx,
      y: sy,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 10,
      life: 3 + Math.random() * 3,
      maxLife: 6,
      size: 1.6 + Math.random() * 1.4,
      colour: '#c8ff9a',
      gravity: 0,
      drag: 0.2,
      shape: 'firefly',
      glow: true,
    })
  }

  update(dt) {
    const items = this.items
    for (let i = items.length - 1; i >= 0; i--) {
      const p = items[i]
      p.life -= dt
      if (p.life <= 0) {
        items.splice(i, 1)
        continue
      }
      p.vy += p.gravity * dt
      if (p.drag) {
        const d = Math.exp(-p.drag * dt)
        p.vx *= d
        p.vy *= d
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.angle += p.spin * dt
    }
  }

  draw(ctx) {
    for (const p of this.items) {
      const t = Math.max(0, Math.min(1, p.life / p.maxLife))
      const alpha = p.shape === 'firefly' ? (0.35 + 0.65 * Math.sin(p.life * 4)) * t : t

      ctx.save()
      if (p.glow) ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = Math.max(0, alpha)
      ctx.fillStyle = p.colour

      switch (p.shape) {
        case 'circle':
        case 'firefly': {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * (0.5 + t * 0.5), 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'spark': {
          // Stretch along the velocity vector so fast sparks read as streaks.
          const len = Math.min(14, Math.hypot(p.vx, p.vy) * 0.045)
          ctx.translate(p.x, p.y)
          ctx.rotate(Math.atan2(p.vy, p.vx))
          ctx.fillRect(-len, -p.size * 0.3, len * 2, p.size * 0.6)
          break
        }
        case 'shard': {
          ctx.translate(p.x, p.y)
          ctx.rotate(p.angle)
          const s = p.size * (0.4 + t * 0.6)
          ctx.beginPath()
          ctx.moveTo(0, -s)
          ctx.lineTo(s * 0.7, 0)
          ctx.lineTo(0, s)
          ctx.lineTo(-s * 0.7, 0)
          ctx.closePath()
          ctx.fill()
          break
        }
        default:
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      }
      ctx.restore()
    }
  }

  /** Soft radial glow, used by lantern/torch light. Not pooled — drawn direct. */
  static glow(ctx, sx, sy, radius, colour, strength = 0.5) {
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius)
    g.addColorStop(0, rgba(colour, strength))
    g.addColorStop(0.45, rgba(colour, strength * 0.35))
    g.addColorStop(1, rgba(colour, 0))
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(sx, sy, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}
