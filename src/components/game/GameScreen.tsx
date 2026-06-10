import { AnimatePresence, motion } from "framer-motion";
import { TrendingUp, Droplets, Coins, Zap, Flame, DollarSign } from "lucide-react";
import type { GameState } from "@/lib/types";
import { GAME_CONFIG, FUSE_CONFIG, drainPctLabel } from "@/lib/types";
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

// ── Earnings card ──────────────────────────────────────────────────────────────
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
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
            House Earnings
          </h3>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald/20 bg-emerald/10 px-2 py-0.5 font-mono text-[10px] text-emerald">
            <span className="blink-dot h-1.5 w-1.5" aria-hidden />
            Live
          </span>
        </div>
        <div className="divide-y divide-white/[0.05]">
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 font-mono text-xs text-slate">
              <Coins className="h-3.5 w-3.5 text-gold-deep" aria-hidden />
              10% rake (per YOINK)
            </span>
            <span className="font-mono text-xs font-bold text-gold">
              {formatSol((GAME_CONFIG.RAKE_BPS / 10_000) * GAME_CONFIG.BASE_COST, 3)}{" "}
              <span className="text-gold/50">SOL ea.</span>
            </span>
          </div>
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
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 font-mono text-xs text-slate">
              <Zap className="h-3.5 w-3.5 text-gold" aria-hidden />
              Current drain tier
            </span>
            <span className="font-mono text-xs font-bold text-gold">
              {currentDrainPct} <span className="text-dim">per YOINK</span>
            </span>
          </div>
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
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            Drain tiers
          </p>
          <div className="flex flex-col gap-1">
            {GAME_CONFIG.DRAIN_TIERS.map((tier, i) => {
              const active = bagAmount >= tier.minBag && bagAmount < tier.maxBag;
              return (
                <div key={i} className="flex items-center justify-between transition-colors duration-300">
                  <span className="font-mono text-[11px]" style={{ color: active ? "#FFD700" : "#3a3f4f" }}>
                    {tier.maxBag >= 999 ? `> ${tier.minBag} SOL` : `${tier.minBag}–${tier.maxBag} SOL`}
                  </span>
                  <span className="font-mono text-[11px] font-bold tabular-nums" style={{ color: active ? "#FFD700" : "#3a3f4f" }}>
                    {tier.bps / 100}% drain
                    {active && (
                      <span className="ml-1.5 rounded-full bg-gold/20 px-1.5 py-0.5 text-[9px] text-gold">active</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}

// ── Fuse + Escalating Fee card — replaces CostEscalationCard ──────────────────
function FuseCard({
  roundFeeMultiplier,
  currentCost,
  yoinkCount,
}: {
  roundFeeMultiplier: number;
  currentCost: number;
  yoinkCount: number;
}) {
  const feeIntensity = (roundFeeMultiplier - 1) / (FUSE_CONFIG.FEE_MAX_MULT - 1);
  const feeColor =
    feeIntensity < 0.3 ? "#00E676" :
    feeIntensity < 0.6 ? "#FFD700" :
    "#FF2200";

  return (
    <SpotlightCard
      spotlightColor="rgba(255,34,0,0.10)"
      radius={220}
      className="premium-card rounded-[24px]"
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
            Round Heat
          </h3>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
            style={{
              background: `${feeColor}18`,
              border: `1px solid ${feeColor}40`,
              color: feeColor,
            }}
          >
            {roundFeeMultiplier.toFixed(2)}×
          </span>
        </div>

        {/* Fee bar */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-dim">Escalating fee</span>
            <span className="font-mono text-[11px] font-bold" style={{ color: feeColor }}>
              +{((roundFeeMultiplier - 1) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, #00E676, ${feeColor})`,
                transformOrigin: "left center",
                willChange: "transform",
              }}
              animate={{ scaleX: feeIntensity }}
              initial={{ scaleX: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* Current cost */}
        <div
          className="flex items-center justify-between rounded-xl px-3 py-2.5"
          style={{
            background: `${feeColor}08`,
            border: `1px solid ${feeColor}20`,
          }}
        >
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5" style={{ color: feeColor }} aria-hidden />
            <span className="font-mono text-xs text-slate">Next YOINK costs</span>
          </div>
          <motion.span
            key={currentCost.toFixed(3)}
            initial={{ scale: 1.12 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.25 }}
            className="font-mono text-sm font-bold tabular-nums"
            style={{ color: feeColor, willChange: "transform" }}
          >
            {formatSol(currentCost, 3)} SOL
          </motion.span>
        </div>

        {/* Yoink count this round */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-dim">YOINKs this round</span>
          <span className="font-mono text-[11px] font-bold text-white">{yoinkCount}</span>
        </div>

        <p className="font-mono text-[10px] text-dim">
          Each YOINK adds +{(FUSE_CONFIG.FEE_STEP * 100).toFixed(0)}% to the base cost.
          Spam is expensive. Act decisively.
        </p>

        {/* Hidden fuse callout */}
        <div className="flex items-center gap-2 rounded-xl border border-blood/15 bg-blood/[0.06] px-3 py-2">
          <Flame className="h-3.5 w-3.5 shrink-0 text-blood" aria-hidden />
          <p className="font-mono text-[10px] text-blood/80">
            The fuse is lit. Nobody knows when it ends.
          </p>
        </div>
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
  // Critical = last ~15% of the fuse — but we estimate from fee multiplier
  // since we don't expose exact time. High fee = late in round = critical.
  const critical = state.roundFeeMultiplier > 1.8 && !state.isRoundOver;

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

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <BagAmount amount={state.bagAmount} />
            </motion.div>

            <div className="grid w-full grid-cols-[auto_1fr] items-center gap-3 sm:flex sm:flex-col sm:items-center sm:gap-6">
              {/* Hidden fuse danger ring — no countdown shown */}
              <CountdownRing
                countdown={state.countdown}
                fuseSeconds={state.fuseSeconds}
                compact
              />
              <KingCard
                king={state.currentKing}
                isYou={state.kingIsYou}
                heldFor={state.kingHeldFor}
                critical={critical}
              />
            </div>

            <div className="hidden w-full max-w-sm sm:block">
              <YoinkButton
                onYoink={onYoink}
                critical={critical}
                disabled={state.isRoundOver}
                youAreKing={state.kingIsYou}
                cost={state.currentCost}
                cooldownLeft={cooldownLeft}
                yoinkCount={state.yoinkCount}
                roundFeeMultiplier={state.roundFeeMultiplier}
              />
              <FeeBreakdown bagAmount={state.bagAmount} />
            </div>

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
            <EarningsCard
              totalDrained={state.totalDrained}
              roundDrained={state.roundDrained}
              bagAmount={state.bagAmount}
            />
            <FuseCard
              roundFeeMultiplier={state.roundFeeMultiplier}
              currentCost={state.currentCost}
              yoinkCount={state.yoinkCount}
            />
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
                  <li><span className="font-mono text-gold">01</span> One king holds the bag at all times.</li>
                  <li><span className="font-mono text-gold">02</span> Pay SOL to YOINK the bag — resets the fuse.</li>
                  <li>
                    <span className="font-mono text-gold">03</span>{" "}
                    <span className="text-blood">The fuse end time is hidden.</span>{" "}
                    Nobody knows when the round ends.
                  </li>
                  <li><span className="font-mono text-gold">04</span> When the fuse blows — king wins everything.</li>
                  <li>
                    <span className="font-mono text-gold">05</span>{" "}
                    Each YOINK raises the cost by +{(FUSE_CONFIG.FEE_STEP * 100).toFixed(0)}%.
                    Spam costs you.
                  </li>
                  <li><span className="font-mono text-gold">06</span> 3s cooldown per wallet — no bot sniping.</li>
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
              roundFeeMultiplier={state.roundFeeMultiplier}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
