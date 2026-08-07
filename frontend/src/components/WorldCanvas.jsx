/**
 * The bridge between React and the engine.
 *
 * React owns game state; WorldScene owns animation. This component is the only
 * place the two meet: one <canvas>, one rAF loop, and a set of effects that
 * translate state *changes* into imperative scene commands. Nothing in here
 * re-renders per frame — the canvas is written to directly.
 */

import { useEffect, useRef } from 'react'
import WorldScene from '../engine/scene'
import { useGame } from '../state/GameContext'
import { totalQuestions } from '../constants'
import sfx, { setMuted } from '../audio/sfx'
import './WorldCanvas.css'

const MAX_DPR = 2

export default function WorldCanvas() {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)

  const {
    currentQuest,
    placedBlocks,
    lastResult,
    gamePhase,
    bossHealth,
    bossMaxHealth,
    bossDefeated,
    questProgress,
    questLength,
    lowStim,
    muted,
    pipMood,
    sessionNumber,
    PHASE,
  } = useGame()

  /* --------------------------------------------------------- boot the loop */

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { alpha: false })
    const scene = new WorldScene()
    sceneRef.current = scene

    let raf = 0
    let last = performance.now()
    let dpr = 1

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      scene.resize(rect.width, rect.height)
    }

    const frame = (now) => {
      const dt = (now - last) / 1000
      last = now
      scene.update(dt)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      scene.draw(ctx)

      raf = requestAnimationFrame(frame)
    }

    resize()
    raf = requestAnimationFrame(frame)

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      sceneRef.current = null
    }
  }, [])

  /* ----------------------------------------------------- accessibility feed */

  // Low-stim and prefers-reduced-motion both freeze the world's ambient life.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    scene.setMotion(lowStim || reduced ? 0 : 1)
  }, [lowStim])

  useEffect(() => {
    setMuted(muted || lowStim)
  }, [muted, lowStim])

  /* ------------------------------------------------------ state -> commands */

  // Quest change: swap the scene, re-arm the boss, pan the camera.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.setQuest(currentQuest)
    if (currentQuest === 3) scene.setBossHealth(bossMaxHealth, bossMaxHealth)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuest])

  useEffect(() => {
    sceneRef.current?.setPipMood(pipMood)
  }, [pipMood])

  // Blocks awarded. placedBlocks is the running total, so send the delta.
  const seenBlocks = useRef({ quest: 1, n: 0 })
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (currentQuest !== seenBlocks.current.quest) {
      seenBlocks.current = { quest: currentQuest, n: 0 }
    }
    const prev = seenBlocks.current.n
    const delta = placedBlocks.length - prev
    seenBlocks.current = { quest: currentQuest, n: placedBlocks.length }
    if (delta > 0) {
      scene.placeBlocks(delta)
      for (let i = 0; i < delta; i++) {
        setTimeout(() => sfx.thunk(i), 130 * i + 420)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedBlocks.length, currentQuest])

  // Answer feedback.
  const seenResult = useRef(null)
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !lastResult || lastResult === seenResult.current) return
    seenResult.current = lastResult

    if (lastResult.correct) {
      scene.correctAnswer()
      sfx.correct()
    } else {
      scene.wrongAnswer()
      sfx.wrong()
    }
  }, [lastResult])

  // Golem shields. bossHealth only ever decreases, one per correct answer.
  const seenBossHealth = useRef(null)
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || currentQuest !== 3) return
    if (seenBossHealth.current === null) {
      seenBossHealth.current = bossHealth
      scene.setBossHealth(bossHealth, bossMaxHealth)
      return
    }
    if (bossHealth < seenBossHealth.current) {
      scene.hitGolem()
      if (bossHealth <= 0) sfx.golemDefeat()
      else sfx.golemHit()
    }
    seenBossHealth.current = bossHealth
  }, [bossHealth, bossMaxHealth, currentQuest])

  // Quest 1: the crossing. Fires once the bridge is whole.
  const crossed = useRef(false)
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || currentQuest !== 1) return
    const done = questProgress >= questLength
    if (done && !crossed.current) {
      crossed.current = true
      scene.crossBridge()
    }
    if (!done) crossed.current = false
  }, [currentQuest, questProgress, questLength])

  // Quest completion flourish.
  useEffect(() => {
    if (gamePhase !== PHASE.QUEST_COMPLETE) return
    sceneRef.current?.celebrate()
    sfx.fanfare()
  }, [gamePhase, PHASE.QUEST_COMPLETE])

  useEffect(() => {
    if (gamePhase === PHASE.REVEAL) sfx.reveal()
  }, [gamePhase, PHASE.REVEAL])

  const label =
    `Isometric voxel world, quest ${currentQuest} of 3. ` +
    `${placedBlocks.length} blocks placed. ` +
    (bossDefeated ? 'The Glitch Golem is defeated. ' : '') +
    `Session ${sessionNumber}, ${totalQuestions(sessionNumber)} questions total.`

  return (
    <canvas
      ref={canvasRef}
      className="world-canvas"
      role="img"
      aria-label={label}
    />
  )
}
