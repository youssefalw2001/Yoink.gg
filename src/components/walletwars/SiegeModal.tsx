/**
 * SiegeModal — the "Siege the Vault" flow (was `RaidModal`; Task 7.1).
 *
 * VALUE PROP, CRYSTAL CLEAR: a cheap attempt FEE in (≈1% of the vault, the only
 * thing you risk) for a rare, big crack OUT (~10× the fee). The published
 * per-tier odds `p`, the fee, the prize slice, and the fee→prize multiple are
 * all shown up front.
 *
 * NEVER FAILS SILENTLY: `onCommit` returns a typed `SiegeResolution`. A declined
 * siege (cooldown / shielded / self / tier-mismatch / insufficient-funds) plays
 * `playCooldownBlock`, renders an explicit in-modal banner, and the modal STAYS
 * in `select` — a rejection NEVER plays the build-up. (The parent also mirrors
 * the reason into the StatusBar.)
 *
 * THE SIEGE MOMENT (phase machine `select → strain → result`): on a committed,
 * ACCEPTED siege the provably-fair outcome is sealed FIRST (by `onCommit()` →
 * `siege()`), then a deliberate, SKIPPABLE `strain` build-up plays (~1.9s of the
 * vault lock straining and cracking, a scrambling roll/seed readout that locks
 * to the real sealed values at the breach) before the reveal. `Quick Siege` or
 * `prefers-reduced-motion` bypass the build-up entirely (instant result). The
 * strain is pure ceremony over an already-sealed roll — it never re-rolls.
 *
 * RESULT PHASE: reveals the seed, the roll, and the `roll < p` comparison. A WIN
 * shatters the lock (celebratory crack burst — the shareable dopamine moment); a
 * LOSS is framed as survivable — the lock holds, "you only lost the fee."
 *
 * FAIR: the crack chance is the FIXED, published per-tier win chance (never
 * varied by streak/heat/size); the seed is revealed for verification. Animation
 * is Framer Motion + transform/opacity and honours reduced motion.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Crosshair, Flame, TrendingUp, ShieldAlert, Target, Lock,
  Zap, ShieldCheck, Share2, ArrowRight, SkipForward, RotateCcw, Search,
} from "lucide-react";
import {
  tierForAmount,
  type Vault, type SiegeResult, type SiegeResolution, type SiegeRejection,
} from "@/lib/walletWarsState";
import {
  vaultParamsFor, feeMultiplierForStreak, computeFee, computePrize, STREAK_CFG,
} from "@/lib/siegeMath";
import { formatSol, truncateAddress } from "@/lib/utils";
import { playYoink, playWin, playCooldownBlock, playPurchase, playTick } from "@/lib/sounds";
import { PurgeAvatar } from "./PurgeAvatar";
import { usePrefersReducedMotion } from "./useReducedMotion";
import { profileBadgeLabel, PROFILE_ACCENT } from "./riskProfilePresentation";
import { nextPhaseAfterCommit } from "./siegeFeel";
import { nearMissView, neededCopy, rolledCopy } from "./nearMiss";

interface SiegeModalProps {
  target: Vault;
  yourVault: number;
  taxMult: number;
  onCommit: () => SiegeResolution;
  onPlaceBounty: (amount: number) => { ok: boolean };
  onClose: () => void;
  /** Loop the runner into the next best target (Hunt). Falls back to onClose. */
  onSiegeAgain?: () => void;
}

type Phase = "select" | "strain" | "result";
const QR_KEY = "yoink_ww_quickraid";

/** Strain build-up timings (transform/opacity only). Breach locks the readout. */
const STRAIN_MS = 1900;
const STRAIN_BREACH_MS = 1500;

