/**
 * `a` visually separated clusters of `b` blocks.
 *
 * This is the representation that fixes the additive misconception: you can
 * count the groups, so "3 x 4" stops looking like "3 + 4".
 */
export default function GroupsFormat({ question }) {
  const { a, b } = question

  // Keep the whole reveal under ~600ms however large the product gets —
  // at a fixed 40ms/dot, 4x8 would take 1.3s and read as broken rendering.
  const step = Math.min(40, 600 / Math.max(1, a * b))

  return (
    <div className="fmt fmt--groups">
      <div className="groups">
        {Array.from({ length: a }, (_, gi) => (
          <div className="groups__cluster" key={gi}>
            {Array.from({ length: b }, (_, di) => (
              <span
                className="groups__dot"
                key={di}
                style={{ animationDelay: `${(gi * b + di) * step}ms` }}
              />
            ))}
            <div className="groups__label">{b}</div>
          </div>
        ))}
      </div>
      <div className="fmt__caption">
        {a} groups of {b}
      </div>
    </div>
  )
}
