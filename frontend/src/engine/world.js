/**
 * Scene definitions — the terrain, props and build targets for each quest.
 *
 * Everything here is generated from a fixed seed, so the world is identical on
 * every run (which matters: the demo is performed live, twice, side by side).
 *
 * Build-slot geometry is carried over from the old CSS IsoGrid so the number of
 * blocks a quest needs still lines up with the number of questions it asks.
 */

export const COLS = 13
export const ROWS = 11

/* ------------------------------------------------------------------- noise */

function hash2(x, y, seed = 0) {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 2246822519, 3266489917) ^ seed
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise — enough relief to break up a flat plane, no more. */
function noise2(x, y, scale, seed) {
  const fx = x / scale
  const fy = y / scale
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const a = hash2(x0, y0, seed)
  const b = hash2(x0 + 1, y0, seed)
  const c = hash2(x0, y0 + 1, seed)
  const d = hash2(x0 + 1, y0 + 1, seed)
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy
}

/* --------------------------------------------------------------- quest one */

/** The river cuts these columns. Blocks laid here bridge the gap. */
const RIVER_COLS = [5, 6]
/** The row the hero crosses on. */
const CROSS_ROW = 5

function questOne() {
  const tiles = []
  const props = []

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const isRiver = RIVER_COLS.includes(x)
      const isBank = x === 4 || x === 7

      if (isRiver) {
        tiles.push({ x, y, h: -2, mat: 'sand', water: true, waterTop: -1 })
        continue
      }

      const n = noise2(x, y, 4.2, 11)
      let h = 0
      if (!isBank) {
        if (n > 0.78) h = 1
        if (n > 0.93) h = 2
      }
      // Far edges rise into low hills so the world has a horizon, not an edge.
      if (x === 0 || y === 0 || y === ROWS - 1 || x === COLS - 1) h = Math.max(h, 1)
      if (y === CROSS_ROW) h = 0 // keep the path clear

      tiles.push({ x, y, h, mat: h >= 2 ? 'stone' : 'grass' })
    }
  }

  // Trees away from the path and the river banks.
  const treeSpots = [
    [1, 1], [2, 8], [0, 4], [10, 1], [11, 8], [9, 9], [2, 2], [11, 3],
  ]
  for (const [x, y] of treeSpots) {
    const t = tiles.find((c) => c.x === x && c.y === y)
    if (t) props.push({ type: 'tree', x, y, z: t.h, seed: x * 31 + y })
  }

  const rockSpots = [[3, 2], [8, 7], [3, 8], [8, 2], [10, 5]]
  for (const [x, y] of rockSpots) {
    const t = tiles.find((c) => c.x === x && c.y === y)
    if (t) props.push({ type: 'rock', x, y, z: t.h, seed: x * 17 + y })
  }

  // Broken bridge stumps on each bank — shows what used to be here.
  props.push({ type: 'post', x: 4, y: CROSS_ROW, z: 0, seed: 3 })
  props.push({ type: 'post', x: 7, y: CROSS_ROW, z: 0, seed: 5 })
  props.push({ type: 'sign', x: 3, y: CROSS_ROW - 1, z: 0, seed: 9 })

  // Flowers and tufts scattered on the near bank for life.
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (RIVER_COLS.includes(x)) continue
      const t = tiles.find((c) => c.x === x && c.y === y)
      if (!t || t.mat !== 'grass') continue
      const r = hash2(x, y, 77)
      if (r > 0.86) props.push({ type: 'tuft', x, y, z: t.h, seed: x * 13 + y })
      else if (r > 0.83) props.push({ type: 'flower', x, y, z: t.h, seed: x * 7 + y })
    }
  }

  // Six slots, laid nearest-row-first so the crossing completes visibly last.
  const buildSlots = []
  for (const y of [CROSS_ROW, CROSS_ROW - 1, CROSS_ROW + 1]) {
    for (const x of RIVER_COLS) buildSlots.push({ x, y, z: 0, mat: 'plank' })
  }

  return {
    id: 1,
    tiles,
    props,
    buildSlots,
    hero: { x: 3, y: CROSS_ROW, z: 0 },
    heroEnd: { x: 8, y: CROSS_ROW, z: 0 },
    gradeFrom: 'morning',
    gradeTo: 'noon',
    ambient: 'day',
    materials: ['grass', 'stone', 'sand', 'plank', 'wood', 'leaf', 'dirt'],
  }
}

/* --------------------------------------------------------------- quest two */

/** The shelter footprint: walls rise around a 3x3 clearing. */
const SHELTER_WALLS = [
  { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 },
  { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 7, y: 6 },
  { x: 5, y: 5 }, { x: 7, y: 5 },
]

