/**
 * YOINK.GG — Bid Wars Spectate Mode
 *
 * Read-only live view of a running Bid Wars match.
 * Shown to players who haven't reached Rank 6 yet (and to anyone via a
 * future public spectate link).
 *
 * Goal: maximum dopamine. Show the tension, the big numbers, the wolves
 * fighting — make the watcher *feel* the pull of wanting to be in there.
 *
 * Layout:
 *   TOP:   "LIVE" ticker bar + round stats
 *   MID:   Countdown ring (read-only) + leader card (big, dramatic)
 *   RIGHT: Live bid feed scrolling in real-time
 *   BOT:   Wallet balance bars for all bidders (psychological warfare visible)
 *   CTA:   Sticky bottom bar — "Unlock at Rank 6" with XP progress
 *
 * GPU rules: transform + opacity only. will-change: transform on perpetual.
 * prefers-reduced-motion: kills all animations.
 * Lucide icons only — zero emojis.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye, Swords, Lock, TrendingUp, Users, Zap,
  ChevronUp, Flame, Radio,
} from "lucide-react";
import { CountdownRing } from "@/components/game/CountdownRing";
import { AnimatedKingAvatar } from "@/components/ui/AnimatedKingAvatar";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { useBidWarsState, type BidEvent, type Bidder } from "@/lib/bidWarsState";
import { formatSol, truncateAddress } from "@/lib/utils";
import type { PlayerProgress } from "@/lib/progression";

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Pulsing "LIVE" badge */
function LiveBadge() {
  const reduced = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  ).current;

  return (
    <span className="flex items-center gap-2 rounded-full border border-blood/30 bg-blood/10 px-3 py-1.5">
      <motion.span
        className="h-2 w-2 rounded-full bg-blood"
        animate={reduced ? {} : { opacity: [1, 0.25, 1] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
        style={{ willChange: "opacity" }}
      />
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-blood">
        Live
      </span>
    </span>
  );
}

/** Single scrolling bid event row */
function BidRow({ event, index }: { event: BidEvent; index: number }) {
  const reduced = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 18, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -12 }}
      transition={
        reduced
          ? { duration: 0 }
          : { type: "spring", stiffness: 420, damping: 34, delay: index * 0.02 }
      }
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
      style={{
        background: index === 0 ? "rgba(255,34,0,0.08)" : "rgba(255,255,255,0.02)",
        border: index === 0 ? "1px solid rgba(255,34,0,0.2)" : "1px solid transparent",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* mini avatar */}
        <div className="h-6 w-6 shrink-0 overflow-hidden rounded-lg border border-white/10">
          <AnimatedKingAvatar
            wallet={event.wallet}
            size={24}
            isKing={index === 0}
          />
        </div>
        <span className="font-mono text-[11px] font-bold truncate text-white">
          {truncateAddress(event.wallet, 4, 3)}
        </span>
        <TrendingUp
          className="h-3 w-3 shrink-0 text-blood"
          aria-hidden
        />
        <span className="font-mono text-[11px] font-bold tabular-nums text-blood">
          {formatSol(event.amount, 3)} SOL
        </span>
      </div>
      {index === 0 && (
        <span className="shrink-0 rounded-full bg-blood/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-blood">
          Top
        </span>
      )}
    </motion.div>
  );
}

