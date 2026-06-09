import { motion } from "framer-motion";
import type { GameState } from "@/lib/types";
import { GAME_CONFIG } from "@/lib/types";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { BagAmount } from "./BagAmount";
import { CountdownRing } from "./CountdownRing";
import { KingCard } from "./KingCard";
import { YoinkButton } from "./YoinkButton";
import { ChainOfFallen } from "./ChainOfFallen";
import { StatsSidebar } from "./StatsSidebar";

interface GameScreenProps {
  state: GameState;
  onYoink: () => void;
}

export function GameScreen({ state, onYoink }: GameScreenProps) {
  const critical = state.countdown <= 5 && !state.isRoundOver;

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 pb-40 pt-8 sm:px-6 lg:grid-cols-[1fr_320px] lg:pb-12">
      {/* ── main column ── */}
      <div className="flex flex-col items-center gap-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-2"
        >
          <BagAmount amount={state.bagAmount} />
        </motion.div>

        <CountdownRing countdown={state.countdown} />

        <KingCard
          king={state.currentKing}
          isYou={state.kingIsYou}
          heldFor={state.kingHeldFor}
          critical={critical}
        />

        {/* desktop / tablet in-flow button */}
        <div className="hidden w-full max-w-sm sm:block">
          <YoinkButton
            onYoink={onYoink}
            critical={critical}
            disabled={state.isRoundOver}
            youAreKing={state.kingIsYou}
          />
          <p className="mt-3 text-center font-mono text-[11px] text-dim">
            85% to the bag · 10% rake · 5% jackpot reserve
          </p>
        </div>

        <div className="w-full pt-2">
          <ChainOfFallen kings={state.recentKings} />
        </div>
      </div>

      {/* ── sidebar ── */}
      <div className="flex flex-col gap-4">
        <StatsSidebar
          roundNumber={state.roundNumber}
          biggestBag={state.biggestBag}
          totalDistributed={state.totalDistributed}
          playerCount={state.playerCount}
        />

        {/* "How it works" — also gets Aceternity spotlight */}
        <SpotlightCard
          spotlightColor="rgba(68, 0, 204, 0.18)"
          radius={220}
          className="premium-card hidden rounded-[24px] lg:block"
        >
          <div className="flex flex-col gap-2 px-5 py-4">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
              How it works
            </h3>
            <ol className="flex flex-col gap-2 text-xs text-slate">
              <li>
                <span className="font-mono text-gold">01</span> One king holds
                the bag at all times.
              </li>
              <li>
                <span className="font-mono text-gold">02</span> Pay{" "}
                {GAME_CONFIG.YOINK_COST} SOL to yoink it and reset the clock.
              </li>
              <li>
                <span className="font-mono text-gold">03</span> Clock hits zero
                — the king takes the entire bag.
              </li>
            </ol>
          </div>
        </SpotlightCard>
      </div>

      {/* mobile fixed YOINK button */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.06] bg-[rgba(8,8,15,0.9)] p-4 backdrop-blur-xl sm:hidden">
        <YoinkButton
          onYoink={onYoink}
          critical={critical}
          disabled={state.isRoundOver}
          youAreKing={state.kingIsYou}
        />
      </div>
    </div>
  );
}
