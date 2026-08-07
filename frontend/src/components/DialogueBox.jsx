/**
 * Pip's dialogue box.
 *
 * A portrait, a name plate, and a typewriter. It absorbs the old NarrativeBar
 * and MemoryBubble: everything the game used to say as UI copy now comes out of
 * a character's mouth, including the memory recall that is the demo's payload.
 */

import { useEffect, useRef, useState } from 'react'
import { useGame } from '../state/GameContext'
import { PIP_NAME } from '../story/dialogue'
import { drawPip } from '../engine/sprites'
import './DialogueBox.css'

const CHARS_PER_SEC = 55

/** Small looping canvas so the portrait is the same Pip that's in the world. */
function PipPortrait({ mood }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = 68 * dpr
    canvas.height = 68 * dpr

    let raf = 0
    const start = performance.now()
    const frame = (now) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, 68, 68)

      // A warm disc behind Pip so the lantern's dark frame has something to
      // read against — without it the portrait is a silhouette on glass.
      const bg = ctx.createRadialGradient(34, 32, 2, 34, 32, 33)
      bg.addColorStop(0, mood === 'remember' ? 'rgba(210,170,255,0.5)' : 'rgba(255,208,130,0.42)')
      bg.addColorStop(1, 'rgba(255,208,130,0)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, 68, 68)

      // drawPip anchors its lantern 46px above the ground point it's given, so
      // aim the ground below the canvas to centre the lantern in the frame.
      ctx.save()
      ctx.translate(34, 34)
      ctx.scale(1.25, 1.25)
      ctx.translate(-34, -34)
      drawPip(ctx, 34, 88, { phase: (now - start) / 1000, mood, motion: 1 })
      ctx.restore()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [mood])

  return <canvas ref={ref} className="dialogue__portrait" style={{ width: 68, height: 68 }} />
}

export default function DialogueBox() {
  const { dialogue, dialogueId, lowStim } = useGame()
  const [shown, setShown] = useState('')

  const text = dialogue?.text ?? ''
  const mood = dialogue?.mood ?? 'idle'
  const remembering = mood === 'remember'

  // Typewriter, restarted whenever a new line arrives. Low-stim shows it whole.
  useEffect(() => {
    if (!text) {
      setShown('')
      return
    }
    if (lowStim) {
      setShown(text)
      return
    }
    setShown('')
    let i = 0
    const id = setInterval(() => {
      i += 1
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, 1000 / CHARS_PER_SEC)
    return () => clearInterval(id)
  }, [text, dialogueId, lowStim])

  if (!dialogue) return null

  return (
    <div
      className={`dialogue ${remembering ? 'dialogue--remember' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="dialogue__frame">
        <PipPortrait mood={mood} />
        <div className="dialogue__body">
          <div className="dialogue__name">
            {PIP_NAME}
            {remembering && <span className="dialogue__tag">remembering you</span>}
          </div>
          {/* The visible text types out; the full line is exposed to screen
              readers immediately so nobody has to wait on an animation. */}
          <p className="dialogue__text" aria-hidden="true">
            {shown}
            <span className="dialogue__caret" />
          </p>
          <span className="visually-hidden">{text}</span>
        </div>
      </div>
    </div>
  )
}
