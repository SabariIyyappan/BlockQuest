/**
 * Colour for the voxel world.
 *
 * Two independent layers:
 *
 *  1. MATERIALS — baked once into cube sprites (textures.js) under neutral
 *     daylight. Each material gives the three visible faces different values so
 *     a cube reads as solid from a single light direction (up-left).
 *
 *  2. GRADES — a per-frame colour grade applied over the whole scene for
 *     time of day. Keeping this separate means dawn->dusk->storm is a cheap
 *     full-screen composite instead of a texture rebake.
 */

/* ------------------------------------------------------------------ colour */

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Multiply a hex colour's value. amount > 1 lightens, < 1 darkens. */
export function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex({ r: r * amount, g: g * amount, b: b * amount })
}

/** Blend two hex colours. t=0 -> a, t=1 -> b. */
export function mix(a, b, t) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex({
    r: A.r + (B.r - A.r) * t,
    g: A.g + (B.g - A.g) * t,
    b: A.b + (B.b - A.b) * t,
  })
}

export function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/* --------------------------------------------------------------- materials */

/**
 * `base` is the top-face colour under full light. Side faces are derived so
 * every material catches the light identically — that consistency is most of
 * what makes a voxel scene read as one solid world.
 */
const LEFT = 0.72 // faces down-left, in shadow
const RIGHT = 0.86 // faces down-right, catches some sky

function material(base, opts = {}) {
  return {
    top: opts.top ?? base,
    left: opts.left ?? shade(base, LEFT),
    right: opts.right ?? shade(base, RIGHT),
    /** speckle: [colour, density 0-1, size px] — baked grain on the top face */
    speckle: opts.speckle ?? [shade(base, 0.88), 0.1, 2],
    /** grain: vertical streaks on the side faces (wood, stone strata) */
    grain: opts.grain ?? null,
    /** jitter: per-instance value variation, keeps large fields from flattening */
    jitter: opts.jitter ?? 0.05,
    edge: opts.edge ?? shade(base, 0.6),
  }
}

export const MATERIALS = {
  grass: material('#5ba846', {
    left: shade('#4a7c3a', LEFT + 0.06),
    right: shade('#54903f', RIGHT),
    speckle: ['#6fbe55', 0.16, 2],
    jitter: 0.07,
  }),
  grassDry: material('#93a350', {
    speckle: ['#b8bd6a', 0.14, 2],
  }),
  dirt: material('#8a6242', {
    speckle: ['#9c7350', 0.14, 2],
    grain: ['#6f4c33', 0.35],
  }),
  sand: material('#d8c184', { speckle: ['#e6d29a', 0.18, 2], jitter: 0.04 }),
  stone: material('#8792a6', {
    speckle: ['#9aa5b8', 0.12, 3],
    grain: ['#6d7789', 0.3],
    jitter: 0.06,
  }),
  cobble: material('#6f7a8c', {
    speckle: ['#59626f', 0.28, 3],
    grain: ['#59626f', 0.4],
    jitter: 0.08,
  }),
  wood: material('#b0763c', {
    speckle: ['#c08a4c', 0.1, 2],
    grain: ['#8a5a2b', 0.55],
    jitter: 0.06,
  }),
  plank: material('#c98f4e', {
    speckle: ['#d9a163', 0.08, 2],
    grain: ['#9c6a34', 0.45],
    jitter: 0.04,
  }),
  leaf: material('#3f8f4e', {
    speckle: ['#57ab63', 0.3, 3],
    jitter: 0.1,
  }),
  darkstone: material('#4a5266', {
    speckle: ['#5b6478', 0.16, 3],
    grain: ['#3a4154', 0.4],
  }),
  glitch: material('#7c4dd6', {
    speckle: ['#a77bff', 0.22, 3],
    grain: ['#5a32a8', 0.4],
    jitter: 0.12,
  }),
  gold: material('#f0c14e', {
    speckle: ['#ffe08a', 0.2, 2],
  }),
  snow: material('#e8eef6', { speckle: ['#ffffff', 0.2, 2], jitter: 0.03 }),
}

