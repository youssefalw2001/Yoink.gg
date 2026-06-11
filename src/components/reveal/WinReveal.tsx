/**
 * YOINK.GG — WinReveal + Survivor Board
 *
 * Two panels in sequence:
 *
 *   1. WIN PANEL — full-screen dramatic reveal (unchanged animation)
 *      Shows: winner identity, SOL amount count-up, share button, play again
 *
 *   2. SURVIVOR BOARD — slides up after 2s, overlays the bottom
 *      Shows: every player who held the bag this round, ranked by hold time
 *      The winner is always #1. The rest feel SEEN not robbed.
 *      No economics change. Pure psychology.
 *
 * DESIGN DECISIONS:
 *   - Fuse duration revealed HERE for the first time — "The fuse burned for Xs"
 *     This is the VRF reveal moment in simulation mode.
 *   - Min hold time: "< 1s" not "0" — zero feels dismissive
 *   - Winner row is gold + crown + oversized — hero status
 *   - All other rows are ranked by holdFor descending — longest hold = most respected
 *   - Hold bar shows proportional time vs the winner's hold time
 *   - Player's own row is highlighted even if they didn't win
 *
 * GPU rules: transform + opacity only, will-change on animations.
 * Lucide icons. Zero emojis.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import {
  Twitter, RotateCcw, X, Crown, Clock,
  Trophy, ChevronUp, Swords,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { AnimatedWinArt, AnimatedWinCrown } from "@/components/ui/AnimatedWinArt";
import { WinShareBanner } from "@/components/ui/Banners";
import { formatSol, truncateAddress } from "@/lib/utils";
import type { King } from "@/lib/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface WinRevealProps {
  open: boolean;
  winner: string | null;
  isYou: boolean;
  amount: number;
  round: number;
  /** How long the winner held the bag at round end */
  winnerHeldFor?: number;
  /** All kings who held the bag this round (from state.recentKings) */
  fallenKings?: King[];
  /** Actual fuse duration this round — revealed post-round for the first time */
  fuseSeconds?: number;
  /** VRF commitment hash — revealed post-round to prove fairness */
  fuseCommitHash?: string;
  onPlayAgain: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COIN_COUNT = 24;
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function easeOutExpo(t: number) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function holdLabel(secs: number): string {
  if (secs < 1) return "< 1s";
  return `${secs}s`;
}

// ─── Survivor row ─────────────────────────────────────────────────────────────

interface SurvivorRowProps {
  rank: number;
  wallet: string;
  isYou: boolean;
  isWinner: boolean;
  heldFor: number;
  maxHeld: number;
  index: number;
}

