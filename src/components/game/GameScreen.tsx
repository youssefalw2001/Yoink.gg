import { memo, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, DollarSign, Sparkles } from "lucide-react";
import type { GameState } from "@/lib/types";
import { FUSE_CONFIG } from "@/lib/types";
import { type RoomId } from "@/lib/rooms";
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
import { WalletTrackerPanel } from "./WalletTrackerPanel";

interface GameScreenProps {
  state: GameState;
  onYoink: () => void;
  cooldownLeft: number;
  roomId?: RoomId;
  ownedItems?: string[];
  pumpFakeBalance?: number | null;
  onActivateWalletTracker?: () => void;
  onActivateFuseBurner?: () => void;
  cardTheme?: string;
}

// ── Fuse + Escalating Fee card — replaces CostEscalationCard ──────────────────
const FuseCard = memo(function FuseCard({
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
});

// ── Fuse Burner control — compact, sits next to the YOINK button ──────────────
// Owned + idle  → one-tap "Burn 2×" button
// Active        → pulsing "2× ON" indicator
// Not owned     → renders nothing (sold in the Armory)
const FuseBurnerControl = memo(function FuseBurnerControl({
  owned,
  active,
  isRoundOver,
  onActivate,
}: {
  owned:       boolean;
  active:      boolean;
  isRoundOver: boolean;
  onActivate:  () => void;
}) {
  if (active) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-blood/40 bg-blood/[0.14] px-3 py-3.5"
        style={{ minWidth: 72, willChange: "transform" }}
        aria-label="Fuse Burner active — burning at double speed"
        title="Fuse burning at 2× speed this round"
      >
        <motion.span
          animate={{ opacity: [1, 0.45, 1] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ willChange: "opacity" }}
        >
          <Flame className="h-5 w-5 text-blood" aria-hidden />
        </motion.span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-blood">2× ON</span>
      </motion.div>
    );
  }

  if (!owned) return null;

  return (
    <motion.button
      type="button"
      onClick={onActivate}
      disabled={isRoundOver}
      whileHover={!isRoundOver ? { scale: 1.05 } : undefined}
      whileTap={!isRoundOver ? { scale: 0.94 } : undefined}
      transition={{ duration: 0.14, ease: [0.34, 1.56, 0.64, 1] }}
      className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-blood/35 bg-blood/10 px-3 py-3.5 transition-colors duration-200 hover:bg-blood/20 disabled:cursor-not-allowed disabled:opacity-40"
      style={{ minWidth: 72, willChange: "transform" }}
      aria-label="Activate Fuse Burner — doubles fuse speed for this round"
      title="Fuse Burner — 2× fuse speed this round"
    >
      <Flame className="h-5 w-5 text-blood" aria-hidden />
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-blood">Burn 2×</span>
    </motion.button>
  );
});

// ── Live progressive jackpot ticker — its own memo so the 150ms tick that
//    bumps the number only re-renders this tiny pill, not the whole sidebar ────
const JackpotTicker = memo(function JackpotTicker({ amount }: { amount: number }) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[20px] px-4 py-3"
      style={{
        background: "linear-gradient(90deg, rgba(112,0,255,0.12), rgba(255,215,0,0.10))",
        border:     "1px solid rgba(112,0,255,0.28)",
      }}
    >
      <div className="flex items-center gap-2">
        <motion.span
          animate={{ rotate: [0, -10, 10, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 2 }}
          style={{ willChange: "transform" }}
        >
          <Sparkles className="h-4 w-4 text-phantom" aria-hidden />
        </motion.span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate">
          Progressive Jackpot
        </span>
      </div>
      <span className="font-mono text-base font-black tabular-nums gold-text-gradient">
        {formatSol(amount, 2)}
      </span>
    </div>
  );
});

// ── Fee breakdown label ────────────────────────────────────────────────────────
function FeeBreakdown() {
  return (
    <p className="mt-3 text-center font-mono text-[11px] text-dim">
      83% to bag · 10% rake · 5% jackpot · 1–3% bag drain
    </p>
  );
}

// ── Main GameScreen ────────────────────────────────────────────────────────────
export function GameScreen({ state, onYoink, cooldownLeft, roomId = "arena", ownedItems = [], pumpFakeBalance = null, onActivateWalletTracker, onActivateFuseBurner, cardTheme }: GameScreenProps) {
  const critical = state.roundFeeMultiplier > 1.8 && !state.isRoundOver;
  const walletTrackerActive = ownedItems.includes("wallet_tracker");
  const ownsFuseBurner = ownedItems.includes("fuse_burner");
  const activateFuseBurner = onActivateFuseBurner ?? (() => {});
  // Stable array so the memoized WalletTrackerPanel doesn't re-render every tick
  const trackerWallets = useMemo(
    () => state.recentKings.map((k) => k.wallet),
    [state.recentKings],
  );

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
            roomId={roomId}
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
                theme={cardTheme}
              />
            </div>

            <div className="hidden w-full max-w-sm sm:block">
              <div className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
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
                <FuseBurnerControl
                  owned={ownsFuseBurner}
                  active={state.fuseBurnerActive}
                  isRoundOver={state.isRoundOver}
                  onActivate={activateFuseBurner}
                />
              </div>
              <FeeBreakdown />
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
            <JackpotTicker amount={state.jackpotAmount} />
            <StatsSidebar
              roundNumber={state.roundNumber}
              biggestBag={state.biggestBag}
              totalDistributed={state.totalDistributed}
              playerCount={state.playerCount}
            />
            <FuseCard
              roundFeeMultiplier={state.roundFeeMultiplier}
              currentCost={state.currentCost}
              yoinkCount={state.yoinkCount}
            />
            {/* Fuse commitment chip — SIMULATION ONLY (not yet on-chain VRF) */}
            <div
              className="flex flex-col gap-2 rounded-2xl px-4 py-3"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-dim">Fuse Commitment</span>
                <span className="rounded-full border border-slate/20 bg-slate/10 px-2 py-0.5 font-mono text-[9px] font-bold text-slate">
                  SIM
                </span>
              </div>
              <p className="font-mono text-[10px] leading-relaxed text-dim">
                Simulation preview — this hash is generated client-side. On-chain
                VRF (Switchboard) replaces it on devnet before any real SOL is at stake.
              </p>
              <div
                className="overflow-hidden rounded-lg px-2 py-1.5"
                style={{ background: "rgba(0,0,0,0.3)" }}
              >
                <p className="truncate font-mono text-[10px] text-slate">
                  {state.fuseCommitHash}
                </p>
              </div>
            </div>
            {/* Wallet Tracker — shows when owned, purchase prompt when not */}
            <WalletTrackerPanel
              wallets={trackerWallets}
              currentKing={state.currentKing}
              pumpFakeBalance={pumpFakeBalance}
              active={walletTrackerActive}
              onActivate={onActivateWalletTracker ?? (() => {})}
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
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
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
              <FuseBurnerControl
                owned={ownsFuseBurner}
                active={state.fuseBurnerActive}
                isRoundOver={state.isRoundOver}
                onActivate={activateFuseBurner}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
