/**
 * Sound, synthesized. No asset files — every cue is a few oscillators and an
 * envelope, which keeps the repo dependency-free and the bundle unchanged.
 *
 * The AudioContext is created lazily on the first user gesture; browsers block
 * it before then. Everything is a no-op until `unlock()` has run, and muting
 * (or low-stim mode) silences the bus without tearing the context down.
 */

let ctx = null
let master = null
let muted = false
let unlocked = false

function ensure() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = muted ? 0 : 0.34
  master.connect(ctx.destination)
  return ctx
}

/** Call from a click handler. Safe to call repeatedly. */
export function unlock() {
  const c = ensure()
  if (!c) return
  if (c.state === 'suspended') c.resume()
  unlocked = true
}

export function setMuted(value) {
  muted = value
  if (master) {
    master.gain.setTargetAtTime(muted ? 0 : 0.34, ctx.currentTime, 0.02)
  }
}

export function isMuted() {
  return muted
}

/* ------------------------------------------------------------------ voices */

/** One enveloped oscillator. The building block for everything below. */
function tone({
  freq = 440,
  type = 'sine',
  dur = 0.2,
  gain = 0.3,
  attack = 0.005,
  delay = 0,
  sweepTo = null,
  detune = 0,
}) {
  if (!unlocked || muted) return
  const c = ensure()
  if (!c) return

  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  osc.detune.value = detune
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur)

  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  osc.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** Filtered noise burst — impacts, dust, thuds. */
function noise({ dur = 0.18, gain = 0.25, freq = 900, q = 1, delay = 0, sweepTo = null }) {
  if (!unlocked || muted) return
  const c = ensure()
  if (!c) return

  const t0 = c.currentTime + delay
  const frames = Math.ceil(c.sampleRate * dur)
  const buf = c.createBuffer(1, frames, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1

  const src = c.createBufferSource()
  src.buffer = buf

  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(freq, t0)
  filter.Q.value = q
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur)

  const g = c.createGain()
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  src.connect(filter)
  filter.connect(g)
  g.connect(master)
  src.start(t0)
}

/* -------------------------------------------------------------------- cues */

export const sfx = {
  /** UI: hovering / selecting an answer. */
  click() {
    tone({ freq: 620, type: 'triangle', dur: 0.07, gain: 0.16 })
  },

  /** A block landing in the world. Woody, with a dust tail. */
  thunk(index = 0) {
    const base = 150 + index * 14
    tone({ freq: base, type: 'sine', dur: 0.16, gain: 0.32, sweepTo: base * 0.55 })
    noise({ dur: 0.13, gain: 0.16, freq: 1500, q: 0.8, sweepTo: 500 })
  },

  /** Correct answer: a rising major triad. */
  correct() {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.32, gain: 0.2, delay: i * 0.055 }),
    )
  },

  /**
   * Wrong answer. Deliberately soft and low — this game never punishes a
   * mistake, and the sound shouldn't either.
   */
  wrong() {
    tone({ freq: 300, type: 'sine', dur: 0.28, gain: 0.2, sweepTo: 190 })
    noise({ dur: 0.14, gain: 0.07, freq: 400, q: 1.4 })
  },

  /** Pip speaking — a short warm blip per line. */
  pip() {
    tone({ freq: 880, type: 'sine', dur: 0.09, gain: 0.13 })
    tone({ freq: 1320, type: 'sine', dur: 0.07, gain: 0.08, delay: 0.06 })
  },

  /** Pip remembering you. Shimmering, and it should feel like a reunion. */
  remember() {
    const notes = [659.25, 987.77, 1318.5, 1567.98]
    notes.forEach((f, i) =>
      tone({ freq: f, type: 'sine', dur: 0.7, gain: 0.14, delay: i * 0.09, attack: 0.04 }),
    )
  },

  /** Quest cleared. */
  fanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]
    notes.forEach((f, i) =>
      tone({ freq: f, type: 'square', dur: 0.4, gain: 0.11, delay: i * 0.085 }),
    )
    notes.forEach((f, i) =>
      tone({ freq: f / 2, type: 'triangle', dur: 0.5, gain: 0.12, delay: i * 0.085 }),
    )
  },

  /** A shield breaking on the Glitch Golem. */
  golemHit() {
    tone({ freq: 220, type: 'sawtooth', dur: 0.22, gain: 0.22, sweepTo: 90 })
    noise({ dur: 0.3, gain: 0.24, freq: 2600, q: 0.6, sweepTo: 300 })
    tone({ freq: 1400, type: 'square', dur: 0.1, gain: 0.08, sweepTo: 600 })
  },

  /** The golem falling apart. */
  golemDefeat() {
    tone({ freq: 180, type: 'sawtooth', dur: 1.1, gain: 0.24, sweepTo: 45 })
    noise({ dur: 0.9, gain: 0.28, freq: 1800, q: 0.4, sweepTo: 120 })
    ;[523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.6, gain: 0.13, delay: 0.5 + i * 0.07 }),
    )
  },

  /** The reveal card landing on the cost number. */
  reveal() {
    ;[392, 523.25, 659.25, 783.99].forEach((f, i) =>
      tone({ freq: f, type: 'sine', dur: 1.1, gain: 0.14, delay: i * 0.12, attack: 0.05 }),
    )
  },
}

export default sfx
