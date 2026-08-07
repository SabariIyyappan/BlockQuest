import { useMemo } from 'react'
import Tile from './Tile'
import Block from './Block'
import Character from './Character'
import BossScene from './BossScene'
import { gridOrigin, TILE_W } from './iso'
import { useGame } from '../state/GameContext'
import './IsoGrid.css'

const COLS = 9
const ROWS = 7
const CONTAINER_W = 620

/** Quest 1: a river cuts columns 4-5; blocks bridge it row by row. */
const RIVER_COLS = [4, 5]

/** Build slots per quest — where earned blocks land, in placement order. */
function buildSlots(questId) {
  if (questId === 1) {
    // Fill the river gap along the character's walking row first.
    const slots = []
    for (const y of [2, 3, 4]) {
      for (const x of RIVER_COLS) slots.push({ x, y, z: 0 })
    }
    return slots
  }

  if (questId === 2) {
    // Shelter walls rising around a 3x3 footprint.
    const slots = []
    const walls = [
      { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 },
      { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 },
      { x: 3, y: 3 }, { x: 5, y: 3 },
    ]
    for (let z = 0; z < 2; z++) {
      for (const w of walls) slots.push({ ...w, z })
    }
    return slots
  }

  return []
}

export default function IsoGrid() {
  const { currentQuest, placedBlocks, gamePhase, lastResult, PHASE } = useGame()

  const origin = useMemo(() => gridOrigin(COLS, ROWS, CONTAINER_W), [])
  const slots = useMemo(() => buildSlots(currentQuest), [currentQuest])

  const wrongShake = gamePhase === PHASE.FEEDBACK && lastResult && !lastResult.correct

  const tiles = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      let kind = 'grass'
      if (currentQuest === 1 && RIVER_COLS.includes(x)) kind = 'water'
      if (currentQuest === 3) kind = x % 2 === y % 2 ? 'stone' : 'grass'
      tiles.push(<Tile key={`${x}-${y}`} x={x} y={y} kind={kind} />)
    }
  }

  // Ghost outlines show what still needs building — the goal stays visible.
  const ghosts = slots
    .slice(placedBlocks.length)
    .filter((s) => s.z === 0)
    .map((s, i) => <Tile key={`ghost-${i}`} x={s.x} y={s.y} kind="ghost" />)

  const built = slots.slice(0, placedBlocks.length).map((s, i) => (
    <Block
      key={`b-${i}`}
      x={s.x}
      y={s.y}
      z={s.z}
      kind={currentQuest === 2 ? 'stone' : 'wood'}
      index={i % 4}
    />
  ))

  // Quest 1: once the bridge is whole, the character crosses to the far bank.
  const bridgeComplete = currentQuest === 1 && placedBlocks.length >= slots.length
  const charX = currentQuest === 1 ? (bridgeComplete ? 7 : 2) : 1
  const charY = 3

  return (
    <div className={`isogrid ${wrongShake ? 'isogrid--shake' : ''}`}>
      <div
        className="isogrid__stage"
        style={{ width: CONTAINER_W, height: origin.height + 120 }}
      >
        <div style={{ position: 'absolute', left: origin.x, top: origin.y }}>
          {tiles}
          {ghosts}
          {built}
          {currentQuest !== 3 && (
            <Character x={charX} y={charY} z={currentQuest === 1 ? 1 : 0} walking={bridgeComplete} />
          )}
          {currentQuest === 3 && <BossScene />}
        </div>
      </div>
      {wrongShake && <div className="isogrid__redflash" />}
    </div>
  )
}

export { COLS, ROWS, CONTAINER_W, TILE_W }
