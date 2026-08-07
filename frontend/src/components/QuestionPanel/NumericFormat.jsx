/** Plain equation. This is the "expensive" default the tutor starts with. */
export default function NumericFormat({ question }) {
  return (
    <div className="fmt fmt--numeric">
      <div className="fmt__equation">
        <span>{question.a}</span>
        <span className="fmt__op">×</span>
        <span>{question.b}</span>
        <span className="fmt__op">=</span>
        <span className="fmt__blank">?</span>
      </div>
    </div>
  )
}
