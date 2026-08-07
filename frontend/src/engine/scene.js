/**
 * WorldScene — the mutable half of the game.
 *
 * React owns game state and pushes *events* in through the imperative methods
 * near the bottom of this file (setQuest, placeBlocks, hitGolem, ...). The
 * scene owns everything that has to change 60 times a second: entity
 * positions, block flight arcs, particles, camera, and the day/night grade.
 *
 * Draw order for a frame:
 *   sky -> clouds -> [world: terrain, water, props, blocks, entities] ->
 *   particles -> light pass -> colour grade -> vignette -> weather
 */

import { project, depth, pathDiamond, gridBounds, TILE_H, BLOCK_H } from './iso'
import { drawCube, variantFor } from './textures'
import { lerpGrade, flatten, mix, ACCENT } from './palette'
import { getScene, groundHeight, COLS, ROWS, hash2 } from './world'
import { drawHero, drawPip, drawGolem, drawProp, shadow, LIGHT_PROPS } from './sprites'
import Particles from './particles'
import Camera from './camera'

export default class WorldScene {
  constructor() {
    this.questId = 1
    this.scene = getScene(1)

    this.camera = new Camera()
    this.particles = new Particles()

    this.time = 0
    this.motion = 1 // 0 in low-stim / reduced-motion
    this.viewW = 1280
    this.viewH = 720

    // Lighting: a blend between two named grades, plus a story-driven progress
    // value that Quest 2 pushes towards nightfall as walls go up.
    this.gradeA = 'morning'
    this.gradeB = 'noon'
    this.gradeT = 0
    this.gradeTarget = 0

    // Blocks in flight and blocks landed.
    this.placed = [] // { slot, squash }
    this.flying = [] // { slot, t, dur, from, arc }

    this.hero = { x: 3, y: 5, z: 1, phase: 0, walking: false, cheer: 0, facing: 1 }
    this.heroPath = null

    this.pip = { offX: -0.9, offY: 0.5, mood: 'idle', phase: 0 }

    this.boss = { health: 3, maxHealth: 3, hurt: 0, defeat: 0 }

    this.flash = null // { colour, t, dur }
    this.clouds = this.makeClouds()
    this.fireflies = 0

    this.bounds = gridBounds(COLS, ROWS, 3)
    this.camera.place(this.bounds.centreX, this.bounds.centreY, 1)

    this.setQuest(1, true)
  }

  /* ------------------------------------------------------------- lifecycle */

  makeClouds() {
    return Array.from({ length: 7 }, (_, i) => ({
      x: hash2(i, 3, 5) * 2200 - 400,
      y: 40 + hash2(i, 9, 7) * 220,
      w: 130 + hash2(i, 1, 11) * 220,
      speed: 5 + hash2(i, 5, 13) * 11,
      alpha: 0.25 + hash2(i, 7, 17) * 0.4,
    }))
  }

  resize(w, h) {
    this.viewW = w
    this.viewH = h
    this.fitCamera()
  }

  /**
   * Frame the whole board in the space the HUD leaves free. The dialogue box
   * and question card own the bottom ~430px, so the world is fitted into the
   * band above them and its centre pulled up to match.
   */
  fitCamera(animate = false) {
    const padX = 90
    const padTop = 110
    const padBottom = Math.min(this.viewH * 0.46, 430)
    const free = Math.max(220, this.viewH - padTop - padBottom)

    const zx = (this.viewW - padX * 2) / this.bounds.width
    const zy = free / this.bounds.height
    const zoom = Math.max(0.34, Math.min(1.2, Math.min(zx, zy)))

    // Screen-space centre of the free band, converted back into world units.
    const cx = this.bounds.centreX
    const cy = this.bounds.centreY + (padBottom - padTop) / 2 / zoom

    if (animate) this.camera.panTo(cx, cy, zoom, 1.0)
    else this.camera.place(cx, cy, zoom)
  }

  setMotion(m) {
    this.motion = m
    this.camera.idle = m > 0
  }

  /* ---------------------------------------------------------------- update */

