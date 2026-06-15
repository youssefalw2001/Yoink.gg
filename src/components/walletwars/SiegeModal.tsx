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
 * `playCooldownBlock` and renders an explicit in-modal banner — the modal STAYS
 * OPEN. (The parent also mirrors the reason into the StatusBar.)
 *
 * RESULT PHASE: reveals the seed, the roll, and the `roll < p` comparison. A WIN
 * fires a big celebratory crack burst (the shareable dopamine moment); a LOSS is
 * framed as survivable — "bounced — you only lost the fee."
 *
 * FAIR: the crack chance is the FIXED, published per-tier win chance (never
 * varied by streak/heat/size). The vault pick is ceremony over an
 * already-sealed provably-fair roll; the seed is revealed for verification.
 * Animation is Framer Motion + transform/opacity and honours reduced motion.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Crosshair, Flame, TrendingUp, ShieldAlert, Target, Lock, Vault as VaultIcon,
  Zap, ShieldCheck, Share2, ArrowRight,
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

interface SiegeModalProps {
  target: Vault;
  yourVault: number;
  taxMult: number;
  onCommit: () => SiegeResolution;
  onPlaceBounty: (amount: number) => { ok: boolean };
  onClose: () => void;
}

type Phase = "select" | "pick" | "result";
const QR_KEY = "yoink_ww_quickraid";

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