/* ------------------------------------------------------------------ grades */

/**
 * A lighting profile. `sky` is the backdrop gradient (top -> horizon), `tint`
 * multiplies the whole scene, `bloom` is an additive warm/cool wash, and
 * `vignette` darkens the frame edges.
 */
export const GRADES = {
  morning: {
    sky: ['#5aa9e6', '#a8d8f0', '#dcefc8'],
    tint: '#fff4e0',
    tintAmount: 0.1,
    bloom: '#ffd9a0',
    bloomAmount: 0.06,
    vignette: 0.24,
    ambient: '#ffe9c4',
    fog: '#cfe8f5',
    star: 0,
  },
  noon: {
    sky: ['#3f92dd', '#8fc9ee', '#d6ecd0'],
    tint: '#ffffff',
    tintAmount: 0,
    bloom: '#ffffff',
    bloomAmount: 0.03,
    vignette: 0.2,
    ambient: '#ffffff',
    fog: '#d8ecf7',
    star: 0,
  },
  dusk: {
    sky: ['#3b3570', '#a9557a', '#f0a35e'],
    tint: '#ffb27a',
    tintAmount: 0.26,
    bloom: '#ff9d5c',
    bloomAmount: 0.12,
    vignette: 0.38,
    ambient: '#ffb478',
    fog: '#a8709a',
    star: 0.25,
  },
  night: {
    sky: ['#0b1030', '#1b2455', '#2f3d74'],
    tint: '#5f74c4',
    tintAmount: 0.5,
    bloom: '#2a3a80',
    bloomAmount: 0.14,
    vignette: 0.58,
    ambient: '#7f92d8',
    fog: '#2b3766',
    star: 1,
  },
  storm: {
    sky: ['#120d24', '#2a1c4a', '#4a2f6b'],
    tint: '#8a6fd0',
    tintAmount: 0.44,
    bloom: '#5b2fb0',
    bloomAmount: 0.16,
    vignette: 0.62,
    ambient: '#a98bf0',
    fog: '#3a2560',
    star: 0.4,
  },
  victory: {
    sky: ['#2f6fd0', '#8fd0f0', '#ffe6b0'],
    tint: '#fff0cf',
    tintAmount: 0.12,
    bloom: '#ffd27a',
    bloomAmount: 0.16,
    vignette: 0.18,
    ambient: '#fff2d0',
    fog: '#d8ecf7',
    star: 0,
  },
}

/** Interpolate between two grades. Time of day is a continuous value. */
export function lerpGrade(a, b, t) {
  const A = GRADES[a] ?? GRADES.noon
  const B = GRADES[b] ?? GRADES.noon
  const n = (k) => A[k] + (B[k] - A[k]) * t
  const c = (k) => mix(A[k], B[k], t)
  return {
    sky: [mix(A.sky[0], B.sky[0], t), mix(A.sky[1], B.sky[1], t), mix(A.sky[2], B.sky[2], t)],
    tint: c('tint'),
    tintAmount: n('tintAmount'),
    bloom: c('bloom'),
    bloomAmount: n('bloomAmount'),
    vignette: n('vignette'),
    ambient: c('ambient'),
    fog: c('fog'),
    star: n('star'),
  }
}

/** Low-stim mode: keep the scene readable but strip saturation and drama. */
export function flatten(grade) {
  return {
    ...grade,
    sky: ['#8aa3bd', '#a9bdd1', '#c8d6df'],
    tintAmount: grade.tintAmount * 0.25,
    bloomAmount: 0,
    vignette: 0.1,
    star: 0,
  }
}

/* ------------------------------------------------------------ misc accents */

export const ACCENT = {
  correct: '#3ecf6d',
  wrong: '#f0605a',
  gold: '#f2c14e',
  pip: '#ffd98a',
  pipCore: '#fff6dd',
  golem: '#8b5cf6',
  golemHot: '#c4a0ff',
  water: '#2f6fb5',
  waterLight: '#5fa8e0',
  waterDeep: '#1d4a80',
  foam: '#dff0ff',
  ghost: '#ffffff',
}