  update(dt) {
    // Guard against huge steps after a tab has been backgrounded.
    dt = Math.min(dt, 0.05)
    this.time += dt

    this.camera.update(dt)
    this.particles.update(dt)

    this.hero.phase += dt
    this.pip.phase += dt

    this.updateHero(dt)
    this.updateFlying(dt)
    this.updatePlaced(dt)

    // Ease the day/night blend towards its target.
    this.gradeT += (this.gradeTarget - this.gradeT) * (1 - Math.exp(-1.6 * dt))

    if (this.boss.hurt > 0) this.boss.hurt = Math.max(0, this.boss.hurt - dt * 2.2)
    if (this.boss.defeating) {
      this.boss.defeat = Math.min(1, this.boss.defeat + dt * 0.7)
      if (this.boss.defeat >= 1) this.boss.defeating = false
    }

    if (this.flash) {
      this.flash.t += dt
      if (this.flash.t >= this.flash.dur) this.flash = null
    }

    if (this.motion > 0) {
      for (const c of this.clouds) {
        c.x += c.speed * dt
        if (c.x > this.viewW + 400) c.x = -c.w - 200
      }
    }

    // Fireflies come out once it is properly dark.
    const dark = this.currentGrade().star
    if (dark > 0.4 && this.motion > 0 && Math.random() < dt * 3) {
      this.particles.firefly(
        this.bounds.left + Math.random() * this.bounds.width,
        this.bounds.top + Math.random() * this.bounds.height,
      )
    }
  }

  updateHero(dt) {
    const p = this.heroPath
    if (!p) {
      this.hero.walking = false
      if (this.hero.cheer > 0) this.hero.cheer = Math.max(0, this.hero.cheer - dt * 1.6)
      return
    }

    p.t += dt
    const k = Math.min(1, p.t / p.dur)
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
    this.hero.x = p.fromX + (p.toX - p.fromX) * e
    this.hero.y = p.fromY + (p.toY - p.fromY) * e
    this.hero.z = groundHeight(this.scene, this.hero.x, this.hero.y)
    this.hero.walking = true
    this.hero.facing = p.toX >= p.fromX ? 1 : -1

    // Footfall dust on the beat of the stride.
    if (this.motion > 0 && Math.random() < dt * 8) {
      const { sx, sy } = project(this.hero.x, this.hero.y, this.hero.z)
      this.particles.dust(sx, sy, { count: 3, colour: '#cbb79a' })
    }

    if (k >= 1) {
      this.heroPath = null
      this.hero.walking = false
      if (p.onDone) p.onDone()
    }
  }