function questTwo() {
  const tiles = []
  const props = []

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const n = noise2(x, y, 3.8, 23)
      let h = n > 0.8 ? 1 : 0
      if (x === 0 || y === 0 || y === ROWS - 1 || x === COLS - 1) h = Math.max(h, 1)

      // Flat, cleared ground where the shelter goes.
      const inSite = x >= 4 && x <= 8 && y >= 3 && y <= 7
      if (inSite) h = 0

      const mat = inSite ? (x >= 5 && x <= 7 && y >= 4 && y <= 6 ? 'dirt' : 'grassDry') : 'grass'
      tiles.push({ x, y, h, mat })
    }
  }

  // A dense treeline ringing the clearing — dusk needs silhouettes.
  const treeSpots = [
    [1, 1], [2, 3], [1, 7], [3, 9], [0, 5], [2, 0],
    [11, 2], [10, 8], [12, 5], [9, 0], [11, 9], [10, 4],
    [6, 0], [4, 0], [7, 10], [5, 10],
  ]
  for (const [x, y] of treeSpots) {
    const t = tiles.find((c) => c.x === x && c.y === y)
    if (t) props.push({ type: 'tree', x, y, z: t.h, seed: x * 29 + y * 3 })
  }

  props.push({ type: 'campfire', x: 6, y: 5, z: 0, seed: 1 })
  props.push({ type: 'rock', x: 4, y: 7, z: 0, seed: 4 })
  props.push({ type: 'rock', x: 8, y: 3, z: 0, seed: 6 })
  props.push({ type: 'torch', x: 4, y: 4, z: 0, seed: 2 })
  props.push({ type: 'torch', x: 8, y: 6, z: 0, seed: 8 })
  props.push({ type: 'crate', x: 8, y: 7, z: 0, seed: 12 })

  // Two courses of walls: 8 positions x 2 levels = 16 slots. The site is
  // levelled to h=0, whose top face is at z=0, so the first course sits at z=1.
  const buildSlots = []
  for (let z = 1; z <= 2; z++) {
    for (const w of SHELTER_WALLS) buildSlots.push({ ...w, z, mat: 'wood' })
  }

  return {
    id: 2,
    tiles,
    props,
    buildSlots,
    hero: { x: 6, y: 8, z: 0 },
    heroEnd: { x: 6, y: 5, z: 0 },
    gradeFrom: 'dusk',
    gradeTo: 'night',
    ambient: 'dusk',
    materials: ['grass', 'grassDry', 'dirt', 'wood', 'stone', 'leaf', 'plank'],
  }
}

/* ------------------------------------------------------------- quest three */

function questThree() {
  const tiles = []
  const props = []

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const edge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1
      const n = noise2(x, y, 3, 41)
      const arena = x >= 2 && x <= 10 && y >= 2 && y <= 8

      let h = 0
      let mat = 'darkstone'
      if (edge) {
        h = 2
        mat = 'cobble'
      } else if (!arena) {
        h = n > 0.6 ? 1 : 0
        mat = 'cobble'
      } else {
        // A checkered arena floor, the one place the old scene got it right.
        mat = (x + y) % 2 === 0 ? 'darkstone' : 'cobble'
      }
      tiles.push({ x, y, h, mat })
    }
  }

  // Glitch crystals pulse around the arena rim.
  const crystals = [[2, 2], [10, 2], [2, 8], [10, 8], [6, 1], [6, 9]]
  for (const [x, y] of crystals) {
    const t = tiles.find((c) => c.x === x && c.y === y)
    if (t) props.push({ type: 'crystal', x, y, z: t.h, seed: x * 19 + y })
  }
  props.push({ type: 'torch', x: 3, y: 3, z: 0, seed: 21 })
  props.push({ type: 'torch', x: 9, y: 7, z: 0, seed: 22 })
  props.push({ type: 'rubble', x: 4, y: 7, z: 0, seed: 31 })
  props.push({ type: 'rubble', x: 8, y: 3, z: 0, seed: 33 })

  return {
    id: 3,
    tiles,
    props,
    buildSlots: [],
    hero: { x: 3, y: 5, z: 0 },
    heroEnd: { x: 5, y: 5, z: 0 },
    boss: { x: 9, y: 5, z: 0 },
    gradeFrom: 'storm',
    gradeTo: 'storm',
    ambient: 'storm',
    materials: ['darkstone', 'cobble', 'stone', 'glitch'],
  }
}

/* ------------------------------------------------------------------ public */

const BUILDERS = { 1: questOne, 2: questTwo, 3: questThree }

const cache = new Map()

export function getScene(questId) {
  let s = cache.get(questId)
  if (!s) {
    s = (BUILDERS[questId] ?? questOne)()
    // O(1) height lookups during movement and neighbour tests. Bounds-checked:
    // edge tiles ask about neighbours that don't exist.
    s.tileAt = (x, y) =>
      x < 0 || y < 0 || x >= COLS || y >= ROWS ? undefined : s.tiles[y * COLS + x]
    cache.set(questId, s)
  }
  return s
}

/**
 * The z a character standing on (x, y) rests at.
 *
 * A terrain cube of height h has its top face at z = h, and sprites draw upward
 * from the point they're given, so standing on it means z = h exactly. Water
 * tiles report the level a bridge deck would sit at — the only time anyone
 * walks over water here is after the bridge is built.
 */
export function groundHeight(scene, x, y) {
  const t = scene.tileAt(Math.round(x), Math.round(y))
  if (!t) return 0
  return t.water ? t.waterTop + 1 : t.h
}

export { RIVER_COLS, CROSS_ROW, SHELTER_WALLS, hash2 }
