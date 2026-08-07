/**
 * The heads-up display: everything layered over the world.
 *
 * Left rail carries the quest and its progress, right rail the meters and
 * settings. Both float on the canvas rather than reserving layout space, so the
 * world stays full-bleed.
 */

import { useGame } from '../state/GameContext'
import TokenCounter from './TokenCounter'
import { QUEST_NAMES, TOTAL_QUESTS } from '../constants'
import './HUD.css'

function QuestRail() {
  const { currentQuest, questProgress, questLength, blocksEarned } = useGame()

  return (
    <div className="hud__quest">
      <div className="hud__questline">
        <span className="hud__questnum">
          Quest {currentQuest}/{TOTAL_QUESTS}
        </span>
        <span className="hud__questname">{QUEST_NAMES[currentQuest]}</span>
      </div>

      <div className="hud__pips" aria-label={`${questProgress} of ${questLength} complete`}>
        {Array.from({ length: questLength }, (_, i) => (
          <span key={i} className={`hud__pip ${i < questProgress ? 'hud__pip--on' : ''}`} />
        ))}
      </div>

      <div className="hud__blocks">
        <span className="hud__blockicon" aria-hidden="true" />
        {blocksEarned} blocks
      </div>
    </div>
  )
}

function BossBar() {
  const { currentQuest, bossHealth, bossMaxHealth, bossDefeated, golemTaunt } = useGame()
  if (currentQuest !== 3) return null

  return (
    <div className={`hud__boss ${bossDefeated ? 'hud__boss--down' : ''}`}>
      <div className="hud__bossname">The Glitch Golem</div>
      <div className="hud__shields" aria-label={`${bossHealth} shields remaining`}>
        {Array.from({ length: bossMaxHealth }, (_, i) => (
          <span key={i} className={`hud__shield ${i < bossHealth ? '' : 'hud__shield--broken'}`} />
        ))}
      </div>
      {golemTaunt && !bossDefeated && <div className="hud__taunt">{golemTaunt}</div>}
    </div>
  )
}

export default function HUD() {
  const {
    focusHearts,
    sessionNumber,
    lowStim,
    toggleLowStim,
    muted,
    toggleMute,
  } = useGame()

  return (
    <div className="hud">
      <div className="hud__left">
        <QuestRail />
      </div>

      <div className="hud__top">
        <BossBar />
      </div>

      <div className="hud__right">
        <div className={`hud__session hud__session--${sessionNumber}`}>
          Session {sessionNumber}
          {sessionNumber === 2 && <span className="hud__sessiontag">with memory</span>}
        </div>

        <TokenCounter />

        <div className="hud__hearts" title="Focus" aria-label={`${focusHearts} of 3 focus`}>
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className={`hud__heart ${i < focusHearts ? '' : 'hud__heart--dim'}`}>
              ♥
            </span>
          ))}
        </div>

        <div className="hud__settings">
          <button
            className="hud__btn"
            onClick={toggleLowStim}
            aria-pressed={lowStim}
            title="Low-stimulation mode"
          >
            {lowStim ? '🌙' : '☀️'}
          </button>
          <button
            className="hud__btn"
            onClick={toggleMute}
            aria-pressed={muted}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>
    </div>
  )
}