export function SiegeModal({ target, yourVault, taxMult, onCommit, onPlaceBounty, onClose }: SiegeModalProps) {
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
  const [picked, setPicked] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [quickRaid, setQuickRaid] = useState(() => {
    try { return localStorage.getItem(QR_KEY) === "1"; } catch { return false; }
  });

  const bountyPresets = [tier.minBet * 3, tier.minBet * 6, tier.minBet * 12]
    .map((v) => +v.toFixed(3)).filter((v) => v <= yourVault);

  function toggleQuick() {
    setQuickRaid((v) => {
      const n = !v;
      try { localStorage.setItem(QR_KEY, n ? "1" : "0"); } catch { /* ignore */ }
      return n;
    });
  }

  function commit() {
    if (!canAfford) {
      playCooldownBlock();
      setBlocked(rejectionCopy({ kind: "insufficient_funds", required: feeB.fee, available: yourVault }));
      return;
    }
    playYoink();
    const res = onCommit();
    if (!res.ok) {
      // Surface the typed reason instead of silently closing — modal stays open.
      playCooldownBlock();
      setBlocked(rejectionCopy(res.reason));
      return;
    }
    setBlocked(null);
    setResult(res.result);
    if (quickRaid) {
      setPhase("result");
      if (res.result.outcome === "win") playWin();
    } else {
      setPhase("pick");
    }
  }

  function pickVault(i: number) {
    if (picked !== null || !result) return;
    setPicked(i);
    const others = [0, 1, 2].filter((x) => x !== i);
    setLoaded(result.outcome === "win" ? i : others[Math.floor(Math.random() * others.length)]);
    playTick(true);
    window.setTimeout(() => {
      setPhase("result");
      if (result.outcome === "win") playWin();
    }, reduced ? 300 : 1100);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: "rgba(8,8,15,0.9)", backdropFilter: "blur(12px)" }}
      role="dialog" aria-modal="true" aria-label={`Siege ${truncateAddress(target.wallet)}`}
    >
      <motion.div
        initial={{ scale: 0.92, y: 16, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="premium-card relative w-full max-w-sm rounded-[24px] px-6 py-7"
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
                Quick Siege {quickRaid ? "ON" : "OFF"} — skip the vault pick
              </button>
            </motion.div>
          )}

          {/* ── PICK (Crack the Vault) ── */}
          {phase === "pick" && (
            <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5 py-4">
              <span className="font-display text-lg font-black uppercase tracking-[0.18em] text-white">Crack the vault</span>
              <span className="font-mono text-[11px] text-slate">{picked === null ? "Pick a vault — trust your gut" : (result?.outcome === "win" ? "Cracking…" : "Locked tight…")}</span>

              <div className="grid w-full grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => {
                  const isPicked = picked === i;
                  const revealed = picked !== null;
                  const isLoot   = loaded === i;
                  const win      = result?.outcome === "win";
                  const accent = !revealed ? "#8892a4"
                    : isPicked ? (win ? "#FFD700" : "#FF2200")
                    : isLoot ? "#FFD700" : "#3a3f4f";
                  return (
                    <motion.button
                      key={i} type="button" disabled={revealed} onClick={() => pickVault(i)}
                      whileHover={!revealed ? { scale: 1.05, y: -3 } : undefined}
                      whileTap={!revealed ? { scale: 0.95 } : undefined}
                      animate={isPicked && !reduced ? { rotate: [0, -6, 6, -4, 4, 0], scale: [1, 1.1, 1] } : { opacity: revealed && !isLoot ? 0.4 : 1 }}
                      transition={{ duration: 0.5 }}
                      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border"
                      style={{ borderColor: `${accent}66`, background: `${accent}14`, willChange: "transform" }}
                      aria-label={`Vault ${i + 1}`}
                    >
                      {!revealed ? (
                        <Lock className="h-7 w-7 text-slate" aria-hidden />
                      ) : isPicked ? (
                        win ? <TrendingUp className="h-7 w-7 text-gold" aria-hidden /> : <ShieldAlert className="h-7 w-7 text-blood" aria-hidden />
                      ) : isLoot ? (
                        <VaultIcon className="h-7 w-7 text-gold/70" aria-hidden />
                      ) : (
                        <Lock className="h-6 w-6 text-dim" aria-hidden />
                      )}
                    </motion.button>
                  );
                })}
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">outcome already sealed by the seed</span>
            </motion.div>
          )}

          {/* ── RESULT ── */}
          {phase === "result" && result && (
            <motion.div key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={result.outcome === "win" && !reduced ? { opacity: 1, scale: 1, x: [0, -8, 8, -5, 5, 0] } : { opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className="relative flex flex-col items-center gap-4 py-4 text-center"
            >
              {result.outcome === "win" ? (
                <>
                  <div className="relative flex items-center justify-center">
                    {!reduced && <CrackBurst />}
                    <motion.div initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: [0.4, 1.15, 1], rotate: 0 }} transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                      className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/40 bg-gold/15" style={{ willChange: "transform" }}>
                      <TrendingUp className="h-8 w-8 text-gold" aria-hidden />
                    </motion.div>
                  </div>
                  <span className="font-display text-3xl font-black uppercase tracking-[0.1em] gold-text-gradient">Cracked!</span>
                  <span className="font-mono text-sm text-slate">You sliced {truncateAddress(result.targetWallet, 4, 4)}</span>
                  <span className="font-display text-4xl font-black tabular-nums text-[#FF9900]">+{formatSol(result.seized, 3)}</span>
                  <span className="font-mono text-[11px] text-dim">Your vault now {formatSol(result.yourVaultAfter, 3)} SOL</span>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                      `I just cracked ${truncateAddress(result.targetWallet, 4, 4)} for ${formatSol(result.seized, 3)} SOL on YOINK.GG Wallet Wars. yoink.gg`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-gold/10 py-2.5 font-display text-xs font-bold uppercase tracking-[0.12em] text-gold transition-colors hover:bg-gold/20"
                  >
                    <Share2 className="h-3.5 w-3.5" aria-hidden /> Share this heist
                  </a>
                </>
              ) : (
                <>
                  <motion.div initial={{ scale: 0.4 }} animate={{ scale: [0.4, 1.1, 1] }} transition={{ duration: 0.4 }}
                    className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate/30 bg-slate/10" style={{ willChange: "transform" }}>
                    <ShieldAlert className="h-8 w-8 text-slate" aria-hidden />
                  </motion.div>
                  <span className="font-display text-3xl font-black uppercase tracking-[0.1em] text-slate">Bounced</span>
                  <span className="font-mono text-sm text-slate">{truncateAddress(result.targetWallet, 4, 4)} held the vault</span>
                  <span className="font-display text-3xl font-black tabular-nums text-blood">−{formatSol(result.lost, 3)}</span>
                  <span className="font-mono text-[11px] text-dim">You only lost the fee — it banked their vault. Re-up and go again.</span>
                </>
              )}

              {/* provably-fair reveal: seed + roll + roll<p comparison */}
              <div className="w-full rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald">Provably fair</span>
                  <span className="font-mono text-[10px] tabular-nums text-slate">
                    roll {result.roll.toFixed(4)} {result.roll < result.pWin ? "<" : "≥"} p {result.pWin.toFixed(2)} → {result.roll < result.pWin ? "CRACK" : "HELD"}
                  </span>
                </div>
                <p className="truncate font-mono text-[9px] text-dim">seed {result.seed}</p>
              </div>

              <motion.button type="button" onClick={onClose}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} transition={{ duration: 0.14 }}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/[0.05] py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/[0.1]"
                style={{ willChange: "transform" }}
              >
                Back to the board
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
