/**
 * YOINK.GG — The Bag supporting UI (surgical additions)
 *
 * Adds the spec's missing pieces WITHOUT changing any game/payout logic:
 *   - YourPositionPanel : personalized King / Podium / Pool / Not-entered +
 *                         an "est." cut if the round ended right now
 *   - HowPayoutsWorks   : info button that hides the drain/rake/jackpot detail
 *                         behind a tap (default UI stays simple)
 *   - BagOnboarding     : first-run 3-slide tutorial + "watch a round first"
 *   - WarsFunnelNudge   : post-first-win handoff to Wallet Wars
 *
 * All est. amounts are read-only estimates computed from current state via the
 * existing computePayouts() — they never change the real round math.
 * Design system + prefers-reduced-motion respected. Lucide icons, no emojis.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Crown, Trophy, Users, Sparkles, Info, X, ChevronRight,
  Grab, Timer, Coins, Crosshair, ArrowRight,
} from "lucide-react";
import type { GameState } from "@/lib/types";
import type { RoomId } from "@/lib/rooms";
import { computePayouts, playerPayout } from "@/lib/payouts";
import { formatSol } from "@/lib/utils";

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ─── Your Position panel ────────────────────────────────────────────────────────

type Position =
  | { kind: "king"; est: number; heldFor: number }
  | { kind: "podium"; place: number; est: number }
  | { kind: "pool"; est: number }
  | { kind: "none"; bag: number };

function derivePosition(state: GameState, roomId: RoomId): Position {
  const kingWallet = state.kingIsYou ? "You" : state.currentKing;
  // Estimate the split as if the fuse blew right now (read-only).
  let est = 0;
  let myPlace: number | null = null;
  try {
    const payouts = computePayouts(
      state.bagAmount,
      { wallet: kingWallet, isYou: state.kingIsYou, heldFor: state.kingHeldFor },
      state.roundKings ?? [],
      roomId,
    );
    est = playerPayout(payouts);
    const mine = payouts.find((e) => e.isYou);
    myPlace = mine ? mine.place : null;
  } catch {
    est = 0;
  }

  if (state.kingIsYou) return { kind: "king", est, heldFor: state.kingHeldFor };

  const participated =
    (state.roundKings ?? []).some((k) => k.isYou) ||
    (state.yoinkHistory ?? []).some((e) => e.isYou);

  if (myPlace !== null && myPlace >= 2 && myPlace <= 5) {
    return { kind: "podium", place: myPlace, est };
  }
  if (participated || est > 0) return { kind: "pool", est };
  return { kind: "none", bag: state.bagAmount };
}

const EST = (n: number) => (
  <span className="font-mono text-dim">
    est. <span className="font-bold text-emerald">{formatSol(n, 3)} SOL</span>
  </span>
);

export function YourPositionPanel({ state, roomId }: { state: GameState; roomId: RoomId }) {
  const pos = useMemo(() => derivePosition(state, roomId), [state, roomId]);

  const isKing = pos.kind === "king";
  const accent =
    pos.kind === "king" ? "#FFD700" :
    pos.kind === "podium" ? "#FF9900" :
    pos.kind === "pool" ? "#7000FF" :
    "#8892A4";

  return (
    <div
      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3"
      style={{
        background: `${accent}0d`,
        border: `1px solid ${accent}${isKing ? "55" : "2a"}`,
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `${accent}1a`, border: `1px solid ${accent}40` }}
      >
        {pos.kind === "king" && <Crown className="h-4 w-4" style={{ color: accent }} aria-hidden />}
        {pos.kind === "podium" && <Trophy className="h-4 w-4" style={{ color: accent }} aria-hidden />}
        {pos.kind === "pool" && <Users className="h-4 w-4" style={{ color: accent }} aria-hidden />}
        {pos.kind === "none" && <Crosshair className="h-4 w-4" style={{ color: accent }} aria-hidden />}
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        {pos.kind === "king" && (
          <>
            <span className="font-display text-xs font-black uppercase tracking-[0.12em] text-gold">You are King</span>
            <span className="font-mono text-[11px] text-slate">
              Holding {pos.heldFor}s · {EST(pos.est)}
            </span>
          </>
        )}
        {pos.kind === "podium" && (
          <>
            <span className="font-display text-xs font-black uppercase tracking-[0.12em]" style={{ color: accent }}>
              On the podium · #{pos.place}
            </span>
            <span className="font-mono text-[11px] text-slate">{EST(pos.est)}</span>
          </>
        )}
        {pos.kind === "pool" && (
          <>
            <span className="font-display text-xs font-black uppercase tracking-[0.12em] text-phantom">In the pool</span>
            <span className="font-mono text-[11px] text-slate">
              Keep playing for a jackpot shot · {EST(pos.est)}
            </span>
          </>
        )}
        {pos.kind === "none" && (
          <>
            <span className="font-display text-xs font-black uppercase tracking-[0.12em] text-slate">Not in yet</span>
            <span className="font-mono text-[11px] text-slate">
              YOINK the bag to join · pot {formatSol(pos.bag, 2)} SOL
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── How payouts work — hides complexity behind a tap ───────────────────────────

export function HowPayoutsWorks() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto mt-3 flex items-center gap-1.5 font-mono text-[11px] text-slate transition-colors hover:text-white"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
        How payouts work
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[105] flex items-center justify-center px-5"
            style={{ background: "rgba(8,8,15,0.92)", backdropFilter: "blur(10px)" }}
            role="dialog"
            aria-modal="true"
            aria-label="How payouts work"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              className="premium-card relative w-full max-w-sm rounded-[24px] px-6 py-6"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-4 top-4 text-dim transition-colors hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>

              <h3 className="font-display text-lg font-black tracking-tight text-white">How payouts work</h3>
              <ol className="mt-4 flex flex-col gap-3 text-xs text-slate">
                <li className="flex gap-2"><span className="font-mono text-gold">01</span> One King holds the bag. YOINK it to take the crown and reset the hidden fuse.</li>
                <li className="flex gap-2"><span className="font-mono text-gold">02</span> The longer you hold, the bigger your cut.</li>
                <li className="flex gap-2"><span className="font-mono text-gold">03</span> When the fuse blows the King takes the biggest cut, the podium gets paid, and the held-time pool splits the rest.</li>
                <li className="flex gap-2"><span className="font-mono text-phantom">04</span> A progressive jackpot can drop to any participant at round end — weighted by how active you were.</li>
              </ol>
              <p className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-[10px] leading-relaxed text-dim">
                Under the hood: 83% to the bag · 10% house rake · 5% jackpot reserve · 1–3% drain.
                Same SOL out — just split across more winners.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── First-run onboarding — 3 slides + "watch a round first" ─────────────────────

const SLIDES = [
  { icon: Grab,  color: "#FFD700", title: "GRAB THE BAG",          body: "YOINK it to become King. The bag is worth real SOL." },
  { icon: Timer, color: "#FF2200", title: "HOLD IT AS LONG AS YOU CAN", body: "Every second you hold builds your cut. Others will try to YOINK it from you." },
  { icon: Coins, color: "#00E676", title: "WHEN THE FUSE BLOWS, EVERYONE GETS PAID", body: "King takes the biggest cut. The podium gets paid. Even the pool has a shot at the jackpot." },
] as const;

export function BagOnboarding({ onDone }: { onDone: () => void }) {
  const [slide, setSlide] = useState(0);
  const isLast = slide === SLIDES.length - 1;
  const current = SLIDES[slide] ?? SLIDES[0];
  const Icon = current.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[110] flex items-center justify-center px-5"
      style={{ background: "rgba(8,8,15,0.94)", backdropFilter: "blur(12px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="How The Bag works"
    >
      <motion.div
        initial={{ scale: 0.94, y: 14, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="premium-card relative w-full max-w-sm rounded-[24px] px-6 py-7"
      >
        <button
          type="button"
          onClick={onDone}
          className="absolute right-4 top-4 text-dim transition-colors hover:text-white"
          aria-label="Skip tutorial"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key={`bag-slide-${slide}`}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col items-center gap-5 text-center"
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
              className="flex h-20 w-20 items-center justify-center rounded-3xl"
              style={{ background: `${current.color}1a`, border: `1px solid ${current.color}44` }}
            >
              <Icon className="h-9 w-9" style={{ color: current.color }} aria-hidden />
            </motion.div>

            <div className="flex flex-col gap-2">
              <h2 className="font-display text-xl font-black leading-tight tracking-tight text-white">{current.title}</h2>
              <p className="font-mono text-xs leading-relaxed text-slate">{current.body}</p>
            </div>

            <div className="flex items-center gap-1.5">
              {SLIDES.map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: i === slide ? 18 : 6, background: i === slide ? current.color : "rgba(255,255,255,0.15)" }}
                  aria-hidden
                />
              ))}
            </div>

            {!isLast ? (
              <motion.button
                type="button"
                onClick={() => setSlide((s) => Math.min(s + 1, SLIDES.length - 1))}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/[0.1]"
                style={{ willChange: "transform" }}
              >
                Next <ChevronRight className="h-4 w-4" aria-hidden />
              </motion.button>
            ) : (
              <motion.button
                type="button"
                onClick={onDone}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="gold-button flex w-full items-center justify-center gap-2 py-3.5 text-sm"
                style={{ willChange: "transform" }}
              >
                Watch a round first
              </motion.button>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ─── Post-first-win funnel → Wallet Wars ─────────────────────────────────────────

export function WarsFunnelNudge({ onGo, onDismiss }: { onGo: () => void; onDismiss: () => void }) {
  return (
    <motion.div
      initial={reduced() ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3"
      style={{ background: "rgba(255,34,0,0.06)", border: "1px solid rgba(255,34,0,0.25)" }}
    >
      <Sparkles className="h-4 w-4 shrink-0 text-blood" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[11px] font-black uppercase tracking-[0.1em] text-white">Nice — you got paid</span>
        <span className="truncate font-mono text-[11px] text-slate">Now try Wallet Wars — direct PvP, higher stakes, bigger swings.</span>
      </div>
      <button
        type="button"
        onClick={onGo}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-blood/40 bg-blood/15 px-3 py-2 font-display text-[11px] font-bold uppercase tracking-[0.1em] text-blood transition-colors hover:bg-blood/25"
      >
        Check it out <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-dim transition-colors hover:text-white"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </motion.div>
  );
}
