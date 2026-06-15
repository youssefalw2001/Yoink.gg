/**
 * YourVaultPanel — your side of the "Siege the Vault" economy (was
 * `YourStashPanel`; Task 7.3). Open a vault, watch fees tick in as raids bounce
 * off you, ride your survival streak, auto-compound or harvest, then cash out.
 *
 * Surfaces:
 *   - A BANKED-FEE TICKER that animates UP whenever a raid bounces off you
 *     (the "earning while defending" feel) — count-up honours reduced motion.
 *   - The live SURVIVAL STREAK (the m_k ramp that grows every bounced raid).
 *   - An AUTO-COMPOUND toggle (fold banked → corpus on every settle).
 *   - A manual WITHDRAW-BANKED action (harvest without growing the target).
 *   - CASH OUT (corpus + banked back to the wallet; streak resets).
 *   - A RE-UP affordance when the corpus is depleted below its tier minimum.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Vault, Coins, ShieldCheck, Swords, LogOut, Plus, ShieldOff, Trophy,
  Flame, Repeat, HandCoins, AlertTriangle,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { OPEN_STAKES, type Vault as VaultType, tierForAmount } from "@/lib/walletWarsState";
import {
  feeMultiplierForStreak, STREAK_CFG,
  type RiskProfile, DEFAULT_RISK_PROFILE,
} from "@/lib/siegeMath";
import { formatSol } from "@/lib/utils";
import { playPurchase } from "@/lib/sounds";
import { PurgeAvatar } from "./PurgeAvatar";
import { usePrefersReducedMotion } from "./useReducedMotion";
import { profilePreviews, animateUnlessReduced } from "./riskProfilePresentation";

interface YourVaultPanelProps {
  you: VaultType | null;
  walletBalance: number;
  onOpen: (amount: number, profile: RiskProfile) => void;
  onClose: () => void;
  onWithdrawBanked: () => void;
  onToggleCompound: (compound: boolean) => void;
  displayName?: string;
  avatarSeed?: string;
  avatarVariant?: number | null;
  avatarColor?: string | null;
  /** The player's siege win/loss record (sieges they initiated). */
  raidRecord?: { wins: number; losses: number };
}

/** Count-up to `value`, animating from the previous value (reduced-motion safe). */
function useCountUp(value: number, reduced: boolean): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced || value === fromRef.current) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const delta = value - from;
    const start = performance.now();
    const DURATION = 650;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(from + delta * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, reduced]);

  return display;
}

