import { useEffect, useState } from 'react'
import { useGame } from '../state/GameContext'
import { USE_MOCK } from '../api/client'
import './RevealCard.css'

/** Counts from 0 to `target` so the numbers land rather than just appear. */
function useCountUp(target, duration = 1500, enabled = true) {
  const [value, setValue] = useState(enabled ? 0 : target)

  useEffect(() => {
    if (!enabled) {
      setValue(target)
      return
    }
    let frame
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      // Ease-out cubic: fast then settling, which reads as "arriving at" a number.
      setValue(target * (1 - Math.pow(1 - t, 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, enabled])

  return value
}

function Metric({ label, from, to, suffix = '', highlight = false, animate }) {
  const v = useCountUp(to, 1500, animate)

  return (
    <div className={`metric ${highlight ? 'metric--highlight' : ''}`}>
      <div className="metric__label">{label}</div>
      <div className="metric__value">
        {from != null && <span className="metric__from">{from}{suffix}</span>}
        {from != null && <span className="metric__arrow">→</span>}
        <span className="metric__to">
          {Math.round(v)}
          {suffix}
        </span>
      </div>
    </div>
  )
}

export default function RevealCard() {
  const { summary, lowStim } = useGame()
  if (!summary) return null

  const animate = !lowStim

  return (
    <div className="reveal">
      <div className="reveal__card">
        <div className="reveal__header">
          <h1>Village Restored</h1>
          <p>Here's what changed for Alex.</p>
        </div>

        <div className="reveal__metrics">
          <Metric
            label="Mastery"
            from={Math.round(summary.mastery_before * 100)}
            to={Math.round(summary.mastery_after * 100)}
            suffix="%"
            animate={animate}
          />
          <Metric
            label="Questions needed"
            from={summary.questions_session1}
            to={summary.questions_session2 ?? summary.questions_session1}
            animate={animate}
          />
          <Metric
            label="AI token cost"
            from={summary.tokens_session1}
            to={summary.tokens_session2}
            animate={animate}
          />
          <Metric
            label="Cost reduction"
            to={summary.token_reduction_pct}
            suffix="%"
            highlight
            animate={animate}
          />
        </div>

        <div className="reveal__facts">
          <div className="reveal__fact">
            <span className="reveal__factlabel">Strategy retrieved</span>
            <span className="reveal__factvalue">{summary.strategy_retrieved}</span>
          </div>
          <div className="reveal__fact">
            <span className="reveal__factlabel">Memory source</span>
            <span className="reveal__factvalue reveal__factvalue--gold">
              {summary.memory_source}
            </span>
          </div>
          {summary.facts_mastered?.length > 0 && (
            <div className="reveal__fact">
              <span className="reveal__factlabel">Facts mastered</span>
              <span className="reveal__factvalue">{summary.facts_mastered.join(', ')}</span>
            </div>
          )}
        </div>

        <div className="reveal__cta">
          <p>{summary.pricing_cta}</p>
          <button className="reveal__ctabtn">Continue tomorrow</button>
        </div>

        {/* Only claim Snowflake when we are actually talking to the backend.
            On mock data the numbers are computed in-browser, and saying
            otherwise on stage would be a false claim. */}
        <div className="reveal__proof">
          {USE_MOCK
            ? 'Demo mode — figures computed in-browser from this session\'s play.'
            : 'Every number above is a live query against Snowflake.'}
        </div>
      </div>
    </div>
  )
}
