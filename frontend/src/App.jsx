import { GameProvider, useGame } from './state/GameContext'
import TopBar from './components/TopBar'
import IsoGrid from './components/IsoGrid'
import QuestionPanel from './components/QuestionPanel'
import NarrativeBar from './components/NarrativeBar'
import MemoryBubble from './components/MemoryBubble'
import RevealCard from './components/RevealCard'
import { IntroOverlay, QuestCompleteOverlay, TransitionOverlay } from './components/Overlays'
import './App.css'

function Game() {
  const { gamePhase, lowStim, PHASE } = useGame()

  return (
    <div className={`app ${lowStim ? 'low-stim' : ''}`}>
      <TopBar />

      <main className="app__main">
        <section className="app__scene">
          <IsoGrid />
          <MemoryBubble />
        </section>

        <section className="app__question">
          <QuestionPanel />
        </section>
      </main>

      <NarrativeBar />

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