/** Human-readable copy for a typed siege rejection (no silent failures). */
function rejectionCopy(reason: SiegeRejection): string {
  switch (reason.kind) {
    case "cooldown":
      return `On cooldown — wait ${Math.ceil(reason.remainingMs / 1000)}s before your next siege`;
    case "shielded":
      return reason.shieldRemainingMs > 0
        ? `Target shielded — ${Math.ceil(reason.shieldRemainingMs / 1000)}s until it can be sieged again`
        : "Target is no longer available";
    case "self_siege":
      return "You can't siege your own vault";
    case "tier_mismatch":
      return "Target is in a different weight class — siege within your tier";
    case "insufficient_funds":
      return `Fee ${formatSol(reason.required, 3)} SOL exceeds your ${formatSol(reason.available, 3)} SOL`;
  }
}

/** A throwaway scrambled hex string for the pre-breach seed readout. */
function scrambleSeed(): string {
  let s = "";
  for (let i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/** Celebratory crack burst — a ring of shards flung outward (transform/opacity). */
function CrackBurst() {
  const shards = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {shards.map((i) => {
        const angle = (i / shards.length) * Math.PI * 2;
        const dist = 90 + (i % 3) * 26;
        return (
          <motion.span
            key={i}
            className="absolute h-2 w-2 rounded-sm"
            style={{ background: i % 2 === 0 ? "#FFD700" : "#FF9900", willChange: "transform" }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist,
              opacity: 0,
              scale: 0.4,
              rotate: 180,
            }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        );
      })}
    </div>
  );
}

/**
 * StrainSequence — the ~1.9s build → breach beat over an ALREADY-SEALED result.
 *
 * The lock strains and cracks (transform/opacity keyframes only); a scrambling
 * roll/seed readout animates until the breach (~1500ms), then LOCKS to the real
 * `result.roll` / `result.seed`. A persistent Skip button — and a backdrop tap
 * wired by the parent via `skipRef` — clears the timer and jumps straight to the
 * result with the SAME sealed outcome. Never re-rolls; never changes the result.
 */
function StrainSequence({
  result, reduced, onDone, skipRef,
}: {
  result: SiegeResult;
  reduced: boolean;
  onDone: () => void;
  skipRef: React.MutableRefObject<(() => void) | null>;
}) {
  const win = result.outcome === "win";
  const [locked, setLocked] = useState(false);
  const [scramble, setScramble] = useState<{ roll: number; seed: string }>(() => ({
    roll: Math.random(), seed: scrambleSeed(),
  }));

  // Single owner of all timers so Skip / unmount cannot double-fire `onDone`.
  const finishedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    playTick(false);
    const scrambleId = window.setInterval(() => {
      setScramble({ roll: Math.random(), seed: scrambleSeed() });
    }, 70);
    const breachId = window.setTimeout(() => {
      setLocked(true);
      window.clearInterval(scrambleId);
      playTick(true);
    }, STRAIN_BREACH_MS);

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      window.clearInterval(scrambleId);
      window.clearTimeout(breachId);
      window.clearTimeout(doneId);
      onDoneRef.current();
    };
    const doneId = window.setTimeout(finish, STRAIN_MS);

    // Expose the (idempotent) skip to the parent for backdrop-tap.
    skipRef.current = finish;
    return () => {
      window.clearInterval(scrambleId);
      window.clearTimeout(breachId);
      window.clearTimeout(doneId);
      skipRef.current = null;
    };
  }, [skipRef]);

  const shownRoll = locked ? result.roll : scramble.roll;
  const shownSeed = locked ? result.seed : scramble.seed;
  const breachColor = win ? "#FFD700" : "#FF2200";

  return (
    <motion.div
      key="strain"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-5 py-6"
    >
      <span className="font-display text-lg font-black uppercase tracking-[0.18em] text-white">
        {locked ? "Breach!" : "Straining the lock…"}
      </span>

      <div className="relative flex h-24 w-24 items-center justify-center">
        {locked && win && !reduced && <CrackBurst />}
        <motion.div
          className="relative flex h-20 w-20 items-center justify-center rounded-2xl border"
          style={{
            borderColor: `${breachColor}66`,
            background: `${breachColor}14`,
            willChange: "transform",
          }}
          initial={{ scale: 1, rotate: 0, x: 0, y: 0 }}
          animate={
            reduced
              ? { scale: 1 }
              : {
                  scale: [1, 1.05, 1.03, 1.07, 1.1, win ? 1.18 : 1],
                  x: [0, -2, 2, -4, 3, 0],
                  y: [0, 1, -1, 2, -2, 0],
                  rotate: [0, -1, 1.5, -2, 2, 0],
                }
          }
          transition={{ duration: STRAIN_MS / 1000, ease: "easeInOut" }}
        >
          {/* hairline crack overlay — fades in through the cracking sub-beat */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              background: `linear-gradient(115deg, transparent 46%, ${breachColor}aa 50%, transparent 54%)`,
              willChange: "opacity",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: locked ? 1 : reduced ? 0 : [0, 0, 0.6, 1] }}
            transition={{ duration: STRAIN_BREACH_MS / 1000, ease: "easeIn" }}
          />
          <Lock className="h-9 w-9" style={{ color: breachColor }} aria-hidden />
        </motion.div>
      </div>

      {/* scrambling provably-fair readout — locks to the real sealed values */}
      <div className="w-full rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-left">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald">
            {locked ? "Sealed" : "Rolling…"}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-slate">
            roll {shownRoll.toFixed(4)} {locked ? (result.roll < result.pWin ? "<" : "≥") : "·"} p {result.pWin.toFixed(2)}
          </span>
        </div>
        <p className="truncate font-mono text-[9px] text-dim">seed {shownSeed}</p>
      </div>

      <button
        type="button"
        onClick={() => skipRef.current?.()}
        className="flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-dim transition-colors hover:text-white"
      >
        <SkipForward className="h-3 w-3" aria-hidden /> Skip ▸
      </button>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">outcome already sealed by the seed</span>
    </motion.div>
  );
}

