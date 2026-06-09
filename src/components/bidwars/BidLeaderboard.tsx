/**
 * Bid Wars — BidLeaderboard
 *
 * Live ranking of all bidders + activity feed.
 * Shows wallet balance bars so you can see who has deep pockets.
 */

import { AnimatePresence, motion } from "framer-motion";
import { TrendingUp, Flame } from "lucide-react";
import { AnimatedKingAvatar } from "@/components/ui/AnimatedKingAvatar";
import { truncateAddress, formatSol } from "@/lib/utils";
import type { Bidder, BidEvent } from "@/lib/bidWarsState";

interface BidLeaderboardProps {
  bidders:    Bidder[];
  bidHistory: BidEvent[];
}

const RANK_COLORS = ["#FFD700", "#C0C0C0", "#7000FF"];

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 2) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export function BidLeaderboard({ bidders, bidHistory }: BidLeaderboardProps) {
  const maxBal = Math.max(...bidders.map(b => b.walletBal), 1);

  return (
    <div className="flex flex-col gap-6 w-full">

      {/* ── Bidder Rankings ── */}
      <div>
        <div className="mb-3 flex items-center gap-2 px-1">
          <TrendingUp className="h-3.5 w-3.5 text-blood" aria-hidden />
          <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
            Live Rankings
          </h3>
        </div>

        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {bidders.slice(0, 8).map((b) => {
              const color  = RANK_COLORS[b.rank - 1] ?? "#3a3f4f";
              const balPct = b.walletBal / maxBal;
              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                  style={b.rank === 1 ? { borderColor: `${color}33`, background: `${color}0a` } : undefined}
                >
                  {/* rank */}
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold"
                    style={{ background: `${color}22`, color }}
                  >
                    {b.rank}
                  </span>

                  {/* mini avatar */}
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/10">
                    <AnimatedKingAvatar
                      wallet={b.isYou ? "You" : b.wallet}
                      size={32}
                      isKing={b.rank === 1}
                    />
                  </div>

                  {/* wallet + balance bar */}
                  <div className="flex flex-1 flex-col gap-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="font-mono text-xs font-bold truncate"
                        style={{ color: b.rank === 1 ? color : "#eef1f6" }}
                      >
                        {b.isYou ? "You" : truncateAddress(b.wallet)}
                      </span>
                      <span className="font-mono text-xs font-bold tabular-nums shrink-0"
                        style={{ color }}>
                        {b.bid > 0 ? formatSol(b.bid, 3) : "—"}
                      </span>
                    </div>
                    {/* wallet balance bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: b.rank === 1
                              ? `linear-gradient(90deg, ${color}, ${color}88)`
                              : "rgba(255,255,255,0.15)",
                            transformOrigin: "left center",
                          }}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: balPct }}
                          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                        />
                      </div>
                      <span className="font-mono text-[9px] text-dim shrink-0">
                        {formatSol(b.walletBal, 0)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Bid Activity Feed ── */}
      {bidHistory.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2 px-1">
            <Flame className="h-3.5 w-3.5 text-gold-deep" aria-hidden />
            <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
              Bid Activity
            </h3>
          </div>
          <div className="no-scrollbar flex max-h-48 flex-col gap-1.5 overflow-y-auto">
            <AnimatePresence initial={false} mode="popLayout">
              {bidHistory.map((ev) => (
                <motion.div
                  key={ev.id}
                  layout
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <TrendingUp
                      className="h-3 w-3 shrink-0"
                      style={{ color: ev.isYou ? "#FFD700" : "#FF2200" }}
                      aria-hidden
                    />
                    <span
                      className="font-mono text-[11px] font-bold truncate"
                      style={{ color: ev.isYou ? "#FFE566" : "#eef1f6" }}
                    >
                      {ev.isYou ? "You" : truncateAddress(ev.wallet)}
                    </span>
                    <span className="font-mono text-[11px] text-slate">bid</span>
                    <span
                      className="font-mono text-[11px] font-bold tabular-nums"
                      style={{ color: ev.isYou ? "#FFD700" : "#FF5533" }}
                    >
                      {formatSol(ev.amount, 3)}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] text-dim shrink-0">
                    {timeAgo(ev.ts)}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
