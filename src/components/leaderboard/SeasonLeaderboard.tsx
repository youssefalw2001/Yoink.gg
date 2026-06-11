/**
 * YOINK.GG — Season Leaderboard Component
 *
 * Weekly season: points weighted by room (Court > Arena > Grind > Pit).
 * Top 10 win XP + badge prizes. On mainnet: top 10 win SOL from rake pool.
 *
 * Shows:
 *   - Season timer (resets Monday 00:00 UTC)
 *   - Prize pool breakdown
 *   - Top 10 ranked entries
 *   - Player's own row highlighted if not in top 10
 *   - "How points work" explanation
 */

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Clock, Crown, ChevronDown, ChevronUp, Info } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import {
  generateSeasonLeaderboard,
  getPrizeTier,
  timeUntilSeasonReset,
  PRIZE_TIERS,
  ROOM_POINTS,
  type SeasonEntry,
} from "@/lib/seasonLeaderboard";
import { truncateAddress } from "@/lib/utils";

interface SeasonLeaderboardProps {
  playerWallet: string | null;
}

function RankBadge({ rank }: { rank: number }) {
  const color = rank === 1 ? "#FFD700" : rank <= 3 ? "#FF9900" : rank <= 5 ? "#7000FF" : "#8892a4";
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-black"
      style={{ background: `${color}18`, border: `1px solid ${color}35`, color }}
    >
      {rank === 1 ? <Crown className="h-3.5 w-3.5" aria-hidden /> : rank}
    </div>
  );
}

function SeasonRow({ entry, index }: { entry: SeasonEntry; index: number }) {
  const tier  = getPrizeTier(entry.rank);
  const color = entry.rank === 1 ? "#FFD700"
    : entry.rank <= 3 ? "#FF9900"
    : entry.rank <= 5 ? "#7000FF"
    : entry.isYou ? "#eef1f6"
    : "#8892a4";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{
        background: entry.rank === 1
          ? "rgba(255,215,0,0.07)"
          : entry.isYou
            ? "rgba(112,0,255,0.06)"
            : "rgba(255,255,255,0.02)",
        border: entry.rank === 1
          ? "1px solid rgba(255,215,0,0.18)"
          : entry.isYou
            ? "1px solid rgba(112,0,255,0.15)"
            : "1px solid transparent",
      }}
    >
      <RankBadge rank={entry.rank} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm font-bold" style={{ color }}>
            {entry.isYou ? "You" : entry.displayName ?? truncateAddress(entry.wallet, 4, 4)}
          </span>
          {tier && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em]"
              style={{ background: `${color}18`, color }}
            >
              {tier.badge}
            </span>
          )}
          {entry.isYou && (
            <span className="shrink-0 rounded-full bg-phantom/15 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-phantom">
              You
            </span>
          )}
        </div>
        {entry.prize && (
          <span className="font-mono text-[10px]" style={{ color: `${color}88` }}>
            {entry.prize}
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-mono text-sm font-black tabular-nums" style={{ color }}>
          {entry.points.toLocaleString()}
        </span>
        <span className="font-mono text-[9px] text-dim">pts</span>
      </div>
    </motion.div>
  );
}

export function SeasonLeaderboard({ playerWallet }: SeasonLeaderboardProps) {
  const entries    = useMemo(() => generateSeasonLeaderboard(playerWallet), [playerWallet]);
  const timer      = timeUntilSeasonReset();
  const [showHow, setShowHow] = useState(false);

  const totalPoints = entries.reduce((s, e) => s + e.points, 0);

  return (
    <div className="flex flex-col gap-5">

      {/* Season header */}
      <SpotlightCard spotlightColor="rgba(255,215,0,0.12)" radius={320} className="premium-card rounded-[24px]">
        <div className="h-[2px] w-full rounded-t-[24px]" style={{ background: "linear-gradient(90deg, transparent, #FFE566, #FFD700, transparent)" }} />
        <div className="flex flex-col gap-4 px-6 py-5">

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-gold" aria-hidden />
              <div>
                <h2 className="font-display text-xl font-black text-white">Weekly Season</h2>
                <p className="font-mono text-[11px] text-slate">Top 10 earn XP + prizes every Monday</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate" aria-hidden />
                <span className="font-mono text-xs text-slate">Resets in</span>
              </div>
              <span className="font-mono text-sm font-bold text-gold tabular-nums">
                {timer.days}d {timer.hours}h {timer.minutes}m
              </span>
            </div>
          </div>

          {/* Prize tiers strip */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRIZE_TIERS.map((tier) => (
              <div
                key={tier.badge}
                className="flex flex-col gap-1 rounded-xl px-3 py-2.5"
                style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.10)" }}
              >
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
                  {tier.minRank === tier.maxRank ? `#${tier.minRank}` : `#${tier.minRank}–${tier.maxRank}`}
                </span>
                <span className="font-mono text-xs font-bold text-gold">{tier.label}</span>
                <span className="font-mono text-[10px] text-slate">+{tier.xpBonus.toLocaleString()} XP</span>
                <span className="font-mono text-[9px] text-dim">{tier.solPrize} SOL (mainnet)</span>
              </div>
            ))}
          </div>

          {/* Total season activity */}
          <div
            className="flex items-center justify-between rounded-xl px-3 py-2"
            style={{ background: "rgba(255,215,0,0.05)", border: "1px solid rgba(255,215,0,0.10)" }}
          >
            <span className="font-mono text-[11px] text-slate">Season total points</span>
            <span className="font-mono text-sm font-bold text-gold tabular-nums">
              {totalPoints.toLocaleString()}
            </span>
          </div>
        </div>
      </SpotlightCard>

      {/* Leaderboard */}
      <SpotlightCard spotlightColor="rgba(255,215,0,0.08)" radius={280} className="premium-card rounded-[24px]">
        <div className="flex flex-col gap-2 px-4 py-4">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">Season Standings</span>
            <button
              type="button"
              onClick={() => setShowHow((s) => !s)}
              className="flex items-center gap-1 font-mono text-[10px] text-dim transition-colors hover:text-white"
            >
              <Info className="h-3 w-3" aria-hidden />
              How points work
              {showHow
                ? <ChevronUp className="h-3 w-3" aria-hidden />
                : <ChevronDown className="h-3 w-3" aria-hidden />}
            </button>
          </div>

          <AnimatePresence>
            {showHow && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div
                  className="mb-3 rounded-xl px-4 py-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">Points per yoink</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(ROOM_POINTS).map(([room, pts]) => (
                      <div key={room} className="flex items-center justify-between">
                        <span className="font-mono text-[11px] capitalize text-slate">{room === "court" ? "King's Court" : room === "grind" ? "The Grind" : room === "arena" ? "The Arena" : "The Pit"}</span>
                        <span className="font-mono text-[11px] font-bold text-gold">{pts} pt{pts !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-1.5">
            {entries.map((entry, i) => (
              <SeasonRow key={entry.wallet} entry={entry} index={i} />
            ))}
          </div>

          <p className="mt-2 text-center font-mono text-[10px] text-dim">
            Resets every Monday · Prizes awarded after reset · On-chain on mainnet
          </p>
        </div>
      </SpotlightCard>

    </div>
  );
}
