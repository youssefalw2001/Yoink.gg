/**
 * Bid Wars — BidKingCard
 *
 * The savage avatar card for the current leader.
 * 200×200 avatar, blood-red pulsing border, wallet balance bar.
 * Shows rank badge, bid amount, wallet balance vs yours.
 */

import { motion, AnimatePresence } from "framer-motion";
import { Crown, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { KingCardShader } from "@/components/ui/KingCardShader";
import { AnimatedKingAvatar } from "@/components/ui/AnimatedKingAvatar";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { truncateAddress, formatSol } from "@/lib/utils";
import type { Bidder } from "@/lib/bidWarsState";

interface BidKingCardProps {
  leader: Bidder | null;
  yourBid: number;
  critical: boolean;
}

export function BidKingCard({ leader, yourBid, critical }: BidKingCardProps) {
  if (!leader) {
    return (
      <div className="flex flex-col items-center justify-center h-72 gap-3 opacity-50">
        <Crown className="h-10 w-10 text-dim" />
        <span className="font-mono text-sm text-slate">No bids yet — be first</span>
      </div>
    );
  }

  const key = `${leader.wallet}-${leader.bid}`;
  const isYou = leader.isYou;
  const richness = Math.min(leader.walletBal / 200, 1); // 0–1 fill
  const vsYou = yourBid > 0 ? leader.bid / Math.max(yourBid, 0.01) : 0;

  return (
    <div className="relative mx-auto flex w-full max-w-xs flex-col items-center gap-4">

      {/* King card */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={key}
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: [0.88, 1.03, 1] }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
          className="w-full"
        >
          {/* shockwave ring on new leader */}
          <motion.span
            key={`shock-${key}`}
            initial={{ scale: 0, opacity: 0.9 }}
            animate={{ scale: 3.5, opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-0 z-0 m-auto h-28 w-28 rounded-full border-2 border-blood"
            aria-hidden
          />

          <SpotlightCard
            spotlightColor={isYou ? "rgba(255,215,0,0.2)" : "rgba(255,34,0,0.18)"}
            radius={300}
            className="relative premium-card overflow-hidden rounded-[24px]"
          >
            {/* OGL vortex shader */}
            <KingCardShader isYou={isYou} critical={critical} kingKey={key} />

            <div className="relative z-10 flex flex-col items-center gap-4 px-6 py-6">
              {/* LEADER badge */}
              <span
                className="flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{
                  color:        isYou ? "#FFD700" : "#FF2200",
                  borderColor:  isYou ? "rgba(255,215,0,0.3)" : "rgba(255,34,0,0.3)",
                  background:   isYou ? "rgba(255,215,0,0.08)" : "rgba(255,34,0,0.08)",
                }}
              >
                <Crown className="h-3.5 w-3.5" aria-hidden />
                {isYou ? "You Lead" : "Leads the Bid"}
              </span>

              {/* LARGE avatar — 200px, the big dogs treatment */}
              <motion.div
                key={`av-${key}`}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="relative"
              >
                <div
                  className="overflow-hidden rounded-3xl border-[3px] shadow-2xl"
                  style={{
                    width: 160, height: 160,
                    borderColor: isYou
                      ? "#FFD700"
                      : critical ? "#FF2200" : "#FF2200",
                    boxShadow: isYou
                      ? "0 0 32px rgba(255,215,0,0.5), 0 0 60px rgba(255,215,0,0.2)"
                      : "0 0 32px rgba(255,34,0,0.5), 0 0 60px rgba(255,34,0,0.2)",
                    animation: critical ? "danger-pulse 0.7s ease-in-out infinite" : undefined,
                  }}
                >
                  <AnimatedKingAvatar
                    wallet={isYou ? "You" : leader.wallet}
                    size={160}
                    isKing
                    critical={critical}
                  />
                </div>
                {/* Rank #1 crown overlay */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span
                    className="rounded-full border border-gold/40 bg-gold/15 px-2.5 py-0.5 font-display text-[10px] font-bold text-gold"
                  >
                    #1
                  </span>
                </div>
              </motion.div>

              {/* Wallet + bid */}
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="font-mono text-base font-bold text-white">
                  {isYou ? "You" : truncateAddress(leader.wallet)}
                </span>
                <span
                  className="font-mono text-2xl font-black tabular-nums"
                  style={{ color: isYou ? "#FFD700" : "#FF2200" }}
                >
                  {formatSol(leader.bid)} SOL
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate">
                  current bid
                </span>
              </div>

              {/* Wallet balance bar */}
              <div className="w-full space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-dim">Wallet Balance</span>
                  <span className="font-mono text-xs font-bold text-slate">
                    ~{formatSol(leader.walletBal)} SOL
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: richness }}
                    transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
                    style={{
                      transformOrigin: "left center",
                      background: isYou
                        ? "linear-gradient(90deg, #FFD700, #FF9900)"
                        : "linear-gradient(90deg, #FF2200, #FF5533)",
                    }}
                  />
                </div>

                {/* vs your bid */}
                {yourBid > 0 && (
                  <div className="flex items-center justify-center gap-1.5 pt-1">
                    {vsYou > 1.5 ? (
                      <TrendingUp className="h-3.5 w-3.5 text-blood" />
                    ) : vsYou < 0.8 ? (
                      <TrendingDown className="h-3.5 w-3.5 text-emerald" />
                    ) : (
                      <Minus className="h-3.5 w-3.5 text-slate" />
                    )}
                    <span className="font-mono text-[10px] text-slate">
                      {vsYou > 1.5
                        ? `${vsYou.toFixed(1)}× your bid — outmatched`
                        : vsYou < 0.8
                          ? "You're ahead"
                          : "Close race"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </SpotlightCard>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
