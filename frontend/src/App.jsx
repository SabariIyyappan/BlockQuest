import { GameProvider, useGame } from './state/GameContext'
import WorldCanvas from './components/WorldCanvas'
import HUD from './components/HUD'
import DialogueBox from './components/DialogueBox'
import QuestionPanel from './components/QuestionPanel'
import RevealCard from './components/RevealCard'
import { IntroOverlay, QuestCompleteOverlay, TransitionOverlay } from './components/Overlays'
import './App.css'

/**
 * Full-bleed layout: the world fills the viewport and everything else floats
 * over it. Nothing but the canvas reserves layout space.
 */
function Game() {
  const { gamePhase, lowStim, PHASE } = useGame()

  const playing =
    gamePhase === PHASE.LOADING ||
    gamePhase === PHASE.QUESTION ||
    gamePhase === PHASE.FEEDBACK ||
    gamePhase === PHASE.BUILDING

  return (
    <div className={`app ${lowStim ? 'low-stim' : ''}`}>
      <WorldCanvas />

      <HUD />

      <div className="app__stage">
        <DialogueBox />
        {playing && (
          <div className="app__question">
            <QuestionPanel />
          </div>
        )}
      </div>

      {gamePhase === PHASE.INTRO && <IntroOverlay />}
      {gamePhase === PHASE.QUEST_COMPLETE && <QuestCompleteOverlay />}
      {gamePhase === PHASE.TRANSITION && <TransitionOverlay />}
      {gamePhase === PHASE.REVEAL && <RevealCard />}
    </div>
  )
}

export default function App() {
  return (
    <GameProvider>
      <Game />
    </GameProvider>
  )
}