export function YourVaultPanel({
  you, walletBalance, onOpen, onClose, onWithdrawBanked, onToggleCompound,
  displayName = "", avatarSeed = "You", avatarVariant = null, avatarColor = null,
  raidRecord = { wins: 0, losses: 0 },
}: YourVaultPanelProps) {
  const reduced = usePrefersReducedMotion();

  // Live clock — drives the shield countdown.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const bankedDisplay = useCountUp(you?.banked ?? 0, reduced);
  // Flash the ticker when banked jumps up (a raid just bounced off you).
  const prevBankedRef = useRef(you?.banked ?? 0);
  const [justBanked, setJustBanked] = useState(false);
  useEffect(() => {
    const cur = you?.banked ?? 0;
    if (cur > prevBankedRef.current + 1e-9) {
      setJustBanked(true);
      const t = window.setTimeout(() => setJustBanked(false), 900);
      prevBankedRef.current = cur;
      return () => clearTimeout(t);
    }
    prevBankedRef.current = cur;
  }, [you?.banked]);

  // ── Not staked yet → open-a-vault CTA (stake + risk-profile selector) ─────
  if (!you) {
    return (
      <OpenVaultForm
        walletBalance={walletBalance}
        reduced={reduced}
        onOpen={onOpen}
      />
    );
  }

  // ── Staked → live vault dashboard ─────────────────────────────────────────
  const shieldLeftMs = Math.max(0, you.shieldUntil - now);
  const shielded = shieldLeftMs > 0;
  const shieldLabel = shielded
    ? `${Math.floor(shieldLeftMs / 60000)}m ${Math.floor((shieldLeftMs % 60000) / 1000)}s`
    : null;

  const tier = tierForAmount(you.amount);
  const streakMult = feeMultiplierForStreak(you.streak, STREAK_CFG);
  const streakPct = Math.min(1, you.streak / STREAK_CFG.cap);
  // Depleted below the floor of its weight class → offer a re-up.
  const belowTierMin = you.amount < tier.min;

  return (
    <SpotlightCard spotlightColor="rgba(255,215,0,0.16)" radius={280} className="premium-card rounded-[24px]">
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PurgeAvatar seed={avatarSeed} size={40} pulse variant={avatarVariant} color={avatarColor} />
            <div>
              <h3 className="font-display text-sm font-black text-white">{displayName || "Your vault"}</h3>
              <p className="font-mono text-[10px] text-dim">{tier.label} · live on the board</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald/20 bg-emerald/10 px-2 py-0.5 font-mono text-[10px] text-emerald">
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-emerald"
              animate={reduced ? undefined : { opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              style={{ willChange: "opacity" }}
            />
            Active
          </span>
        </div>

        {/* vault corpus */}
        <div className="flex items-end justify-between rounded-2xl px-4 py-3" style={{ background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.16)" }}>
          <div className="flex flex-col">
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim">Vault corpus</span>
            <motion.span
              key={you.amount}
              initial={reduced ? false : { scale: 1.06 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.25 }}
              className="font-display text-3xl font-black tabular-nums gold-text-gradient"
              style={{ willChange: "transform" }}
            >
              {formatSol(you.amount, 3)}
            </motion.span>
          </div>
          <span className="font-display text-sm text-gold/60">SOL</span>
        </div>

        {/* banked ticker — animates up when a raid bounces off you */}
        <div
          className="flex items-center justify-between rounded-xl px-3 py-2.5"
          style={{
            background: justBanked ? "rgba(0,230,118,0.12)" : "rgba(0,230,118,0.06)",
            border: `1px solid ${justBanked ? "rgba(0,230,118,0.4)" : "rgba(0,230,118,0.16)"}`,
            transition: "background 0.3s, border-color 0.3s",
          }}
        >
          <span className="flex items-center gap-2 font-mono text-[11px] text-slate">
            <Coins className="h-3.5 w-3.5 text-emerald" aria-hidden /> Fees banked
          </span>
          <motion.span
            animate={justBanked && !reduced ? { scale: [1, 1.18, 1] } : { scale: 1 }}
            transition={{ duration: 0.4 }}
            className="font-mono text-sm font-black tabular-nums text-emerald"
            style={{ willChange: "transform" }}
          >
            +{formatSol(bankedDisplay, 3)}
          </motion.span>
        </div>

        {/* lifetime fees earned — monotonic, survives compounding + withdrawals */}
        <div className="flex items-center justify-between rounded-xl border border-gold/[0.16] bg-gold/[0.05] px-3 py-2.5">
          <span className="flex items-center gap-2 font-mono text-[11px] text-slate">
            <Trophy className="h-3.5 w-3.5 text-gold" aria-hidden /> Lifetime fees earned
          </span>
          <span className="font-mono text-sm font-black tabular-nums text-gold">
            {formatSol(you.feesEarned, 3)}
          </span>
        </div>

        {/* survival streak → fee/slice multiplier */}
        <div className="flex flex-col gap-1.5 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,153,0,0.05)", border: "1px solid rgba(255,153,0,0.14)" }}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-mono text-[11px] text-slate">
              <Flame className="h-3.5 w-3.5 text-[#FF9900]" aria-hidden /> Survival streak
            </span>
            <span className="font-mono text-sm font-black tabular-nums text-[#FF9900]">
              {you.streak} · ×{streakMult.toFixed(2)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg,#FF9900,#FFD700)" }}
              initial={false}
              animate={{ width: `${streakPct * 100}%` }}
              transition={{ duration: reduced ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <span className="font-mono text-[9px] text-dim">Every bounced raid ramps your fee + the slice you'd pay — survive to compound it.</span>
        </div>

        {/* shield status */}
        <div
          className="flex items-center justify-between rounded-xl px-3 py-2.5"
          style={{
            background: shielded ? "rgba(0,230,118,0.06)" : "rgba(136,146,164,0.06)",
            border: `1px solid ${shielded ? "rgba(0,230,118,0.16)" : "rgba(136,146,164,0.16)"}`,
          }}
        >
          <span className="flex items-center gap-2 font-mono text-[11px] text-slate">
            {shielded
              ? <ShieldCheck className="h-3.5 w-3.5 text-emerald" aria-hidden />
              : <ShieldOff className="h-3.5 w-3.5 text-slate" aria-hidden />}
            {shielded ? "Shield active" : "No shield — you're raidable"}
          </span>
          <span className="font-mono text-sm font-bold tabular-nums" style={{ color: shielded ? "#00E676" : "#8892a4" }}>
            {shielded ? shieldLabel : "OPEN"}
          </span>
        </div>

        {/* auto-compound toggle */}
        <button
          type="button"
          onClick={() => onToggleCompound(!you.compound)}
          className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors"
          style={{
            background: you.compound ? "rgba(112,0,255,0.08)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${you.compound ? "rgba(112,0,255,0.25)" : "rgba(255,255,255,0.08)"}`,
          }}
          aria-pressed={you.compound}
        >
          <span className="flex items-center gap-2 font-mono text-[11px] text-slate">
            <Repeat className="h-3.5 w-3.5" style={{ color: you.compound ? "#7000FF" : "#8892a4" }} aria-hidden />
            Auto-compound banked fees
          </span>
          <span
            className="relative h-5 w-9 rounded-full transition-colors"
            style={{ background: you.compound ? "#7000FF" : "rgba(255,255,255,0.12)" }}
          >
            <motion.span
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white"
              animate={{ left: you.compound ? 18 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              style={{ willChange: "left" }}
            />
          </span>
        </button>

        {/* stats row — siege W/L + survived + cracked */}
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.03] py-2">
            <Trophy className="h-3.5 w-3.5 text-gold" aria-hidden />
            <span className="font-mono text-sm font-bold tabular-nums text-white">
              {raidRecord.wins}<span className="text-dim">/</span>{raidRecord.losses}
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-dim">siege W/L</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.03] py-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald" aria-hidden />
            <span className="font-mono text-sm font-bold tabular-nums text-white">{you.survived}</span>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-dim">survived</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.03] py-2">
            <Swords className="h-3.5 w-3.5 text-blood" aria-hidden />
            <span className="font-mono text-sm font-bold tabular-nums text-white">{you.cracked}</span>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-dim">cracked</span>
          </div>
        </div>

        {/* re-up affordance — vault depleted below its tier floor */}
        {belowTierMin && (
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,34,0,0.06)", border: "1px solid rgba(255,34,0,0.18)" }}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blood" aria-hidden />
            <span className="font-mono text-[10px] leading-relaxed text-slate">
              Vault depleted below the {tier.label} floor ({formatSol(tier.min, 2)} SOL). Cash out and re-open to
              re-up your corpus and get back in the fight.
            </span>
          </div>
        )}

        {/* harvest banked (no corpus growth) */}
        <motion.button
          type="button"
          onClick={() => { if (you.banked > 0) { playPurchase(); onWithdrawBanked(); } }}
          disabled={you.banked <= 0}
          whileTap={you.banked > 0 ? { scale: 0.97 } : undefined}
          transition={{ duration: 0.12 }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald/25 bg-emerald/[0.08] py-2.5 font-display text-xs font-bold uppercase tracking-[0.12em] text-emerald transition-colors hover:bg-emerald/15 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ willChange: "transform" }}
        >
          <HandCoins className="h-3.5 w-3.5" aria-hidden />
          Withdraw banked {formatSol(you.banked, 3)} SOL
        </motion.button>

        {/* cash out */}
        <motion.button
          type="button"
          onClick={onClose}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12 }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 font-display text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/[0.08]"
          style={{ willChange: "transform" }}
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Cash out {formatSol(you.amount + you.banked, 3)} SOL
        </motion.button>
        <p className="-mt-1 flex items-center justify-center gap-1 text-center font-mono text-[10px] text-dim">
          <Plus className="h-3 w-3" aria-hidden /> Corpus + banked fees returns to your wallet · streak resets
        </p>
      </div>
    </SpotlightCard>
  );
}


/**
 * Open-flow form: pick a stake, then a RISK PROFILE (Fortified → Standard →
 * Exposed, rendered left→right as a low-risk/low-reward → high-risk/high-reward
 * gradient). Each segment previews its own crack odds `p'` and fee `f'` for the
 * entered stake via `vaultParamsFor`; Standard is the default. Selection animates
 * with Framer Motion transform/opacity only, suppressed under reduced motion.
 */
function OpenVaultForm({
  walletBalance,
  reduced,
  onOpen,
}: {
  walletBalance: number;
  reduced: boolean;
  onOpen: (amount: number, profile: RiskProfile) => void;
}) {
  const [stake, setStake] = useState<number>(OPEN_STAKES[0]);
  const [profile, setProfile] = useState<RiskProfile>(DEFAULT_RISK_PROFILE);

  const previews = profilePreviews(stake);
  const selected = previews.find((p) => p.profile === profile) ?? previews[1];
  const tier = tierForAmount(stake);

  return (
    <SpotlightCard spotlightColor="rgba(112,0,255,0.16)" radius={280} className="premium-card rounded-[24px]">
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-phantom/30 bg-phantom/10">
            <Vault className="h-5 w-5 text-phantom" aria-hidden />
          </div>
          <div>
            <h3 className="font-display text-base font-black text-white">Open your vault</h3>
            <p className="font-mono text-[10px] text-dim">Stake it · pick your risk · bank the fees</p>
          </div>
        </div>

        <p className="font-mono text-[11px] leading-relaxed text-slate">
          Lock SOL to become a target — the house at your own table. Every failed siege banks you a
          toll. Your stake sets your weight class; your risk profile sets how often you get cracked.
        </p>

        {/* stake presets — selectable */}
        <div>
          <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Stake</span>
          <div className="grid grid-cols-4 gap-2">
            {OPEN_STAKES.map((amt) => {
              const t = tierForAmount(amt);
              const active = amt === stake;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setStake(amt)}
                  aria-pressed={active}
                  className="flex flex-col items-center gap-0.5 rounded-xl border py-2.5 font-mono transition-colors hover:bg-white/[0.04]"
                  style={{
                    background: active ? `${t.accent}1f` : `${t.accent}0d`,
                    borderColor: active ? `${t.accent}88` : `${t.accent}40`,
                  }}
                >
                  <span className="text-sm font-black tabular-nums text-white">{amt}</span>
                  <span className="text-[8px] uppercase tracking-[0.08em]" style={{ color: t.accent }}>
                    {t.label.replace("The ", "")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* risk-profile 3-segment selector — low→high gradient */}
        <div>
          <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
            Risk profile · low → high
          </span>
          <div className="grid grid-cols-3 gap-2">
            {previews.map((p) => {
              const active = p.profile === profile;
              return (
                <motion.button
                  key={p.profile}
                  type="button"
                  onClick={() => setProfile(p.profile)}
                  aria-pressed={active}
                  whileHover={animateUnlessReduced(reduced, { scale: 1.03 })}
                  whileTap={animateUnlessReduced(reduced, { scale: 0.97 })}
                  animate={animateUnlessReduced(reduced, { opacity: active ? 1 : 0.62 })}
                  transition={{ duration: 0.18 }}
                  className="flex flex-col items-center gap-0.5 rounded-xl border py-2 font-mono transition-colors"
                  style={{
                    background: active ? `${p.accent}22` : "rgba(255,255,255,0.02)",
                    borderColor: active ? `${p.accent}88` : "rgba(255,255,255,0.08)",
                    willChange: "transform, opacity",
                  }}
                >
                  <span className="text-[10px] font-black uppercase tracking-[0.08em]" style={{ color: p.accent }}>
                    {p.label}
                  </span>
                  <span className="text-[9px] tabular-nums text-slate">{p.crackPct} crack</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* preview of the selected profile for this stake */}
        <div className="flex flex-col gap-2 rounded-xl px-3 py-2.5" style={{ background: `${selected.accent}0d`, border: `1px solid ${selected.accent}33` }}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-slate">
              <ShieldCheck className="h-3.5 w-3.5" style={{ color: selected.accent }} aria-hidden /> Crack odds
            </span>
            <span className="font-mono text-sm font-black tabular-nums" style={{ color: selected.accent }}>{selected.crackPct}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-slate">
              <Coins className="h-3.5 w-3.5 text-emerald" aria-hidden /> Toll banked / failed siege
            </span>
            <span className="font-mono text-sm font-black tabular-nums text-emerald">+{formatSol(selected.feeSol, 4)}</span>
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-dim">{selected.blurb}</p>
        </div>

        <motion.button
          type="button"
          onClick={() => { playPurchase(); onOpen(stake, profile); }}
          whileTap={animateUnlessReduced(reduced, { scale: 0.97 })}
          transition={{ duration: 0.12 }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border py-3 font-display text-sm font-black uppercase tracking-[0.12em] transition-colors"
          style={{
            background: `${tier.accent}1a`,
            borderColor: `${tier.accent}55`,
            color: tier.accent,
            willChange: "transform",
          }}
        >
          <Vault className="h-4 w-4" aria-hidden />
          Open {formatSol(stake, 2)} SOL · {selected.label}
        </motion.button>

        <p className="text-center font-mono text-[10px] text-dim">
          Real balance: {formatSol(walletBalance, 2)} SOL · stakes are simulated (devnet)
        </p>
      </div>
    </SpotlightCard>
  );
}
