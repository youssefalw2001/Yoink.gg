/**
 * YOINK.GG — Bid Wars Screen
 *
 * Separate page. Wolves only. Unlocked at Rank 6 (Warlord).
 * Open bidding — highest bid when timer hits zero wins everything.
 *
 * Layout:
 *   LEFT:  countdown + bag amount + bid king card
 *   RIGHT: bid input + live leaderboard + activity feed
 *
 * Savage dark aesthetic — blood red accents, larger avatars,
 * wallet balance bars showing who has deep pockets.
 */

import { motion } from "framer-motion";
import { Swords, RotateCcw, Twitter } from "lucide-react";
import { CountdownRing } from "@/components/game/CountdownRing";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { BidKingCard } from "./BidKingCard";
import { BidInput } from "./BidInput";
import { BidLeaderboard } from "./BidLeaderboard";
import { BidWarsSpectate } from "./BidWarsSpectate";
import { useBidWarsState, BID_CONFIG } from "@/lib/bidWarsState";
import { formatSol } from "@/lib/utils";
import type { PlayerProgress } from "@/lib/progression";

interface BidWarsScreenProps {
  progress: PlayerProgress;
}

export function BidWarsScreen({ progress }: BidWarsScreenProps) {
  const { state, placeBid, playAgain } = useBidWarsState();
  const isLocked = progress.level < BID_CONFIG.REQUIRED_RANK;

  // Find player's current bid
  const myBidder = state.bidders.find(b => b.isYou);
  const myBid    = myBidder?.bid ?? 0;
  const iAmLeader = state.leader?.isYou ?? false;
  const critical  = state.countdown <= 5 && !state.isRoundOver;

  // ── Locked → spectate mode ──────────────────────────────────────────────────
  if (isLocked) {
    return (
      <BidWarsSpectate
        progress={progress}
        requiredRank={BID_CONFIG.REQUIRED_RANK}
      />
    );
  }

  // ── Win reveal ───────────────────────────────────────────────────────────────
  if (state.isRoundOver) {
    const won = state.bagAmount;
    const winnerIsYou = state.winnerIsYou;
    const shareText = encodeURIComponent(
      `${winnerIsYou ? "I just won" : "Someone just won"} ${formatSol(won)} SOL in BID WARS on YOINK.GG 🐺 yoink.gg`
    );

    return (
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 px-4 py-16 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [0.5, 1.08, 1], opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          className="font-display text-4xl font-black sm:text-5xl"
          style={{ color: winnerIsYou ? "#FFD700" : "#FF2200" }}
        >
          {winnerIsYou ? "YOU WON" : "ROUND OVER"}
        </motion.div>

        <div className="flex flex-col items-center gap-1">
          <span className="font-display text-5xl font-black gold-text-gradient tabular-nums">
            {formatSol(won)}
          </span>
          <span className="font-display text-xl text-gold/60">SOL</span>
        </div>

        <div className="flex w-full flex-col gap-3">
          {winnerIsYou && (
            <a
              href={`https://twitter.com/intent/tweet?text=${shareText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-medium text-white hover:bg-white/[0.08] transition-colors"
            >
              <Twitter className="h-4 w-4 text-[#1d9bf0]" aria-hidden />
              Share on X
            </a>
          )}
          <motion.button
            type="button"
            onClick={playAgain}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-sans text-base font-bold uppercase tracking-wide text-black"
            style={{ background: "linear-gradient(180deg, #FFE566, #FFD700 55%, #FF9900)" }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            New Round
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Live game ─────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">

      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blood/30 bg-blood/10">
            <Swords className="h-5 w-5 text-blood" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-xl font-black tracking-tight">
              <span className="text-white">BID </span>
              <span style={{ color: "#FF2200" }}>WARS</span>
            </h1>
            <p className="font-mono text-[10px] text-dim">Wolves only · Round #{state.roundNumber}</p>
          </div>
        </div>

        {/* Bag amount */}
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">Prize Bag</div>
          <div className="gold-text-gradient font-display text-2xl font-black tabular-nums sm:text-3xl">
            {formatSol(state.bagAmount)}
            <span className="ml-1 text-sm text-gold/60">SOL</span>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">

        {/* LEFT — countdown + king card */}
        <div className="flex flex-col items-center gap-6">
          <CountdownRing countdown={state.countdown} fuseSeconds={state.countdown} />
          <BidKingCard
            leader={state.leader}
            yourBid={myBid}
            critical={critical}
          />
        </div>

        {/* RIGHT — bid input + leaderboard */}
        <div className="flex flex-col gap-5">
          <SpotlightCard
            spotlightColor="rgba(255,34,0,0.14)"
            radius={280}
            className="premium-card rounded-[24px]"
          >
            <div className="px-5 py-5">
              <h3 className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
                Place Your Bid
              </h3>
              <BidInput
                minNextBid={state.minNextBid}
                currentBag={state.bagAmount}
                onBid={placeBid}
                disabled={state.isRoundOver}
                youAreLeader={iAmLeader}
              />
            </div>
          </SpotlightCard>

          <SpotlightCard
            spotlightColor="rgba(255,34,0,0.10)"
            radius={280}
            className="premium-card rounded-[24px]"
          >
            <div className="px-5 py-5">
              <BidLeaderboard
                bidders={state.bidders}
                bidHistory={state.bidHistory}
              />
            </div>
          </SpotlightCard>

          {/* Rules strip */}
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
            <ol className="flex flex-col gap-1.5 text-xs text-slate">
              <li><span className="font-mono text-blood">01</span> Min first bid: {formatSol(BID_CONFIG.MIN_FIRST_BID)} SOL · Min raise: +{formatSol(BID_CONFIG.MIN_RAISE)} SOL</li>
              <li><span className="font-mono text-blood">02</span> Each bid resets the 30s timer</li>
              <li><span className="font-mono text-blood">03</span> Highest bidder when clock hits zero wins the bag</li>
              <li><span className="font-mono text-blood">04</span> 85% of every bid enters the bag · 10% rake</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
