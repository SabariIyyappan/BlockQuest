import { useGame } from '../state/GameContext'
import { tileToScreen } from './iso'
import './BossScene.css'

/** Deterministic particle spread so the shatter looks the same every run. */
const PARTICLES = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2
  return { dx: `${Math.cos(angle) * 70}px`, dy: `${Math.sin(angle) * 70}px`, i }
})

export default function BossScene() {
  const { bossHealth, bossMaxHealth, bossDefeated, lastResult, gamePhase, PHASE } = useGame()
  const { left, top } = tileToScreen(4, 2, 0)

  const justHit = gamePhase !== PHASE.QUESTION && lastResult?.correct

  return (
    <div className="boss" style={{ left, top: top - 90, zIndex: 500 }}>
      <div className="boss__healthbar">
        {Array.from({ length: bossMaxHealth }, (_, i) => (
          <div
            key={i}
            className={`boss__segment ${i >= bossHealth ? 'boss__segment--broken' : ''}`}
          />
        ))}
      </div>

      {!bossDefeated ? (
        <div className={`boss__body ${justHit ? 'boss__body--hit' : ''}`}>
          <div className="boss__eye boss__eye--l" />
          <div className="boss__eye boss__eye--r" />
          <div className="boss__mouth" />
          <div className="boss__glitch decorative" />
        </div>
      ) : (
        <div className="boss__particles">
          {PARTICLES.map((p) => (
            <span
              key={p.i}
              className="boss__particle"
              style={{ '--dx': p.dx, '--dy': p.dy, animationDelay: `${p.i * 30}ms` }}
            />
          ))}
          <div className="boss__victory">Village Restored!</div>
        </div>
      )}
    </div>
  )
}
