import { motion, AnimatePresence } from "framer-motion";
import type { GameState } from "@/lib/types";
import { GAME_CONFIG } from "@/lib/types";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { BagAmount } from "./BagAmount";
import { CountdownRing } from "./CountdownRing";
import { KingCard } from "./KingCard";
import { YoinkButton } from "./YoinkButton";
import { ChainOfFallen } from "./ChainOfFallen";
import { StatsSidebar } from "./StatsSidebar";
import { LobbyScreen } from "./LobbyScreen";
import { ActivityFeed } from "./ActivityFeed";

interface GameScreenProps {
  state: GameState;
  onYoink: () => void;
  cooldownLeft: number;
}

export function GameScreen({ state, onYoink, cooldownLeft }: GameScreenProps) {
  const critical = state.countdown <= 5 && !state.isRoundOver;

  return (
    <AnimatePresence mode="wait">
      {state.isWaiting ? (
        /* ── LOBBY ── */
        <motion.div
          key="lobby"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <LobbyScreen
            playerCount={state.playerCount}
            bagAmount={state.bagAmount}
            roundNumber={state.roundNumber}
          />
        </motion.div>
      ) : (
        /* ── LIVE GAME ── */
        <motion.div
          key="game"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 pb-40 pt-8 sm:px-6 lg:grid-cols-[1fr_320px] lg:pb-12"
        >
          {/* ── main column ── */}
          <div className="flex flex-col items-center gap-10">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
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

            {/* desktop YOINK button */}
            <div className="hidden w-full max-w-sm sm:block">
              <YoinkButton
                onYoink={onYoink}
                critical={critical}
                disabled={state.isRoundOver}
                youAreKing={state.kingIsYou}
                cost={state.currentCost}
                cooldownLeft={cooldownLeft}
                yoinkCount={state.yoinkCount}
              />
              <p className="mt-3 text-center font-mono text-[11px] text-dim">
                85% to the bag · 10% rake · 5% jackpot reserve
              </p>
            </div>

            {/* activity feed replaces / supplements chain-of-fallen */}
            <div className="w-full space-y-6">
              {state.yoinkHistory.length > 0 && (
                <ActivityFeed events={state.yoinkHistory} />
              )}
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

            {/* escalation tracker card */}
            <SpotlightCard
              spotlightColor="rgba(255,153,0,0.15)"
              radius={220}
              className="premium-card rounded-[24px]"
            >
              <div className="flex flex-col gap-3 px-5 py-4">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
                  Cost Escalation
                </h3>
                <div className="flex flex-col gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => {
                    const stepCost = Math.min(0.1 + i * 0.025, 0.5);
                    const active = Math.abs(stepCost - state.currentCost) < 0.001;
                    const past = stepCost < state.currentCost - 0.001;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg px-3 py-1.5 transition-colors duration-200"
                        style={{
                          background: active
                            ? "rgba(255,215,0,0.08)"
                            : "transparent",
                          border: active
                            ? "1px solid rgba(255,215,0,0.15)"
                            : "1px solid transparent",
                        }}
                      >
                        <span
                          className="font-mono text-xs"
                          style={{
                            color: active ? "#FFD700" : past ? "#3a3f4f" : "#8892a4",
                          }}
                        >
                          YOINK #{i + 1}
                          {i === 5 ? "+" : ""}
                        </span>
                        <span
                          className="font-mono text-xs font-bold tabular-nums"
                          style={{
                            color: active ? "#FFD700" : past ? "#3a3f4f" : "#8892a4",
                          }}
                        >
                          {stepCost.toFixed(3)} SOL
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="font-mono text-[10px] text-dim">
                  Cost resets to 0.100 each new round
                </p>
              </div>
            </SpotlightCard>

            {/* how it works */}
            <SpotlightCard
              spotlightColor="rgba(68,0,204,0.18)"
              radius={220}
              className="premium-card hidden rounded-[24px] lg:block"
            >
              <div className="flex flex-col gap-2 px-5 py-4">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
                  How it works
                </h3>
                <ol className="flex flex-col gap-2 text-xs text-slate">
                  <li>
                    <span className="font-mono text-gold">01</span> One king
                    holds the bag at all times.
                  </li>
                  <li>
                    <span className="font-mono text-gold">02</span> Pay{" "}
                    {GAME_CONFIG.BASE_COST} SOL (escalates per round) to YOINK
                    and reset the clock.
                  </li>
                  <li>
                    <span className="font-mono text-gold">03</span> Clock hits
                    zero — king takes the entire bag.
                  </li>
                  <li>
                    <span className="font-mono text-gold">04</span> 3-second
                    cooldown after each YOINK — no bot sniping.
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
              cost={state.currentCost}
              cooldownLeft={cooldownLeft}
              yoinkCount={state.yoinkCount}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