  updateFlying(dt) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]
      f.t += dt
      if (f.t >= f.dur) {
        this.flying.splice(i, 1)
        this.land(f.slot)
      }
    }
  }

  updatePlaced(dt) {
    for (const b of this.placed) {
      if (b.squash > 0) b.squash = Math.max(0, b.squash - dt * 4)
    }
  }

  land(slot) {
    this.placed.push({ slot, squash: 1 })
    const { sx, sy } = project(slot.x, slot.y, slot.z)
    this.particles.dust(sx, sy + TILE_H * 0.2, { count: 14, colour: '#d8c8a8' })
    this.camera.shake(4, 9)
    if (this.onBlockLanded) this.onBlockLanded(this.placed.length)
  }

  /* ------------------------------------------------------------- lighting */

  currentGrade() {
    const g = lerpGrade(this.gradeA, this.gradeB, this.gradeT)
    return this.motion > 0 ? g : flatten(g)
  }

  /* ------------------------------------------------------------------ draw */

  draw(ctx) {
    const g = this.currentGrade()

    this.drawSky(ctx, g)

    ctx.save()
    this.camera.apply(ctx, this.viewW, this.viewH, this.motion)
    this.drawWorld(ctx, g)
    this.particles.draw(ctx)
    ctx.restore()

    this.drawGrade(ctx, g)
    this.drawVignette(ctx, g)
    this.drawFlash(ctx)
  }

  drawSky(ctx, g) {
    const grd = ctx.createLinearGradient(0, 0, 0, this.viewH)
    grd.addColorStop(0, g.sky[0])
    grd.addColorStop(0.55, g.sky[1])
    grd.addColorStop(1, g.sky[2])
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, this.viewW, this.viewH)

    if (g.star > 0.02) this.drawStars(ctx, g.star)

    // Sun/moon disc, low in the sky, warm at dawn and cold at night.
    const discY = this.viewH * (0.16 + g.star * 0.06)
    const discX = this.viewW * 0.74
    const discColour = mix('#fff3c4', '#dfe8ff', g.star)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    Particles.glow(ctx, discX, discY, 150, discColour, 0.3)
    ctx.fillStyle = discColour
    ctx.beginPath()
    ctx.arc(discX, discY, g.star > 0.5 ? 26 : 34, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    this.drawClouds(ctx, g)
  }

  drawStars(ctx, amount) {
    ctx.save()
    for (let i = 0; i < 90; i++) {
      const x = hash2(i, 1, 91) * this.viewW
      const y = hash2(i, 2, 92) * this.viewH * 0.6
      const tw = 0.5 + 0.5 * Math.sin(this.time * 1.6 + i)
      ctx.globalAlpha = amount * (0.25 + tw * 0.6) * (0.4 + hash2(i, 3, 93) * 0.6)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x, y, 2, 2)
    }
    ctx.restore()
  }

  drawClouds(ctx, g) {
    ctx.save()
    for (const c of this.clouds) {
      ctx.globalAlpha = c.alpha * (1 - g.star * 0.7)
      ctx.fillStyle = mix('#ffffff', g.fog, 0.35)
      const h = c.w * 0.22
      ctx.beginPath()
      ctx.ellipse(c.x, c.y, c.w * 0.5, h * 0.5, 0, 0, Math.PI * 2)
      ctx.ellipse(c.x + c.w * 0.22, c.y + h * 0.12, c.w * 0.32, h * 0.42, 0, 0, Math.PI * 2)
      ctx.ellipse(c.x - c.w * 0.25, c.y + h * 0.14, c.w * 0.28, h * 0.38, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  /** The isometric world, assembled into one depth-sorted draw list. */
  drawWorld(ctx, g) {
    const list = []
    const s = this.scene
    const phase = this.time
    const motion = this.motion

    // Terrain. A column is drawn as one tall sprite: fewer blits, no seams.
    for (const t of s.tiles) {
      const top = t.water ? t.waterTop : t.h
      // Every column's skirt reaches the same screen depth, so the board has one
      // flat underside instead of a ragged edge. The riverbed is drawn a block
      // lower than the water surface, so its skirt is a block shorter.
      const sideH = BLOCK_H * (top + 3)
      const { sx, sy } = project(t.x, t.y, top)
      if (t.water) {
        list.push({
          d: depth(t.x, t.y, t.waterTop, -5),
          fn: () => {
            drawCube(ctx, 'sand', sx, sy + BLOCK_H, variantFor(t.x, t.y), sideH - BLOCK_H)
            this.drawWater(ctx, t, phase, g)
          },
        })
      } else {
        list.push({
          d: depth(t.x, t.y, t.h, -5),
          fn: () => drawCube(ctx, t.mat, sx, sy, variantFor(t.x, t.y), sideH),
        })
      }
    }

    // Ghost outlines for slots still to be built — the goal stays visible.
    const built = this.placed.length + this.flying.length
    for (let i = built; i < s.buildSlots.length; i++) {
      const slot = s.buildSlots[i]
      const { sx, sy } = project(slot.x, slot.y, slot.z)
      const next = i === built
      list.push({
        d: depth(slot.x, slot.y, slot.z, -2),
        fn: () => this.drawGhost(ctx, sx, sy, next, phase, motion),
      })
    }

    // Landed blocks.
    for (const b of this.placed) {
      const { slot, squash } = b
      const { sx, sy } = project(slot.x, slot.y, slot.z)
      list.push({
        d: depth(slot.x, slot.y, slot.z, 0),
        fn: () => {
          const k = squash * (motion > 0 ? 1 : 0)
          if (k > 0.01) {
            ctx.save()
            ctx.translate(sx, sy + TILE_H * 0.25)
            ctx.scale(1 + k * 0.22, 1 - k * 0.28)
            ctx.translate(-sx, -(sy + TILE_H * 0.25))
          }
          drawCube(ctx, slot.mat ?? 'wood', sx, sy, variantFor(slot.x, slot.y))
          if (k > 0.01) ctx.restore()
        },
      })
    }

    // Blocks in flight — drawn last within their tile so they read as above it.
    for (const f of this.flying) {
      // t starts negative to stagger a batch; the block waits at the hero.
      const k = Math.max(0, Math.min(1, f.t / f.dur))
      const { sx, sy } = project(f.slot.x, f.slot.y, f.slot.z)
      const x = f.fromX + (sx - f.fromX) * k
      const y = f.fromY + (sy - f.fromY) * k - Math.sin(k * Math.PI) * f.arc
      list.push({
        d: depth(f.slot.x, f.slot.y, f.slot.z, 40),
        fn: () => {
          ctx.save()
          ctx.globalAlpha = 0.35
          shadow(ctx, sx, sy + TILE_H * 0.2, 20 * k, 10 * k, 0.4)
          ctx.restore()
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(motion > 0 ? Math.sin(k * Math.PI) * 0.28 : 0)
          ctx.translate(-x, -y)
          drawCube(ctx, f.slot.mat ?? 'wood', x, y, variantFor(f.slot.x, f.slot.y))
          ctx.restore()
        },
      })
    }

    // Props.
    for (const p of s.props) {
      const { sx, sy } = project(p.x, p.y, p.z)
      list.push({
        d: depth(p.x, p.y, p.z, p.type === 'tuft' || p.type === 'flower' ? -1 : 5),
        fn: () => drawProp(ctx, p, sx, sy, phase, motion, this.particles),
      })
    }

    // Hero + Pip.
    {
      const { sx, sy } = project(this.hero.x, this.hero.y, this.hero.z)
      list.push({
        d: depth(this.hero.x, this.hero.y, this.hero.z, 20),
        fn: () =>
          drawHero(ctx, sx, sy, {
            phase: this.hero.phase,
            walking: this.hero.walking,
            cheer: this.hero.cheer,
            facing: this.hero.facing,
            motion,
          }),
      })

      const px = this.hero.x + this.pip.offX
      const py = this.hero.y + this.pip.offY
      const pp = project(px, py, this.hero.z)
      list.push({
        d: depth(px, py, this.hero.z, 25),
        fn: () =>
          drawPip(ctx, pp.sx, pp.sy, {
            phase: this.pip.phase,
            mood: this.pip.mood,
            motion,
            particles: this.particles,
          }),
      })
    }

    // Boss.
    if (s.boss && this.boss.defeat < 1) {
      const { sx, sy } = project(s.boss.x, s.boss.y, s.boss.z)
      list.push({
        d: depth(s.boss.x, s.boss.y, s.boss.z, 20),
        fn: () =>
          drawGolem(ctx, sx, sy, {
            phase,
            health: this.boss.health,
            maxHealth: this.boss.maxHealth,
            hurt: this.boss.hurt,
            defeat: this.boss.defeat,
            motion,
            particles: this.particles,
          }),
      })
    }

    list.sort((a, b) => a.d - b.d)
    for (const item of list) item.fn()

    this.drawLights(ctx, g)
  }

  drawWater(ctx, t, phase, g) {
    const { sx, sy } = project(t.x, t.y, t.waterTop)
    const flow = this.motion > 0 ? phase : 0

    pathDiamond(ctx, sx, sy)
    const base = mix(ACCENT.waterDeep, ACCENT.water, 0.5 + 0.5 * Math.sin(t.y * 0.7 + flow * 0.5))
    ctx.fillStyle = mix(base, g.fog, g.star * 0.4)
    ctx.fill()

    // Scrolling highlight bands.
    ctx.save()
    pathDiamond(ctx, sx, sy)
    ctx.clip()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) {
      const off = ((flow * 24 + i * 14 + t.x * 9) % 40) - 20
      ctx.globalAlpha = 0.1 + 0.07 * Math.sin(flow * 2 + i + t.y)
      ctx.fillStyle = ACCENT.waterLight
      ctx.fillRect(sx - 40, sy + off * 0.4, 80, 3)
    }
    ctx.restore()

    // Foam where water meets the bank.
    const leftBank = !this.scene.tileAt(t.x - 1, t.y)?.water
    const rightBank = !this.scene.tileAt(t.x + 1, t.y)?.water
    if (leftBank || rightBank) {
      ctx.save()
      pathDiamond(ctx, sx, sy)
      ctx.clip()
      ctx.globalAlpha = 0.28 + 0.12 * Math.sin(flow * 3 + t.y)
      ctx.fillStyle = ACCENT.foam
      if (leftBank) ctx.fillRect(sx - 36, sy - 4, 16, 8)
      if (rightBank) ctx.fillRect(sx + 20, sy - 4, 16, 8)
      ctx.restore()
    }
  }

  drawGhost(ctx, sx, sy, isNext, phase, motion) {
    const pulse = motion > 0 ? 0.5 + 0.5 * Math.sin(phase * 3) : 0.5
    ctx.save()
    ctx.globalAlpha = isNext ? 0.25 + pulse * 0.3 : 0.14
    ctx.strokeStyle = ACCENT.ghost
    ctx.lineWidth = isNext ? 2 : 1.4
    ctx.setLineDash([7, 5])
    pathDiamond(ctx, sx, sy, 0.94)
    ctx.stroke()
    if (isNext) {
      ctx.globalAlpha = 0.1 + pulse * 0.12
      ctx.fillStyle = ACCENT.gold
      ctx.fill()
    }
    ctx.restore()
  }

  /**
   * Additive light pass: torches, campfires and crystals actually brighten the
   * ground around them once the scene gets dark.
   */
  drawLights(ctx, g) {
    const strength = Math.min(1, g.star * 1.2 + (this.questId === 3 ? 0.5 : 0))
    if (strength < 0.05) return
    for (const p of this.scene.props) {
      if (!LIGHT_PROPS.has(p.type)) continue
      const { sx, sy } = project(p.x, p.y, p.z)
      const flicker = this.motion > 0 ? 0.85 + Math.sin(this.time * 9 + p.seed) * 0.15 : 1
      const colour = p.type === 'crystal' ? ACCENT.golem : '#ffb04a'
      Particles.glow(ctx, sx, sy - 14, 130, colour, 0.22 * strength * flicker)
    }
  }

  drawGrade(ctx, g) {
    if (g.tintAmount > 0.01) {
      ctx.save()
      ctx.globalCompositeOperation = 'multiply'
      ctx.globalAlpha = g.tintAmount
      ctx.fillStyle = g.tint
      ctx.fillRect(0, 0, this.viewW, this.viewH)
      ctx.restore()
    }
    if (g.bloomAmount > 0.01) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = g.bloomAmount
      ctx.fillStyle = g.bloom
      ctx.fillRect(0, 0, this.viewW, this.viewH)
      ctx.restore()
    }
  }

  drawVignette(ctx, g) {
    if (g.vignette < 0.02) return
    const r = Math.max(this.viewW, this.viewH) * 0.78
    const grd = ctx.createRadialGradient(
      this.viewW / 2, this.viewH * 0.45, r * 0.32,
      this.viewW / 2, this.viewH * 0.45, r,
    )
    grd.addColorStop(0, 'rgba(0,0,0,0)')
    grd.addColorStop(1, `rgba(4,6,16,${g.vignette})`)
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, this.viewW, this.viewH)
  }

  drawFlash(ctx) {
    if (!this.flash) return
    const k = 1 - this.flash.t / this.flash.dur
    ctx.save()
    ctx.globalAlpha = k * this.flash.strength * (this.motion > 0 ? 1 : 0.4)
    ctx.fillStyle = this.flash.colour
    ctx.fillRect(0, 0, this.viewW, this.viewH)
    ctx.restore()
  }

  /* ---------------------------------------------------- imperative commands */

  setQuest(questId, instant = false) {
    this.questId = questId
    this.scene = getScene(questId)
    this.placed = []
    this.flying = []
    this.particles.clear()

    this.gradeA = this.scene.gradeFrom
    this.gradeB = this.scene.gradeTo
    this.gradeT = 0
    this.gradeTarget = 0

    this.hero = {
      ...this.hero,
      ...this.scene.hero,
      walking: false,
      cheer: 0,
      facing: 1,
    }
    this.heroPath = null

    if (this.scene.boss) {
      this.boss = { health: this.boss.maxHealth, maxHealth: this.boss.maxHealth, hurt: 0, defeat: 0 }
    }

    this.fitCamera(!instant)
  }

  setBossHealth(health, maxHealth) {
    this.boss.maxHealth = maxHealth
    this.boss.health = health
  }

  /**
   * Send `count` blocks arcing from the hero into the next free slots.
   * Timings are tuned to land inside GameContext's 150ms-per-block budget.
   */
  placeBlocks(count) {
    const s = this.scene
    const start = this.placed.length + this.flying.length
    const { sx, sy } = project(this.hero.x, this.hero.y, this.hero.z)

    for (let i = 0; i < count; i++) {
      const slot = s.buildSlots[start + i]
      if (!slot) break
      if (this.motion === 0) {
        this.land(slot)
        continue
      }
      this.flying.push({
        slot,
        t: -i * 0.13, // stagger; negative t holds the block at the hero
        dur: 0.42,
        fromX: sx,
        fromY: sy - 30,
        arc: 90 + i * 12,
      })
    }

    this.hero.cheer = 1
    this.pip.mood = 'happy'

    // Quest 2's nightfall is driven by how much shelter is standing.
    if (this.questId === 2) {
      this.gradeTarget = Math.min(1, (start + count) / Math.max(1, s.buildSlots.length))
    }
  }

  /** Walk the hero to a tile. Resolves through `onDone`. */
  walkTo(x, y, dur = 1.6, onDone) {
    this.heroPath = {
      fromX: this.hero.x,
      fromY: this.hero.y,
      toX: x,
      toY: y,
      t: 0,
      dur,
      onDone,
    }
  }

  /** Quest 1: once the bridge is whole, cross it. */
  crossBridge() {
    const end = this.scene.heroEnd
    if (!end) return
    this.walkTo(end.x, end.y, 2.2, () => {
      this.hero.cheer = 1
      this.celebrate()
    })
  }

  hitGolem() {
    this.boss.health = Math.max(0, this.boss.health - 1)
    this.boss.hurt = 1
    this.camera.shake(14, 5)
    this.camera.punchIn(0.05)
    const { sx, sy } = project(this.scene.boss.x, this.scene.boss.y, this.scene.boss.z)
    this.particles.shards(sx, sy - 60, { count: 22 })
    this.flashScreen('#ffffff', 0.16, 0.35)
    if (this.boss.health <= 0) this.defeatGolem()
  }

  defeatGolem() {
    this.boss.defeating = true
    this.camera.shake(26, 3)
    this.camera.punchIn(0.09)
    const { sx, sy } = project(this.scene.boss.x, this.scene.boss.y, this.scene.boss.z)
    this.particles.shards(sx, sy - 70, { count: 60 })
    this.particles.sparkle(sx, sy - 50, { count: 40, colour: '#ffe6a0' })
    this.flashScreen('#ffffff', 0.8, 0.5)
    // The storm lifts: light comes back to the village.
    this.gradeA = 'storm'
    this.gradeB = 'victory'
    this.gradeTarget = 1
    this.pip.mood = 'happy'
  }

  wrongAnswer() {
    this.camera.shake(9, 6)
    this.flashScreen(ACCENT.wrong, 0.22, 0.4)
    this.pip.mood = 'worried'
  }

  correctAnswer() {
    const { sx, sy } = project(this.hero.x, this.hero.y, this.hero.z)
    this.particles.sparkle(sx, sy - 50, { count: 22, colour: ACCENT.gold })
    this.pip.mood = 'happy'
  }

  celebrate() {
    const { sx, sy } = project(this.hero.x, this.hero.y, this.hero.z)
    this.particles.sparkle(sx, sy - 40, { count: 46, colour: ACCENT.gold })
    this.camera.punchIn(0.04)
    this.pip.mood = 'happy'
  }

  setPipMood(mood) {
    this.pip.mood = mood
  }

  flashScreen(colour, strength, dur) {
    this.flash = { colour, strength, dur, t: 0 }
  }
}
