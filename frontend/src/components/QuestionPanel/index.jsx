import { useGame } from '../../state/GameContext'
import NumericFormat from './NumericFormat'
import GroupsFormat from './GroupsFormat'
import ArrayFormat from './ArrayFormat'
import HintPanel from './HintPanel'
import './QuestionPanel.css'

const FORMATS = {
  numeric: NumericFormat,
  groups: GroupsFormat,
  array: ArrayFormat,
}

export default function QuestionPanel() {
  const {
    currentQuestion: q,
    gamePhase,
    PHASE,
    selectedAnswer,
    lastResult,
    consecutiveErrors,
    answer,
    continueAfterWrong,
  } = useGame()

  if (gamePhase === PHASE.LOADING || !q) {
    return (
      <div className="qpanel qpanel--loading">
        <div className="qpanel__spinner" />
        <p>Thinking…</p>
      </div>
    )
  }

  const Format = FORMATS[q.format] ?? NumericFormat
  const reduced = q.num_options === 2
  const wrong = lastResult && !lastResult.correct
  const locked = gamePhase === PHASE.FEEDBACK || gamePhase === PHASE.BUILDING

  return (
    <div className={`qpanel ${reduced ? 'qpanel--calm' : ''}`}>
      {/* Only the question content scrolls — the answer buttons stay pinned so
          they can never be pushed below the fold by a tall worked example. */}
      <div className="qpanel__scroll">
        {reduced && (
          <div className="qpanel__calm-msg">Let's slow down. You've got this.</div>
        )}

        <h2 className="qpanel__text">{q.question_text}</h2>

        <Format question={q} />

        <HintPanel level={q.hint_level} hint={q.hint_text} />
      </div>

      <div className="qpanel__footer">
      <div className={`answers ${reduced ? 'answers--two' : ''}`}>
        {q.options.map((opt) => {
          const chosen = selectedAnswer === opt
          let tone = ''
          if (lastResult && chosen) tone = lastResult.correct ? 'answer--correct' : 'answer--wrong'
          // Once they've missed it, show where the right answer was.
          if (wrong && opt === lastResult.correct_answer) tone = 'answer--reveal'

          return (
            <button
              key={opt}
              className={`answer ${tone}`}
              disabled={locked}
              onClick={() => answer(opt)}
            >
              {opt}
            </button>
          )
        })}
      </div>

      {wrong && gamePhase === PHASE.FEEDBACK && (
        <button className="qpanel__continue" onClick={continueAfterWrong}>
          Try another →
        </button>
      )}

      {consecutiveErrors > 0 && !wrong && (
        <div className="qpanel__streak">Keep going — mistakes build the bridge too.</div>
      )}
      </div>
    </div>
  )
}