/** Wallet balance bar row for a bidder */
function BalanceRow({
  bidder,
  maxBal,
  rank,
  index,
}: {
  bidder: Bidder;
  maxBal: number;
  rank: number;
  index: number;
}) {
  const pct = maxBal > 0 ? bidder.walletBal / maxBal : 0;
  const RANK_COLORS = ["#FF2200", "#FF5533", "#7000FF", "#FFD700", "#00E676"];
  const color = RANK_COLORS[index % RANK_COLORS.length];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-3"
    >
      {/* rank # */}
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold"
        style={{ background: `${color}22`, color }}
      >
        {rank}
      </span>

      {/* wallet */}
      <span className="w-[72px] shrink-0 font-mono text-[10px] text-slate truncate">
        {truncateAddress(bidder.wallet, 4, 3)}
      </span>

      {/* balance bar */}
      <div className="flex flex-1 items-center gap-2">
        <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${color}, ${color}88)`,
              transformOrigin: "left center",
              willChange: "transform",
            }}
            animate={{ scaleX: pct }}
            initial={{ scaleX: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-dim">
          ~{formatSol(bidder.walletBal, 0)} SOL
        </span>
      </div>

      {/* bid amount */}
      <span
        className="shrink-0 font-mono text-xs font-bold tabular-nums"
        style={{ color: bidder.bid > 0 ? color : "#3a3f4f" }}
      >
        {bidder.bid > 0 ? formatSol(bidder.bid, 2) : "—"}
      </span>
    </motion.div>
  );
}

// ─── Spectate pulse overlay — flashes on new bid ──────────────────────────────
function BidPulse({ trigger }: { trigger: number }) {
  return (
    <AnimatePresence>
      <motion.div
        key={trigger}
        className="pointer-events-none absolute inset-0 rounded-[24px]"
        initial={{ opacity: 0.22 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        style={{ background: "radial-gradient(ellipse at center, rgba(255,34,0,0.18), transparent 70%)" }}
        aria-hidden
      />
    </AnimatePresence>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface BidWarsSpectateProps {
  progress: PlayerProgress;
  requiredRank: number;
}

export function BidWarsSpectate({ progress, requiredRank }: BidWarsSpectateProps) {
  const { state } = useBidWarsState();

  const critical = state.countdown <= 5 && !state.isRoundOver;
  const leader   = state.leader;
  const maxBal   = Math.max(...state.bidders.map((b) => b.walletBal), 1);

  // Track bid count to trigger pulse flash
  const [bidPulse, setBidPulse] = useState(0);
  const prevHistLen = useRef(state.bidHistory.length);
  useEffect(() => {
    if (state.bidHistory.length > prevHistLen.current) {
      setBidPulse((n) => n + 1);
    }
    prevHistLen.current = state.bidHistory.length;
  }, [state.bidHistory.length]);

  // XP progress toward unlock
  const rankPct = Math.min((progress.level / requiredRank) * 100, 100);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-28 pt-6 sm:px-6">

      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blood/30 bg-blood/10">
            <Swords className="h-5 w-5 text-blood" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-xl font-black tracking-tight">
              <span className="text-white">BID </span>
              <span style={{ color: "#FF2200" }}>WARS</span>
            </h1>
            <div className="flex items-center gap-2">
              <Eye className="h-3 w-3 text-dim" aria-hidden />
              <span className="font-mono text-[10px] text-dim">Spectating · Round #{state.roundNumber}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LiveBadge />
          {/* live player count */}
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
            <Users className="h-3.5 w-3.5 text-slate" aria-hidden />
            <span className="font-mono text-xs text-slate">
              <span className="font-bold text-white">{state.bidders.length}</span> wolves
            </span>
          </div>
        </div>
      </div>

      {/* ── Spectate notice ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center gap-3 rounded-2xl border border-phantom/20 bg-phantom/[0.06] px-4 py-3"
      >
        <Radio className="h-4 w-4 shrink-0 text-phantom" aria-hidden />
        <p className="font-mono text-xs text-slate">
          You are <span className="font-bold text-white">watching live</span> — reach{" "}
          <span className="font-bold text-gold">Rank {requiredRank}</span> to enter the arena and place bids.
        </p>
      </motion.div>

      {/* ── Main grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">

        {/* LEFT: countdown + leader card + stats */}
        <div className="flex flex-col items-center gap-6">

          {/* Prize bag — big and dramatic */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-1"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
              Prize Bag
            </span>
            <span
              className="gold-text-gradient font-display font-black tabular-nums leading-none"
              style={{ fontSize: "clamp(3rem, 8vw, 5rem)" }}
            >
              {formatSol(state.bagAmount)}
            </span>
            <span className="font-display text-xl font-bold text-gold/60">SOL</span>
          </motion.div>

          {/* Countdown ring — compact on mobile, full on desktop */}
          <div className="w-full flex justify-center">
            <CountdownRing countdown={state.countdown} fuseSeconds={state.countdown} />
          </div>

          {/* Leader card — the psychological centrepiece */}
          {leader ? (
            <SpotlightCard
              spotlightColor="rgba(255,34,0,0.16)"
              radius={320}
              className="premium-card relative w-full max-w-sm overflow-hidden rounded-[24px]"
            >
              <BidPulse trigger={bidPulse} />

              {/* Critical pulse border */}
              {critical && (
                <div
                  className="pointer-events-none absolute inset-0 rounded-[24px]"
                  style={{
                    border: "2px solid rgba(255,34,0,0.5)",
                    animation: "danger-pulse 0.7s ease-in-out infinite",
                    willChange: "transform",
                  }}
                  aria-hidden
                />
              )}

              <div className="relative z-10 flex flex-col items-center gap-4 px-6 py-6">
                {/* Leading badge */}
                <span className="flex items-center gap-1.5 rounded-full border border-blood/30 bg-blood/10 px-3 py-1 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-blood">
                  <Flame className="h-3.5 w-3.5" aria-hidden />
                  Leading the Bid
                </span>

                {/* Big avatar */}
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={`spec-av-${leader.wallet}-${leader.bid}`}
                    initial={{ scale: 0.75, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 340, damping: 24 }}
                  >
                    {/* Shockwave on bid change */}
                    <motion.span
                      key={`shock-${bidPulse}`}
                      initial={{ scale: 0.6, opacity: 0.7 }}
                      animate={{ scale: 3.2, opacity: 0 }}
                      transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                      className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blood"
                      aria-hidden
                    />
                    <div
                      className="overflow-hidden rounded-3xl border-[3px] border-blood"
                      style={{
                        width: 140,
                        height: 140,
                        boxShadow: "0 0 40px rgba(255,34,0,0.4), 0 0 80px rgba(255,34,0,0.15)",
                        willChange: "transform",
                      }}
                    >
                      <AnimatedKingAvatar
                        wallet={leader.wallet}
                        size={140}
                        isKing
                        critical={critical}
                      />
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Wallet + bid */}
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="font-mono text-base font-bold text-white">
                    {truncateAddress(leader.wallet)}
                  </span>
                  <motion.span
                    key={leader.bid}
                    initial={{ scale: 1.18, color: "#FF5533" }}
                    animate={{ scale: 1, color: "#FF2200" }}
                    transition={{ duration: 0.4 }}
                    className="font-display text-3xl font-black tabular-nums"
                    style={{ willChange: "transform" }}
                  >
                    {formatSol(leader.bid)} SOL
                  </motion.span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate">
                    current top bid
                  </span>
                </div>

                {/* Balance bar */}
                <div className="w-full space-y-1">
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] text-dim">Wallet depth</span>
                    <span className="font-mono text-[10px] text-slate">
                      ~{formatSol(leader.walletBal)} SOL
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: "linear-gradient(90deg, #FF2200, #FF5533)",
                        transformOrigin: "left center",
                        willChange: "transform",
                      }}
                      animate={{ scaleX: Math.min(leader.walletBal / maxBal, 1) }}
                      initial={{ scaleX: 0 }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>

                {/* Spectate-only overlay hint */}
                <div
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.06] py-2.5"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                >
                  <Lock className="h-3.5 w-3.5 text-dim" aria-hidden />
                  <span className="font-mono text-[10px] text-dim">
                    Unlock Rank {requiredRank} to outbid
                  </span>
                </div>
              </div>
            </SpotlightCard>
          ) : (
            <div className="flex h-48 w-full max-w-sm flex-col items-center justify-center gap-2 rounded-[24px] border border-white/[0.06] bg-white/[0.02]">
              <Swords className="h-8 w-8 text-dim" aria-hidden />
              <span className="font-mono text-sm text-slate">No bids yet this round</span>
            </div>
          )}

          {/* Stats strip */}
          <div className="grid w-full grid-cols-3 gap-3">
            {[
              {
                icon: <Zap className="h-3.5 w-3.5 text-blood" />,
                label: "Min Next Bid",
                value: `${formatSol(state.minNextBid, 2)} SOL`,
                color: "rgba(255,34,0,",
              },
              {
                icon: <TrendingUp className="h-3.5 w-3.5 text-gold" />,
                label: "Biggest Pot",
                value: `${formatSol(state.biggestPot)} SOL`,
                color: "rgba(255,215,0,",
              },
              {
                icon: <Users className="h-3.5 w-3.5 text-phantom" />,
                label: "Total Paid Out",
                value: `${formatSol(state.totalDistributed, 0)} SOL`,
                color: "rgba(112,0,255,",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="flex flex-col gap-1 rounded-xl px-3 py-3"
                style={{
                  background: `${s.color}0.06)`,
                  border: `1px solid ${s.color}0.14)`,
                }}
              >
                {s.icon}
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim mt-1">
                  {s.label}
                </span>
                <span className="font-mono text-xs font-bold tabular-nums text-white">
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: live bid feed + wallet bars */}
        <div className="flex flex-col gap-5">

          {/* Live bid activity feed */}
          <SpotlightCard
            spotlightColor="rgba(255,34,0,0.10)"
            radius={260}
            className="premium-card rounded-[24px]"
          >
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-center gap-2">
                <Flame className="h-3.5 w-3.5 text-blood" aria-hidden />
                <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
                  Bid Activity
                </h3>
                <LiveBadge />
              </div>

              <div className="no-scrollbar flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
                <AnimatePresence initial={false} mode="popLayout">
                  {state.bidHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                      <Radio className="h-6 w-6 text-dim" aria-hidden />
                      <span className="font-mono text-xs text-dim">
                        Waiting for the first bid…
                      </span>
                    </div>
                  ) : (
                    state.bidHistory.slice(0, 20).map((ev, i) => (
                      <BidRow key={ev.id} event={ev} index={i} />
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </SpotlightCard>

          {/* Wallet balance comparison */}
          <SpotlightCard
            spotlightColor="rgba(112,0,255,0.08)"
            radius={260}
            className="premium-card rounded-[24px]"
          >
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-center gap-2">
                <ChevronUp className="h-3.5 w-3.5 text-phantom" aria-hidden />
                <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
                  Wallet Depths
                </h3>
              </div>
              <p className="font-mono text-[10px] text-dim">
                Who has the firepower to keep raising
              </p>

              <div className="flex flex-col gap-2.5">
                <AnimatePresence>
                  {state.bidders.slice(0, 8).map((b, i) => (
                    <BalanceRow
                      key={b.id}
                      bidder={b}
                      maxBal={maxBal}
                      rank={b.rank}
                      index={i}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </SpotlightCard>

          {/* How it works — for spectators who don't know the rules */}
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
            <ol className="flex flex-col gap-1.5 text-xs text-slate">
              <li><span className="font-mono text-blood">01</span> Wolves place bids above the minimum raise</li>
              <li><span className="font-mono text-blood">02</span> Every bid resets the 30s clock</li>
              <li><span className="font-mono text-blood">03</span> Highest bidder when the clock hits zero wins the entire bag</li>
              <li><span className="font-mono text-blood">04</span> 85% of every bid enters the bag — bigger bids = bigger prize</li>
            </ol>
          </div>
        </div>
      </div>

      {/* ── Sticky bottom CTA bar ────────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.06] bg-[rgba(8,8,15,0.94)] px-4 pb-[env(safe-area-inset-bottom,0px)] pt-3 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2">

          {/* XP progress toward unlock */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-slate" aria-hidden />
              <span className="font-mono text-[11px] text-slate">
                Rank <span className="font-bold text-white">{progress.level}</span>
                {" / "}
                <span className="font-bold text-gold">{requiredRank}</span>
                {" "}to unlock Bid Wars
              </span>
            </div>
            <span className="font-mono text-[11px] font-bold text-gold">
              {Math.round(rankPct)}%
            </span>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #FF2200, #FF5533)",
                transformOrigin: "left center",
                willChange: "transform",
              }}
              animate={{ scaleX: rankPct / 100 }}
              initial={{ scaleX: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>

          <p className="text-center font-mono text-[10px] text-dim">
            Play <span className="text-white">The Bag</span> to earn XP and unlock this arena
          </p>
        </div>
      </div>
    </div>
  );
}
