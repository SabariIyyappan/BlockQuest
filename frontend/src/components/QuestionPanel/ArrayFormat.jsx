/** An a x b rectangle — multiplication as area. */
export default function ArrayFormat({ question }) {
  const { a, b } = question

  // Same cap as GroupsFormat: the full grid must finish appearing quickly.
  const step = Math.min(30, 600 / Math.max(1, a * b))

  return (
    <div className="fmt fmt--array">
      <div
        className="arraygrid"
        style={{ gridTemplateColumns: `repeat(${b}, 26px)` }}
      >
        {Array.from({ length: a * b }, (_, i) => (
          <span className="arraygrid__cell" key={i} style={{ animationDelay: `${i * step}ms` }} />
        ))}
      </div>
      <div className="fmt__caption">
        {a} rows × {b} columns
      </div>
    </div>
  )
}
