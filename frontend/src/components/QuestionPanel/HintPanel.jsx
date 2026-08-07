/**
 * Scaffolding driven purely by `hint_level` from the API.
 *   0 - nothing
 *   1 - a nudge
 *   2 - the full worked example, revealed one step at a time
 */
export default function HintPanel({ level, hint }) {
  if (!level || !hint) return null

  if (level === 1) {
    return <div className="hint hint--nudge">💡 {hint}</div>
  }

  const steps = Array.isArray(hint) ? hint : [hint]

  return (
    <div className="hint hint--worked">
      <div className="hint__title">Let's work it out together</div>
      {steps.map((s, i) => (
        <div className="hint__step" key={i} style={{ animationDelay: `${i * 500}ms` }}>
          {s}
        </div>
      ))}
    </div>
  )
}
