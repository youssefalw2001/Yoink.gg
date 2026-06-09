import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Header, type Page } from "@/components/layout/Header";
import { LiveTicker } from "@/components/layout/LiveTicker";
import { Footer } from "@/components/layout/Footer";
import { SceneBackground } from "@/components/ui/SceneBackground";
import { GameScreen } from "@/components/game/GameScreen";
import { Leaderboard } from "@/components/leaderboard/Leaderboard";
import { WinReveal } from "@/components/reveal/WinReveal";
import { useGameState } from "@/hooks/useGameState";

export default function App() {
  const [page, setPage] = useState<Page>("game");
  const { state, leaderboard, yoink, playAgain } = useGameState();

  const dangerActive = state.countdown <= 3 && !state.isRoundOver;

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <SceneBackground danger={dangerActive} />

      <Header page={page} onNavigate={setPage} />
      <LiveTicker recentKings={state.recentKings} currentKing={state.currentKing} />

      <main className="relative z-10 flex flex-1 flex-col">
        <AnimatePresence mode="wait">
          {page === "game" ? (
            <motion.div
              key="game"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <GameScreen state={state} onYoink={yoink} />
            </motion.div>
          ) : (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="px-4 py-10 sm:px-6"
            >
              <Leaderboard entries={leaderboard} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer />

      <WinReveal
        open={state.isRoundOver}
        winner={state.winner}
        isYou={state.winnerIsYou}
        amount={state.bagAmount}
        round={state.roundNumber}
        onPlayAgain={playAgain}
      />
    </div>
  );
}
