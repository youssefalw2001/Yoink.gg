import { AnimatePresence, motion } from "framer-motion";
import { TrendingUp, Droplets, Coins, Zap } from "lucide-react";
import type { GameState } from "@/lib/types";
import { GAME_CONFIG, drainPctLabel } from "@/lib/types";
import { formatSol } from "@/lib/utils";
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

// ── Earnings card — shows the house revenue accumulating live ─────────────────
function EarningsCard({
  totalDrained,
  roundDrained,
  bagAmount,
}: {
  totalDrained: number;
  roundDrained: number;
  bagAmount: number;
}) {
  const currentDrainPct = drainPctLabel(bagAmount);

  return (
    <SpotlightCard
      spotlightColor="rgba(0,230,118,0.12)"
      radius={220}
      className="premium-card rounded-[24px]"
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        {/* header */}
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
            House Earnings
          </h3>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald/20 bg-emerald/10 px-2 py-0.5 font-mono text-[10px] text-emerald">
            <span className="blink-dot h-1.5 w-1.5" aria-hidden />
            Live
          </span>
        </div>

        {/* rows */}
        <div className="divide-y divide-white/[0.05]">
          {/* rake row */}
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 font-mono text-xs text-slate">
              <Coins className="h-3.5 w-3.5 text-gold-deep" aria-hidden />
              10% rake (per YOINK)
            </span>
            <span className="font-mono text-xs font-bold text-gold">
              {formatSol(
                (GAME_CONFIG.RAKE_BPS / 10_000) *
                  GAME_CONFIG.BASE_COST,
                3,
              )}{" "}
              <span className="text-gold/50">SOL ea.</span>
            </span>
          </div>

          {/* drain this round */}
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 font-mono text-xs text-slate">
              <Droplets className="h-3.5 w-3.5 text-phantom" aria-hidden />
              Bag drain this round
            </span>
            <motion.span
              key={roundDrained.toFixed(4)}
              initial={{ scale: 1.1, color: "#00E676" }}
              animate={{ scale: 1, color: "#FFE566" }}
              transition={{ duration: 0.3 }}
              className="font-mono text-xs font-bold tabular-nums"
            >
              {formatSol(roundDrained, 4)} SOL
            </motion.span>
          </div>

          {/* current drain tier */}
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 font-mono text-xs text-slate">
              <Zap className="h-3.5 w-3.5 text-gold" aria-hidden />
              Current drain tier
            </span>
            <span className="font-mono text-xs font-bold text-gold">
              {currentDrainPct}{" "}
              <span className="text-dim">per YOINK</span>
            </span>
          </div>

          {/* total drained all time */}
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 font-mono text-xs text-slate">
              <TrendingUp className="h-3.5 w-3.5 text-emerald" aria-hidden />
              Total drained (session)
            </span>
            <motion.span
              key={totalDrained.toFixed(3)}
              initial={{ scale: 1.08, color: "#00E676" }}
              animate={{ scale: 1, color: "#eef1f6" }}
              transition={{ duration: 0.4 }}
              className="font-mono text-xs font-bold tabular-nums text-white"
            >
              {formatSol(totalDrained, 4)} SOL
            </motion.span>
          </div>
        </div>

        {/* drain tier ladder */}
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            Drain tiers
          </p>
          <div className="flex flex-col gap-1">
            {GAME_CONFIG.DRAIN_TIERS.map((tier, i) => {
              const active =
                bagAmount >= tier.minBag && bagAmount < tier.maxBag;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between transition-colors duration-300"
                >
                  <span
                    className="font-mono text-[11px]"
                    style={{ color: active ? "#FFD700" : "#3a3f4f" }}
                  >
                    {tier.minBag === 0 ? "< " : ""}
                    {tier.maxBag >= 999
                      ? `> ${tier.minBag} SOL`
                      : `${tier.minBag}–${tier.maxBag} SOL`}
                  </span>
                  <span
                    className="font-mono text-[11px] font-bold tabular-nums"
                    style={{ color: active ? "#FFD700" : "#3a3f4f" }}
                  >
                    {tier.bps / 100}% drain
                    {active && (
                      <span className="ml-1.5 rounded-full bg-gold/20 px-1.5 py-0.5 text-[9px] text-gold">
                        active
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="font-mono text-[10px] text-dim">
          Drain bleeds the bag directly into the house wallet on every YOINK.
          Resets to 1% each new round.
        </p>
      </div>
    </SpotlightCard>
  );
}

// ── Cost escalation card ───────────────────────────────────────────────────────
function CostEscalationCard({ currentCost }: { currentCost: number }) {
  return (
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
            const active   = Math.abs(stepCost - currentCost) < 0.001;
            const past     = stepCost < currentCost - 0.001;
            return (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg px-3 py-1.5 transition-colors duration-200"
                style={{
                  background: active ? "rgba(255,215,0,0.08)" : "transparent",
                  border:     active ? "1px solid rgba(255,215,0,0.15)" : "1px solid transparent",
                }}
              >
                <span
                  className="font-mono text-xs"
                  style={{ color: active ? "#FFD700" : past ? "#3a3f4f" : "#8892a4" }}
                >
                  YOINK #{i + 1}{i === 5 ? "+" : ""}
                </span>
                <span
                  className="font-mono text-xs font-bold tabular-nums"
                  style={{ color: active ? "#FFD700" : past ? "#3a3f4f" : "#8892a4" }}
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
  );
}

// ── Fee breakdown label ────────────────────────────────────────────────────────
function FeeBreakdown({ bagAmount }: { bagAmount: number }) {
  const drainPct = drainPctLabel(bagAmount);
  return (
    <p className="mt-3 text-center font-mono text-[11px] text-dim">
      83% to bag · 10% rake · 5% jackpot · {drainPct} bag drain
    </p>
  );
}

// ── Main GameScreen ────────────────────────────────────────────────────────────
export function GameScreen({ state, onYoink, cooldownLeft }: GameScreenProps) {
  const critical = state.countdown <= 5 && !state.isRoundOver;

  return (
    <AnimatePresence mode="wait">
      {state.isWaiting ? (
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
        <motion.div
          key="game"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-4 pb-[88px] pt-4 sm:gap-6 sm:px-6 sm:pb-6 sm:pt-6 lg:grid-cols-[1fr_320px] lg:pb-10"
        >
          {/* ── main column ── */}
          <div className="flex flex-col items-center gap-4 sm:gap-6">

            {/* Bag amount — tighter on mobile */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <BagAmount amount={state.bagAmount} />
            </motion.div>

            {/*
              Mobile hero row: CountdownRing (compact) + KingCard side-by-side
              — keeps the critical action area above the fold on 375px screens.
              On sm+ they stack back to full-width centered.
            */}
            <div className="grid w-full grid-cols-[auto_1fr] items-center gap-3 sm:flex sm:flex-col sm:items-center sm:gap-6">
              <CountdownRing countdown={state.countdown} compact />

              <KingCard
                king={state.currentKing}
                isYou={state.kingIsYou}
                heldFor={state.kingHeldFor}
                critical={critical}
              />
            </div>

            {/* YOINK button — visible on sm+ inline; hidden on mobile (fixed bar below) */}
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
              <FeeBreakdown bagAmount={state.bagAmount} />
            </div>

            {/* Activity + chain — below fold on mobile, fine to scroll */}
            <div className="w-full space-y-4 sm:space-y-6">
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

            {/* EARNINGS CARD — live house revenue tracker */}
            <EarningsCard
              totalDrained={state.totalDrained}
              roundDrained={state.roundDrained}
              bagAmount={state.bagAmount}
            />

            <CostEscalationCard currentCost={state.currentCost} />

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
                    {GAME_CONFIG.BASE_COST} SOL (escalates) to YOINK and reset
                    the clock.
                  </li>
                  <li>
                    <span className="font-mono text-gold">03</span> Clock hits
                    zero — king wins the entire bag.
                  </li>
                  <li>
                    <span className="font-mono text-gold">04</span> 3s cooldown
                    per wallet — no bot sniping.
                  </li>
                  <li>
                    <span className="font-mono text-gold">05</span> Each YOINK
                    drains 1–3% of the bag to the house.
                  </li>
                </ol>
              </div>
            </SpotlightCard>
          </div>

          {/* ── mobile fixed YOINK bar ── */}
          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.06] bg-[rgba(8,8,15,0.92)] px-4 pb-[env(safe-area-inset-bottom,0px)] pt-3 backdrop-blur-xl sm:hidden">
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