function SurvivorRow({
  rank,
  wallet,
  isYou,
  isWinner,
  heldFor,
  maxHeld,
  index,
}: SurvivorRowProps) {
  const barPct = maxHeld > 0 ? Math.max(heldFor / maxHeld, 0.02) : 0.02;
  const reduced = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const rowColor = isWinner
    ? "#FFD700"
    : isYou
      ? "#eef1f6"
      : "#8892a4";

  const barColor = isWinner
    ? "linear-gradient(90deg, #FFE566, #FFD700)"
    : isYou
      ? "linear-gradient(90deg, #7000FF, #9B40FF)"
      : "linear-gradient(90deg, #3a3f4f, #4a5060)";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: reduced ? 0 : 0.3,
        delay: reduced ? 0 : index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="flex flex-col gap-1.5"
      style={{
        padding: isWinner ? "10px 12px" : "8px 12px",
        borderRadius: 12,
        background: isWinner
          ? "rgba(255,215,0,0.07)"
          : isYou
            ? "rgba(112,0,255,0.06)"
            : "transparent",
        border: isWinner
          ? "1px solid rgba(255,215,0,0.18)"
          : isYou
            ? "1px solid rgba(112,0,255,0.15)"
            : "1px solid transparent",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        {/* Rank + wallet */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Rank badge */}
          {isWinner ? (
            <Crown
              className="h-4 w-4 shrink-0 text-gold"
              aria-label="Winner"
            />
          ) : (
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold"
              style={{ background: "rgba(255,255,255,0.05)", color: "#3a3f4f" }}
            >
              {rank}
            </span>
          )}

          <span
            className="truncate font-mono text-sm font-bold"
            style={{ color: rowColor }}
          >
            {isYou ? "You" : truncateAddress(wallet, 4, 4)}
          </span>

          {isWinner && (
            <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-gold">
              Winner
            </span>
          )}
          {isYou && !isWinner && (
            <span className="shrink-0 rounded-full bg-phantom/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-phantom">
              You
            </span>
          )}
        </div>

        {/* Hold time */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Clock className="h-3 w-3 text-dim" aria-hidden />
          <span
            className="font-mono text-xs font-bold tabular-nums"
            style={{ color: rowColor }}
          >
            {holdLabel(heldFor)}
          </span>
        </div>
      </div>

      {/* Hold-time bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
        <motion.div
          className="h-full rounded-full"
          style={{
            background:    barColor,
            transformOrigin: "left center",
            willChange:    "transform",
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: barPct }}
          transition={{
            duration: reduced ? 0 : 0.55,
            delay:    reduced ? 0 : index * 0.05 + 0.2,
            ease:     [0.22, 1, 0.36, 1],
          }}
        />
      </div>
    </motion.div>
  );
}

// ─── Survivor Board panel ─────────────────────────────────────────────────────

interface SurvivorBoardProps {
  winner: string | null;
  isYou: boolean;
  winnerHeldFor: number;
  fallenKings: King[];
  fuseSeconds: number;
  yoinkCount: number;
  fuseCommitHash?: string;
}

function SurvivorBoard({
  winner,
  isYou,
  winnerHeldFor,
  fallenKings,
  fuseSeconds,
  yoinkCount,
  fuseCommitHash,
}: SurvivorBoardProps) {
  const [expanded, setExpanded] = useState(false);

  // Build sorted survivor list
  // Winner is always #1, then fallen kings sorted by holdFor desc
  const survivors = [
    {
      wallet:   isYou ? "You" : (winner ?? ""),
      isYou,
      isWinner: true,
      heldFor:  winnerHeldFor,
    },
    ...fallenKings
      .slice()
      .sort((a, b) => b.heldFor - a.heldFor)
      .map((k) => ({
        wallet:   k.wallet,
        isYou:    k.isYou,
        isWinner: false,
        heldFor:  k.heldFor,
      })),
  ];

  const maxHeld    = Math.max(...survivors.map((s) => s.heldFor), 1);
  const showCount  = expanded ? survivors.length : Math.min(4, survivors.length);

  return (
    <div className="flex flex-col gap-3">
      {/* Fuse reveal — first time players see the actual fuse duration */}
      <div
        className="flex items-center justify-between rounded-xl px-3 py-2.5"
        style={{
          background: "rgba(255,34,0,0.06)",
          border:     "1px solid rgba(255,34,0,0.15)",
        }}
      >
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-blood" aria-hidden />
          <span className="font-mono text-xs text-slate">Fuse burned for</span>
        </div>
        <span className="font-mono text-sm font-bold text-blood tabular-nums">
          {fuseSeconds}s
        </span>
      </div>

      {/* VRF reveal — proves the fuse was pre-committed */}
      {fuseCommitHash && fuseCommitHash !== "pending…" && fuseCommitHash !== "generating…" && (
        <div
          className="flex flex-col gap-1.5 rounded-xl px-3 py-2.5"
          style={{ background: "rgba(0,230,118,0.05)", border: "1px solid rgba(0,230,118,0.15)" }}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-emerald">Fuse Commitment Revealed</span>
            <span className="rounded-full border border-emerald/25 bg-emerald/10 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald">
              VRF ✓
            </span>
          </div>
          <p className="font-mono text-[10px] text-slate">
            This hash was committed before the round started. The fuse ({fuseSeconds}s) was decided before any yoinks happened.
          </p>
          <div className="overflow-hidden rounded-lg bg-black/30 px-2 py-1.5">
            <p className="truncate font-mono text-[10px] text-emerald">{fuseCommitHash}</p>
          </div>
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-2">
        <div
          className="flex flex-col gap-0.5 rounded-xl px-3 py-2"
          style={{ background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.12)" }}
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">Total yoinks</span>
          <span className="font-mono text-sm font-bold text-gold tabular-nums">{yoinkCount}</span>
        </div>
        <div
          className="flex flex-col gap-0.5 rounded-xl px-3 py-2"
          style={{ background: "rgba(0,230,118,0.06)", border: "1px solid rgba(0,230,118,0.12)" }}
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">Players</span>
          <span className="font-mono text-sm font-bold text-emerald tabular-nums">{survivors.length}</span>
        </div>
      </div>

      {/* Survivor rows */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-3.5 w-3.5 text-gold" aria-hidden />
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
            Hold-time board
          </span>
        </div>

        <AnimatePresence initial={false}>
          {survivors.slice(0, showCount).map((s, i) => (
            <SurvivorRow
              key={`${s.wallet}-${i}`}
              rank={i + 1}
              wallet={s.wallet}
              isYou={s.isYou}
              isWinner={s.isWinner}
              heldFor={s.heldFor}
              maxHeld={maxHeld}
              index={i}
            />
          ))}
        </AnimatePresence>

        {survivors.length > 4 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center justify-center gap-1.5 rounded-xl py-2 font-mono text-[10px] text-dim transition-colors duration-150 hover:text-white"
          >
            <ChevronUp
              className="h-3 w-3 transition-transform duration-200"
              style={{ transform: expanded ? "rotate(0deg)" : "rotate(180deg)", willChange: "transform" }}
              aria-hidden
            />
            {expanded ? "Show less" : `Show ${survivors.length - 4} more`}
          </button>
        )}
      </div>

      <p className="text-center font-mono text-[10px] text-dim">
        Every second you held the bag counted · Come back stronger
      </p>
    </div>
  );
}

// ─── Main WinReveal ───────────────────────────────────────────────────────────

export function WinReveal({
  open,
  winner,
  isYou,
  amount,
  round,
  winnerHeldFor = 0,
  fallenKings = [],
  fuseSeconds = 30,
  fuseCommitHash,
  onPlayAgain,
}: WinRevealProps) {
  const coinLayer   = useRef<HTMLDivElement>(null);
  const stageRef    = useRef<HTMLDivElement>(null);
  const [count, setCount]           = useState(0);
  const [showBoard, setShowBoard]   = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setShowBoard(false);
      return;
    }
    const reduced = prefersReducedMotion();

    // Number count-up
    if (reduced) {
      setCount(amount);
    } else {
      const duration = 1600;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        setCount(amount * easeOutExpo(t));
        if (t < 1) rafRef.current = requestAnimationFrame(step);
        else setCount(amount);
      };
      rafRef.current = requestAnimationFrame(step);
    }

    // Show Survivor Board after 2.4s — after the dramatic reveal settles
    const boardTimer = setTimeout(() => setShowBoard(true), 2_400);

    if (reduced) {
      setShowBoard(true);
      return () => {
        clearTimeout(boardTimer);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    // GSAP cinematic timeline
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      if (stageRef.current) {
        tl.from(stageRef.current, { opacity: 0, duration: 0.2 });
      }

      const coins = coinLayer.current?.querySelectorAll(".coin");
      if (coins && coins.length) {
        tl.fromTo(
          coins,
          {
            y: "-10vh",
            opacity: 1,
            rotate: () => gsap.utils.random(-180, 180),
          },
          {
            y: "110vh",
            rotate: () => gsap.utils.random(180, 540),
            opacity: 1,
            duration: () => gsap.utils.random(1.2, 1.8),
            ease: "power1.in",
            stagger: { each: 0.05, from: "random" },
          },
          0.1,
        );
      }

      tl.from(".reveal-winner", { y: -40, opacity: 0, duration: 0.5, ease: "back.out(1.7)" }, 0.25);
      tl.from(".reveal-title",  { scale: 0.4, opacity: 0, duration: 0.5, ease: "back.out(1.6)" }, 0.4);
      tl.from(".reveal-actions",{ y: 24, opacity: 0, duration: 0.4, ease: "power2.out" }, 1.1);
    }, stageRef);

    return () => {
      ctx.revert();
      clearTimeout(boardTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open, amount]);

  const shareText = encodeURIComponent(
    `I just won ${formatSol(amount)} SOL on YOINK.GG 🎯 yoink.gg`,
  );
  const shareUrl = `https://twitter.com/intent/tweet?text=${shareText}`;
  const title    = isYou ? "YOU WON" : "KING CROWNED";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center px-4 pb-4 sm:pb-0"
          style={{
            background:            "rgba(8,8,15,0.92)",
            backdropFilter:        "blur(12px)",
            WebkitBackdropFilter:  "blur(12px)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Round result"
        >
          {/* Coin rain */}
          <div
            ref={coinLayer}
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden
          >
            {Array.from({ length: COIN_COUNT }).map((_, i) => (
              <span
                key={i}
                className="coin absolute top-0 h-4 w-4 rounded-full"
                style={{
                  left:       `${(i / COIN_COUNT) * 100 + Math.random() * 4}%`,
                  background: "radial-gradient(circle at 35% 30%, #ffe566, #ffd700 55%, #ff9900)",
                  boxShadow:  "0 0 12px rgba(255,215,0,0.6)",
                }}
              />
            ))}
          </div>

          {/* Card */}
          <SpotlightCard
            spotlightColor="rgba(255,215,0,0.14)"
            radius={360}
            className="w-full max-w-md rounded-[24px]"
          >
            <div
              ref={stageRef}
              className="premium-card no-scrollbar relative z-10 flex max-h-[92dvh] w-full flex-col items-center gap-5 overflow-y-auto px-6 py-8 text-center sm:px-8 sm:py-10"
            >
              {/* Close */}
              <button
                type="button"
                onClick={onPlayAgain}
                className="absolute right-4 top-4 text-dim transition-colors duration-200 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>

              {/* Winner identity */}
              <span className="reveal-winner flex flex-col items-center gap-2">
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.3 }}
                >
                  <AnimatedWinArt isYou={isYou} size={100} animate={open} />
                </motion.div>
                <span className="font-mono text-sm text-slate">
                  {isYou ? "You" : winner ? truncateAddress(winner) : "—"}
                  <span className="text-dim"> · round #{round}</span>
                </span>
              </span>

              {/* Title */}
              <div className="relative flex flex-col items-center">
                <div className="absolute -top-4 opacity-20" aria-hidden>
                  <AnimatedWinCrown size={140} shouldAnimate={open} />
                </div>
                <h2
                  className="reveal-title shimmer-text relative z-10 font-display font-black leading-none"
                  style={{ fontSize: "clamp(40px, 8vw, 64px)" }}
                >
                  {title}
                </h2>
              </div>

              {/* Amount */}
              <div className="flex items-baseline gap-2">
                <span className="gold-text-gradient font-display text-5xl font-black tabular-nums sm:text-6xl">
                  {formatSol(count)}
                </span>
                <span className="font-display text-xl font-bold text-gold/70">SOL</span>
              </div>

              {/* ── Survivor Board — slides in after 2.4s ── */}
              <AnimatePresence>
                {showBoard && (
                  <motion.div
                    key="survivor"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full"
                  >
                    {/* Divider with label */}
                    <div className="mb-3 flex items-center gap-3">
                      <div className="h-px flex-1 bg-white/[0.06]" />
                      <div className="flex items-center gap-1.5">
                        <Swords className="h-3 w-3 text-slate" aria-hidden />
                        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate">
                          Survivor Board
                        </span>
                      </div>
                      <div className="h-px flex-1 bg-white/[0.06]" />
                    </div>

                    <SurvivorBoard
                      winner={winner}
                      isYou={isYou}
                      winnerHeldFor={winnerHeldFor}
                      fallenKings={fallenKings}
                      fuseSeconds={fuseSeconds}
                      yoinkCount={fallenKings.length + 1}
                      fuseCommitHash={fuseCommitHash}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Actions */}
              <div className="reveal-actions flex w-full flex-col gap-3 pt-2">
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/[0.08]"
                >
                  <Twitter className="h-4 w-4 text-[#1d9bf0]" aria-hidden />
                  Share on X
                </a>

                <div className="w-full overflow-hidden rounded-xl border border-white/[0.06]">
                  <WinShareBanner
                    wallet={isYou ? "You" : (winner ?? "")}
                    solWon={count}
                    round={round}
                    isYou={isYou}
                  />
                </div>

                <motion.button
                  type="button"
                  onClick={onPlayAgain}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
                  className="gold-button flex w-full items-center justify-center gap-2 px-6 py-3.5"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Play Again
                </motion.button>
              </div>
            </div>
          </SpotlightCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
