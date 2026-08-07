/**
 * Scene camera: a pan/zoom transform plus the impact effects that give the
 * world weight — a slow idle drift so a static scene never feels dead, an eased
 * pan between quests, and punch/shake on hits.
 */

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

export default class Camera {
  constructor() {
    this.x = 0
    this.y = 0
    this.zoom = 1

    this.targetX = 0
    this.targetY = 0
    this.targetZoom = 1

    // Eased pan between quest scenes.
    this.pan = null

    // Impact.
    this.shakeAmp = 0
    this.shakeDecay = 4
    this.punch = 0

    this.t = 0
    this.idle = true
  }

  /** Snap to a position without animating — used when a scene first mounts. */
  place(x, y, zoom = 1) {
    this.x = this.targetX = x
    this.y = this.targetY = y
    this.zoom = this.targetZoom = zoom
    this.pan = null
  }

  /** Ease to a new framing over `duration` seconds. */
  panTo(x, y, zoom = this.targetZoom, duration = 1.1) {
    this.pan = {
      fromX: this.x,
      fromY: this.y,
      fromZoom: this.zoom,
      toX: x,
      toY: y,
      toZoom: zoom,
      t: 0,
      duration,
    }
    this.targetX = x
    this.targetY = y
    this.targetZoom = zoom
  }

  shake(amp = 10, decay = 4) {
    this.shakeAmp = Math.max(this.shakeAmp, amp)
    this.shakeDecay = decay
  }

  /** A brief zoom-in kick. Reads as a hit landing. */
  punchIn(amount = 0.06) {
    this.punch = Math.max(this.punch, amount)
  }

  update(dt) {
    this.t += dt

    if (this.pan) {
      this.pan.t += dt
      const k = Math.min(1, this.pan.t / this.pan.duration)
      const e = easeInOut(k)
      this.x = this.pan.fromX + (this.pan.toX - this.pan.fromX) * e
      this.y = this.pan.fromY + (this.pan.toY - this.pan.fromY) * e
      this.zoom = this.pan.fromZoom + (this.pan.toZoom - this.pan.fromZoom) * e
      if (k >= 1) this.pan = null
    } else {
      // Critically-damped follow, so external target nudges feel smooth.
      const k = 1 - Math.exp(-6 * dt)
      this.x += (this.targetX - this.x) * k
      this.y += (this.targetY - this.y) * k
      this.zoom += (this.targetZoom - this.zoom) * k
    }

    if (this.shakeAmp > 0) {
      this.shakeAmp = Math.max(0, this.shakeAmp - this.shakeDecay * dt * this.shakeAmp - 0.4 * dt)
    }
    if (this.punch > 0) this.punch = Math.max(0, this.punch - dt * 0.35)
  }

  /**
   * Apply the camera to a context already translated to the viewport centre.
   * `motion` is 0 in low-stim mode, which kills drift, shake and punch.
   */
  apply(ctx, viewW, viewH, motion = 1) {
    const driftX = this.idle ? Math.sin(this.t * 0.21) * 7 * motion : 0
    const driftY = this.idle ? Math.cos(this.t * 0.17) * 4 * motion : 0

    let sx = 0
    let sy = 0
    if (this.shakeAmp > 0.01 && motion > 0) {
      const a = this.shakeAmp * motion
      sx = (Math.random() * 2 - 1) * a
      sy = (Math.random() * 2 - 1) * a
    }

    const zoom = this.zoom * (1 + this.punch * motion)

    ctx.translate(viewW / 2 + sx + driftX, viewH / 2 + sy + driftY)
    ctx.scale(zoom, zoom)
    ctx.translate(-this.x, -this.y)
  }
}