/**
 * WinTakeover — the full-screen gold takeover on a crack. VAULT CRACKED in
 * Orbitron, the SOL won in mono, and a one-tap branded share card ("I just
 * cracked [wallet] for X SOL on YOINK.GG"). Auto-dismisses after ~3s back to the
 * updated Hunt stats. Reduced-motion safe.
 */
function WinTakeover({ result, reduced, onClose }: { result: SiegeResult; reduced: boolean; onClose: () => void }) {
  // Auto-dismiss after 3s → back to the (updated) Hunt board.
  useEffect(() => {
    const id = window.setTimeout(onClose, 3000);
    return () => window.clearTimeout(id);
  }, [onClose]);

  const shareText = `I just cracked ${truncateAddress(result.targetWallet, 4, 4)} for ${formatSol(result.seized, 3)} SOL on YOINK.GG Wallet Wars. yoink.gg`;
  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  return (
    <motion.div
      key="win-takeover"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[120] flex items-center justify-center px-5"
      style={{ background: "radial-gradient(ellipse at center, rgba(255,215,0,0.18), rgba(8,8,15,0.97) 70%)", backdropFilter: "blur(14px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Vault cracked"
      onClick={onClose}
    >
      <div className="relative flex w-full max-w-sm flex-col items-center gap-5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-center justify-center">
          {!reduced && <CrackBurst />}
          <motion.div
            initial={{ scale: 0.4, rotate: -10 }}
            animate={{ scale: [0.4, 1.2, 1], rotate: 0 }}
            transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
            className="flex h-20 w-20 items-center justify-center rounded-3xl border border-gold/40 bg-gold/15"
            style={{ willChange: "transform" }}
          >
            <TrendingUp className="h-10 w-10 text-gold" aria-hidden />
          </motion.div>
        </div>

        <h2 className="font-display font-black uppercase tracking-[0.08em] gold-text-gradient" style={{ fontSize: "clamp(2rem, 9vw, 3rem)", lineHeight: 1 }}>
          Vault Cracked
        </h2>

        <span className="font-mono text-5xl font-black tabular-nums text-[#FF9900]" style={{ fontSize: "clamp(2.2rem, 10vw, 3.4rem)" }}>
          +{formatSol(result.seized, 3)}
        </span>
        <span className="-mt-2 font-mono text-xs uppercase tracking-[0.2em] text-slate">SOL · cracked {truncateAddress(result.targetWallet, 4, 4)}</span>

        {/* branded share card — dark void bg, gold text */}
        <div className="w-full rounded-2xl px-4 py-3 text-left" style={{ background: "#08080F", border: "1px solid rgba(255,215,0,0.3)" }}>
          <p className="font-display text-sm font-black leading-snug">
            <span className="gold-text-gradient">I just cracked {truncateAddress(result.targetWallet, 4, 4)} for {formatSol(result.seized, 3)} SOL</span>
            <span className="text-slate"> on </span>
            <span className="text-white">YOINK.GG</span>
          </p>
        </div>

        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="gold-button flex w-full items-center justify-center gap-2 py-3 text-sm"
          style={{ borderRadius: 16 }}
        >
          <Share2 className="h-4 w-4" aria-hidden /> Share this heist
        </a>
        <span className="font-mono text-[10px] text-dim">Returning to your hunt…</span>
      </div>
    </motion.div>
  );
}

/** Horizontal roll-vs-threshold meter for the near-miss screen. */
function NearMissMeter({ view, reduced }: { view: ReturnType<typeof nearMissView>; reduced: boolean }) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
        {/* crack zone: everything below the threshold */}
        <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: `${view.thresholdFrac * 100}%`, background: "rgba(0,230,118,0.25)" }} aria-hidden />
        {/* threshold line */}
        <span className="absolute top-0 h-full w-[2px]" style={{ left: `${view.thresholdFrac * 100}%`, background: "#00E676" }} aria-hidden />
        {/* roll marker */}
        <motion.span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full"
          style={{ background: view.cracked ? "#FFD700" : "#FF2200", willChange: "transform" }}
          initial={reduced ? false : { left: "0%" }}
          animate={{ left: `calc(${view.rollFrac * 100}% - 7px)` }}
          transition={{ duration: reduced ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em]">
        <span className="text-emerald">crack ≤ {view.threshold.toFixed(2)}</span>
        <span className="text-blood">your roll {view.roll.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function SiegeModal({ target, yourVault, taxMult, onCommit, onPlaceBounty, onClose, onSiegeAgain }: SiegeModalProps) {
  const reduced = usePrefersReducedMotion();
  const tier = tierForAmount(yourVault);

  // Siege economics, from the target vault's OWN published risk-profile params.
  const params = vaultParamsFor(target.amount, target.riskProfile);
  const mult = feeMultiplierForStreak(target.streak, STREAK_CFG);
  const feeB = computeFee(target.amount, params, mult, taxMult);
  const prizeB = computePrize(target.amount, params, mult);
  const pWin = params.winChance;
  const bountyNet = target.bountyPool > 0 ? target.bountyPool * (1 - params.housePrizeRake) : 0;
  const reward = prizeB.toRaider + bountyNet;
  const canAfford = feeB.fee <= yourVault;
  // The headline multiple: a tiny fee for a ~10× crack.
  const rewardMultiple = feeB.fee > 0 ? reward / feeB.fee : 0;

  const [phase, setPhase] = useState<Phase>("select");
  const [result, setResult] = useState<SiegeResult | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [quickRaid, setQuickRaid] = useState(() => {
    try { return localStorage.getItem(QR_KEY) === "1"; } catch { return false; }
  });
  // The near-miss (loss) screen holds for ~3s before its actions become live.
  const [lossGateOpen, setLossGateOpen] = useState(false);
  useEffect(() => {
    if (phase === "result" && result && result.outcome === "loss") {
      setLossGateOpen(false);
      const id = window.setTimeout(() => setLossGateOpen(true), 3000);
      return () => window.clearTimeout(id);
    }
  }, [phase, result]);

  // Backdrop-tap → skip the strain (registered by StrainSequence while mounted).
  const skipRef = useRef<(() => void) | null>(null);

  const bountyPresets = [tier.minBet * 3, tier.minBet * 6, tier.minBet * 12]
    .map((v) => +v.toFixed(3)).filter((v) => v <= yourVault);

  function toggleQuick() {
    setQuickRaid((v) => {
      const n = !v;
      try { localStorage.setItem(QR_KEY, n ? "1" : "0"); } catch { /* ignore */ }
      return n;
    });
  }

  /** Land on the reveal, playing the win sting once for a crack. */
  const goResult = useCallback((r: SiegeResult) => {
    setPhase("result");
    if (r.outcome === "win") playWin();
  }, []);

  function commit() {
    if (!canAfford) {
      playCooldownBlock();
      setBlocked(rejectionCopy({ kind: "insufficient_funds", required: feeB.fee, available: yourVault }));
      return;
    }
    playYoink();
    // Seal the provably-fair outcome FIRST. Any build-up plays over a result
    // that is already decided.
    const res = onCommit();
    if (!res.ok) {
      // Surface the typed reason instead of silently closing — a rejection
      // STAYS in `select` and NEVER plays the build-up.
      playCooldownBlock();
      setBlocked(rejectionCopy(res.reason));
      return;
    }
    setBlocked(null);
    setResult(res.result);
    // Decide the next phase purely (Property 9/10): a rejection never reaches
    // here; Quick Siege or reduced motion skips the build-up.
    const next = nextPhaseAfterCommit(res, { quickRaid, reducedMotion: reduced });
    if (next === "result") goResult(res.result);
    else setPhase("strain");
  }

  // ── WIN → full-screen gold takeover (auto-dismisses to the updated Hunt stats).
  if (phase === "result" && result && result.outcome === "win") {
    return (
      <AnimatePresence>
        <WinTakeover result={result} reduced={reduced} onClose={onClose} />
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: "rgba(8,8,15,0.9)", backdropFilter: "blur(12px)" }}
      role="dialog" aria-modal="true" aria-label={`Siege ${truncateAddress(target.wallet)}`}
      onClick={() => { if (phase === "strain") skipRef.current?.(); }}
    >
      <motion.div
        initial={{ scale: 0.92, y: 16, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="premium-card relative w-full max-w-sm rounded-[24px] px-6 py-7"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-dim transition-colors hover:text-white" aria-label="Close">
          <X className="h-5 w-5" aria-hidden />
        </button>

        <AnimatePresence mode="wait">
          {/* ── SELECT ── */}
          {phase === "select" && (
            <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="flex items-center gap-2 rounded-full border border-blood/30 bg-blood/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-blood">
                  <Crosshair className="h-3 w-3" aria-hidden /> Sieging · {tier.label}
                </span>
                <div className="my-1"><PurgeAvatar seed={target.wallet} size={64} pulse /></div>
                <span className="font-mono text-sm font-bold text-white">{truncateAddress(target.wallet, 4, 4)}</span>
                <span
                  className="rounded-full px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.12em]"
                  style={{
                    background: `${PROFILE_ACCENT[target.riskProfile]}1f`,
                    border: `1px solid ${PROFILE_ACCENT[target.riskProfile]}66`,
                    color: PROFILE_ACCENT[target.riskProfile],
                  }}
                >
                  {profileBadgeLabel(target.riskProfile)}
                </span>
                <span className="font-display text-3xl font-black tabular-nums gold-text-gradient">
                  {formatSol(target.amount, 2)} <span className="text-base text-slate">SOL vault</span>
                </span>
                {target.bountyPool > 0 && (
                  <span className="mt-0.5 flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 font-mono text-[10px] font-bold text-gold">
                    <Target className="h-3 w-3" aria-hidden /> Bounty {formatSol(target.bountyPool, 2)} SOL
                  </span>
                )}
              </div>

              {/* BOUNTY — promoted near the headline (shareable viral hook) */}
              {bountyPresets.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-2xl border border-gold/30 bg-gold/[0.08] px-3 py-2.5">
                  <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-gold">
                    <Target className="h-3 w-3" aria-hidden />
                    {target.bountyPool > 0
                      ? `Bounty pool ${formatSol(target.bountyPool, 2)} SOL — sweeten it`
                      : "Pledge a bounty on them"}
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {bountyPresets.map((amt) => (
                      <button key={amt} type="button" onClick={() => { if (onPlaceBounty(amt).ok) playPurchase(); else { playCooldownBlock(); setBlocked("Bounty declined — would drop you a tier or invalid amount"); } }}
                        className="rounded-xl border border-gold/25 bg-gold/[0.07] py-2 font-mono text-xs font-bold tabular-nums text-gold transition-colors hover:bg-gold/15">
                        +{formatSol(amt, 2)}
                      </button>
                    ))}
                  </div>
                  <span className="font-mono text-[9px] text-dim">A bounty is a shareable prize — anyone who cracks them takes it.</span>
                </div>
              )}

              {/* The deal, at a glance: cheap fee in → big slice out */}
              <div className="flex items-stretch gap-2">
                <div className="flex flex-1 flex-col gap-0.5 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,34,0,0.06)", border: "1px solid rgba(255,34,0,0.16)" }}>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">You risk (fee)</span>
                  <span className="font-mono text-lg font-black tabular-nums text-blood">{formatSol(feeB.fee, 3)}</span>
                </div>
                <div className="flex items-center justify-center px-0.5 text-dim">
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </div>
                <div className="flex flex-1 flex-col gap-0.5 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,153,0,0.06)", border: "1px solid rgba(255,153,0,0.16)" }}>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">You could crack</span>
                  <span className="font-mono text-lg font-black tabular-nums text-[#FF9900]">{formatSol(reward, 2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5" style={{ background: "rgba(0,230,118,0.06)", border: "1px solid rgba(0,230,118,0.16)" }}>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Crack chance</span>
                  <span className="font-mono text-lg font-black tabular-nums text-emerald">{(pWin * 100).toFixed(0)}%</span>
                </div>
                <div className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.16)" }}>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Upside</span>
                  <span className="font-mono text-lg font-black tabular-nums text-gold">≈{rewardMultiple.toFixed(1)}× fee</span>
                </div>
              </div>

              {feeB.repeatTax > 0 && (
                <p className="flex items-center justify-center gap-1.5 rounded-lg border border-blood/15 bg-blood/[0.05] py-1.5 font-mono text-[10px] text-blood">
                  <Flame className="h-3 w-3" aria-hidden /> Repeat-target tax: +{formatSol(feeB.repeatTax, 3)} SOL to the house
                </p>
              )}
              <p className="flex items-center justify-center gap-1.5 text-center font-mono text-[10px] text-dim">
                <ShieldCheck className="h-3 w-3 text-emerald" aria-hidden />
                Lose the siege, you only lose the fee · published {(pWin * 100).toFixed(0)}% odds for this tier
              </p>

              {blocked && (
                <motion.p
                  key={blocked}
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-blood/25 bg-blood/[0.08] py-2 text-center font-mono text-[10px] font-bold text-blood"
                  role="alert"
                >
                  <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden /> {blocked}
                </motion.p>
              )}

              <motion.button
                type="button" onClick={commit} disabled={!canAfford}
                whileHover={canAfford ? { scale: 1.03 } : undefined} whileTap={canAfford ? { scale: 0.96 } : undefined} transition={{ duration: 0.14 }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-blood/40 bg-blood/15 py-3.5 font-display text-sm font-black uppercase tracking-[0.14em] text-blood transition-colors hover:bg-blood/25 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ willChange: "transform" }}
              >
                <Flame className="h-4 w-4" aria-hidden /> Crack it — {formatSol(feeB.fee, 3)} SOL
              </motion.button>

              <button type="button" onClick={toggleQuick} className="flex items-center justify-center gap-1.5 font-mono text-[10px] text-dim transition-colors hover:text-white">
                <Zap className="h-3 w-3" style={{ color: quickRaid ? "#FFD700" : undefined }} aria-hidden />
                Quick Siege {quickRaid ? "ON" : "OFF"} — skip the build-up
              </button>
            </motion.div>
          )}

          {/* ── STRAIN (build → breach over a sealed result) ── */}
          {phase === "strain" && result && (
            <StrainSequence
              result={result}
              reduced={reduced}
              skipRef={skipRef}
              onDone={() => goResult(result)}
            />
          )}

          {/* ── RESULT · NEAR MISS (loss is information, not a dead end) ── */}
          {phase === "result" && result && result.outcome === "loss" && (() => {
            const view = nearMissView(result.roll, result.pWin);
            return (
              <motion.div key="result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="relative flex flex-col items-center gap-4 py-2 text-center"
              >
                <motion.div
                  initial={{ scale: 1.1 }} animate={{ scale: [1.1, 0.96, 1] }} transition={{ duration: reduced ? 0 : 0.4 }}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate/30 bg-slate/10"
                  style={{ willChange: "transform" }}
                >
                  <ShieldAlert className="h-7 w-7 text-slate" aria-hidden />
                </motion.div>

                {/* slate, NOT blood — it's information */}
                <span className="font-display text-2xl font-black uppercase tracking-[0.14em] text-slate">Siege Failed</span>

                {/* the roll vs the threshold, in plain language */}
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-slate">{neededCopy(view)}.</span>
                  <span className="font-mono text-sm font-bold text-white">{rolledCopy(view)}.</span>
                </div>

                {/* horizontal roll-vs-threshold meter (tension) */}
                <NearMissMeter view={view} reduced={reduced} />

                {/* how close, proportionally */}
                <motion.span
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: reduced ? 0 : 0.4 }}
                  className="font-display text-lg font-black tabular-nums"
                  style={{ color: view.tension > 0.6 ? "#FF9900" : "#8892a4" }}
                >
                  You were {view.awayPct}% away from cracking it
                </motion.span>

                {/* fee → vault lord toll confirmation */}
                <div className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <span className="font-mono text-[10px] text-slate">Fee paid → toll to {truncateAddress(result.targetWallet, 4, 4)}</span>
                  <span className="font-mono text-sm font-black tabular-nums text-blood">−{formatSol(result.lost, 3)} SOL</span>
                </div>

                {/* provably-fair reveal */}
                <div className="w-full rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-left">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald">Provably fair</span>
                    <span className="font-mono text-[10px] tabular-nums text-slate">
                      roll {result.roll.toFixed(4)} ≥ p {result.pWin.toFixed(2)} → HELD
                    </span>
                  </div>
                  <p className="truncate font-mono text-[9px] text-dim">seed {result.seed}</p>
                </div>

                {/* never a dead end: siege again / find new target (3s gate) */}
                <div className="grid w-full grid-cols-2 gap-2">
                  <motion.button
                    type="button"
                    onClick={() => { if (lossGateOpen) (onSiegeAgain ?? onClose)(); }}
                    disabled={!lossGateOpen}
                    whileTap={lossGateOpen ? { scale: 0.96 } : undefined}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-blood/40 bg-blood/15 py-3 font-display text-xs font-bold uppercase tracking-[0.1em] text-blood transition-colors hover:bg-blood/25 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ willChange: "transform" }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Siege again
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => { if (lossGateOpen) onClose(); }}
                    disabled={!lossGateOpen}
                    whileTap={lossGateOpen ? { scale: 0.96 } : undefined}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.05] py-3 font-display text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ willChange: "transform" }}
                  >
                    <Search className="h-3.5 w-3.5" aria-hidden /> Find new target
                  </motion.button>
                </div>
                {!lossGateOpen && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">Reading the roll…</span>
                )}
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
