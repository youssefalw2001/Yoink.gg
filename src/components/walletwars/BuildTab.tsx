/**
 * BuildTab — the VAULT LORD terminal ("become the house").
 *
 * Everything here helps a Vault Lord maximise fee income. Calm, optimised,
 * number-focused — a yield terminal, not a casino.
 *
 *   1. EARNINGS HERO    — today's banked fees, huge gold mono, live-incrementing.
 *                         Week + lifetime underneath. The most important number.
 *   2. VAULT STATUS     — size, risk badge, survival streak (+ON FIRE >10),
 *                         shield countdown, tier name + position.
 *   3. RISK SELECTOR    — Fortified / Standard / Exposed with exact fee
 *                         multiplier + crack odds; takes effect next siege.
 *   4. OPEN FLOW        — four tier presets with estimated daily fee income +
 *                         the three risk profiles; two taps to an earning vault.
 *   5. BOUNTY SECTION   — your bounty exposure, place-bounty-on-others, and the
 *                         live bounty board (phantom accent).
 *
 * Economy is FROZEN: all numbers derive from siegeMath via vaultParamsFor /
 * computeFee. Framer Motion + transform/opacity only; reduced-motion aware.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Coins, Trophy, Flame, ShieldCheck, ShieldOff, Vault, LogOut, HandCoins, Repeat,
  Target, Plus, TrendingUp, AlertTriangle, Crown, Gauge, Banknote,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import {
  OPEN_STAKES, tierForAmount, tierIndexForAmount,
  type Vault as VaultType,
} from "@/lib/walletWarsState";
import {
  RISK_PROFILE_ORDER, RISK_PROFILES, DEFAULT_RISK_PROFILE,
  vaultParamsFor, computeFee, feeMultiplierForStreak, STREAK_CFG,
  type RiskProfile,
} from "@/lib/siegeMath";
import { profilePreviews, PROFILE_ACCENT, profileBadgeLabel, animateUnlessReduced } from "./riskProfilePresentation";
import { formatSol, truncateAddress } from "@/lib/utils";
import { playPurchase } from "@/lib/sounds";
import { PurgeAvatar } from "./PurgeAvatar";
import { usePrefersReducedMotion } from "./useReducedMotion";
import { useCountUp } from "./useCountUp";
import type { EarningsTotals } from "./useEarningsLedger";

/** Marketing estimate of siege volume per active vault per day (defender banks a toll every siege). */
const SIEGES_PER_DAY_ESTIMATE = 36;

/** Estimated daily fee income for a stake + profile (gross tolls; defender banks every siege). */
function estDailyFees(amount: number, profile: RiskProfile): number {
  const params = vaultParamsFor(amount, profile);
  const tollPerSiege = computeFee(amount, params, 1, 0).toDefenderOnFail;
  return tollPerSiege * SIEGES_PER_DAY_ESTIMATE;
}

/** Fee multiplier of a profile relative to the tier's Standard fee. */
function feeMultiplierVsStandard(amount: number, profile: RiskProfile): number {
  const base = vaultParamsFor(amount, "standard").feeRate;
  const f = vaultParamsFor(amount, profile).feeRate;
  return base > 0 ? f / base : 1;
}

interface BuildTabProps {
  you: VaultType | null;
  walletBalance: number;
  stashes: VaultType[];
  /** Account-level earnings totals (single ledger owned by the screen). */
  earnings: EarningsTotals;
  onOpen: (amount: number, profile: RiskProfile) => void;
  onClose: () => void;
  onWithdrawBanked: () => void;
  onToggleCompound: (compound: boolean) => void;
  onSetRiskProfile: (profile: RiskProfile) => void;
  onPlaceBounty: (targetId: string, amount: number) => { ok: boolean };
  displayName?: string;
  avatarSeed?: string;
  avatarVariant?: number | null;
  avatarColor?: string | null;
  raidRecord?: { wins: number; losses: number };
}

export function BuildTab({
  you, walletBalance, stashes, earnings, onOpen, onClose, onWithdrawBanked, onToggleCompound,
  onSetRiskProfile, onPlaceBounty,
  displayName = "", avatarSeed = "You", avatarVariant = null, avatarColor = null,
  raidRecord = { wins: 0, losses: 0 },
}: BuildTabProps) {
  const reduced = usePrefersReducedMotion();

  return (
    <div className="flex flex-col gap-5">
      {you ? (
        <>
          <EarningsHero earnings={earnings} reduced={reduced} />
          <VaultStatusPanel
            you={you}
            stashes={stashes}
            reduced={reduced}
            displayName={displayName}
            avatarSeed={avatarSeed}
            avatarVariant={avatarVariant}
            avatarColor={avatarColor}
            raidRecord={raidRecord}
          />
          <RiskProfileSwitcher you={you} reduced={reduced} onSetRiskProfile={onSetRiskProfile} />
          <VaultActions you={you} reduced={reduced} onClose={onClose} onWithdrawBanked={onWithdrawBanked} onToggleCompound={onToggleCompound} />
        </>
      ) : (
        <OpenVaultFlow walletBalance={walletBalance} reduced={reduced} onOpen={onOpen} />
      )}

      <BountySection you={you} stashes={stashes} onPlaceBounty={onPlaceBounty} reduced={reduced} />
    </div>
  );
}

// ── 1 · Earnings hero ───────────────────────────────────────────────────────────

function EarningsHero({ earnings, reduced }: { earnings: { today: number; week: number; lifetime: number }; reduced: boolean }) {
  const today = useCountUp(earnings.today, reduced, 700);
  return (
    <div
      className="relative overflow-hidden rounded-[24px] px-6 py-6"
      style={{ background: "linear-gradient(150deg, #15100a 0%, #08080f 60%, #120a1f 100%)", border: "1px solid rgba(255,215,0,0.18)" }}
    >
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #FFD700 50%, transparent)" }} aria-hidden />
      <div className="pointer-events-none absolute -right-8 -top-8 opacity-[0.12]" aria-hidden>
        <Banknote className="h-32 w-32 text-gold" />
      </div>

      <div className="relative flex flex-col gap-1">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-slate">
          <Coins className="h-3.5 w-3.5 text-gold" aria-hidden /> Fees earned today
        </span>
        <div className="flex items-end gap-2">
          <motion.span
            animate={reduced ? undefined : { opacity: [1, 0.85, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="font-mono font-black tabular-nums gold-text-gradient"
            style={{ fontSize: "clamp(2.4rem, 11vw, 3.6rem)", lineHeight: 1, willChange: "opacity" }}
          >
            {formatSol(today, 4)}
          </motion.span>
          <span className="mb-1 font-display text-sm font-black text-gold/60">SOL</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-4">
          <div className="flex flex-col">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">This week</span>
            <span className="font-mono text-sm font-bold tabular-nums text-slate">{formatSol(earnings.week, 3)} SOL</span>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Lifetime</span>
            <span className="font-mono text-sm font-bold tabular-nums text-slate">{formatSol(earnings.lifetime, 3)} SOL</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 2 · Vault status ─────────────────────────────────────────────────────────────

function VaultStatusPanel({
  you, stashes, reduced, displayName, avatarSeed, avatarVariant, avatarColor, raidRecord,
}: {
  you: VaultType; stashes: VaultType[]; reduced: boolean;
  displayName: string; avatarSeed: string; avatarVariant: number | null; avatarColor: string | null;
  raidRecord: { wins: number; losses: number };
}) {
  const tier = tierForAmount(you.amount);
  const tierIdx = tierIndexForAmount(you.amount);
  const streakMult = feeMultiplierForStreak(you.streak, STREAK_CFG);
  const onFire = you.streak > 10;
  const profileAccent = PROFILE_ACCENT[you.riskProfile];

  // Live shield countdown.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const shieldLeftMs = Math.max(0, you.shieldUntil - now);
  const shielded = shieldLeftMs > 0;

  // Position within the weight class by corpus (you + same-tier board vaults).
  const position = useMemo(() => {
    const sameTier = stashes.filter((s) => tierIndexForAmount(s.amount) === tierIdx && !s.isYou);
    const ranked = [...sameTier, you].sort((a, b) => b.amount - a.amount);
    return { rank: ranked.findIndex((v) => v.id === you.id) + 1, total: ranked.length };
  }, [stashes, you, tierIdx]);

  return (
    <SpotlightCard spotlightColor="rgba(255,215,0,0.14)" radius={280} className="premium-card rounded-[24px]">
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PurgeAvatar seed={avatarSeed} size={40} pulse variant={avatarVariant} color={avatarColor} />
            <div>
              <h3 className="font-display text-sm font-black text-white">{displayName || "Your vault"}</h3>
              <p className="font-mono text-[10px] text-dim">Live on the board · banking tolls</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald/20 bg-emerald/10 px-2 py-0.5 font-mono text-[10px] text-emerald">
            <motion.span className="h-1.5 w-1.5 rounded-full bg-emerald" animate={reduced ? undefined : { opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} style={{ willChange: "opacity" }} />
            Active
          </span>
        </div>

        {/* corpus + tier/position */}
        <div className="flex items-end justify-between rounded-2xl px-4 py-3" style={{ background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.16)" }}>
          <div className="flex flex-col">
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim">Vault size</span>
            <motion.span key={you.amount} initial={reduced ? false : { scale: 1.05 }} animate={{ scale: 1 }} transition={{ duration: 0.25 }} className="font-display text-3xl font-black tabular-nums gold-text-gradient" style={{ willChange: "transform" }}>
              {formatSol(you.amount, 3)}
            </motion.span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="flex items-center gap-1 font-mono text-[11px] font-bold" style={{ color: tier.accent }}>
              <Crown className="h-3 w-3" aria-hidden /> {tier.label}
            </span>
            <span className="font-mono text-[10px] text-slate">#{position.rank} of {position.total} in class</span>
          </div>
        </div>

        {/* status chips: risk · streak · shield */}
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center" style={{ background: `${profileAccent}10`, border: `1px solid ${profileAccent}33` }}>
            <Gauge className="h-3.5 w-3.5" style={{ color: profileAccent }} aria-hidden />
            <span className="font-mono text-[11px] font-black uppercase tracking-[0.08em]" style={{ color: profileAccent }}>{profileBadgeLabel(you.riskProfile)}</span>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-dim">risk profile</span>
          </div>

          <div className="flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center" style={{ background: onFire ? "rgba(255,34,0,0.08)" : "rgba(255,153,0,0.06)", border: `1px solid ${onFire ? "rgba(255,34,0,0.3)" : "rgba(255,153,0,0.16)"}` }}>
            <Flame className="h-3.5 w-3.5" style={{ color: onFire ? "#FF2200" : "#FF9900" }} aria-hidden />
            <span className="flex items-center gap-1 font-mono text-[11px] font-black tabular-nums" style={{ color: onFire ? "#FF2200" : "#FF9900" }}>
              {you.streak} · ×{streakMult.toFixed(2)}
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em]" style={{ color: onFire ? "#FF2200" : "#8892a4" }}>
              {onFire ? "ON FIRE" : "streak"}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center" style={{ background: shielded ? "rgba(0,230,118,0.06)" : "rgba(136,146,164,0.06)", border: `1px solid ${shielded ? "rgba(0,230,118,0.18)" : "rgba(136,146,164,0.16)"}` }}>
            {shielded ? <ShieldCheck className="h-3.5 w-3.5 text-emerald" aria-hidden /> : <ShieldOff className="h-3.5 w-3.5 text-slate" aria-hidden />}
            <span className="font-mono text-[11px] font-black tabular-nums" style={{ color: shielded ? "#00E676" : "#8892a4" }}>
              {shielded ? `${Math.ceil(shieldLeftMs / 1000)}s` : "OPEN"}
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-dim">{shielded ? "shield" : "raidable"}</span>
          </div>
        </div>

        {/* banked + lifetime + W/L */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Banked" value={`${formatSol(you.banked, 3)}`} color="#00E676" icon={<Coins className="h-3.5 w-3.5 text-emerald" aria-hidden />} />
          <Stat label="Lifetime fees" value={`${formatSol(you.feesEarned, 3)}`} color="#FFD700" icon={<Trophy className="h-3.5 w-3.5 text-gold" aria-hidden />} />
          <Stat label="Siege W/L" value={`${raidRecord.wins}/${raidRecord.losses}`} color="#eef1f6" icon={<TrendingUp className="h-3.5 w-3.5 text-slate" aria-hidden />} />
        </div>
      </div>
    </SpotlightCard>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.03] py-2">
      {icon}
      <span className="font-mono text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
      <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-dim">{label}</span>
    </div>
  );
}

// ── 3 · Risk profile switcher (active vault) ─────────────────────────────────────

function RiskProfileSwitcher({ you, reduced, onSetRiskProfile }: { you: VaultType; reduced: boolean; onSetRiskProfile: (p: RiskProfile) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <Gauge className="h-4 w-4 text-gold" aria-hidden />
        <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-slate">Risk profile</h2>
        <span className="font-mono text-[10px] text-dim">takes effect next siege</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {RISK_PROFILE_ORDER.map((profile) => {
          const accent = PROFILE_ACCENT[profile];
          const active = you.riskProfile === profile;
          const feeMult = feeMultiplierVsStandard(you.amount, profile);
          const odds = vaultParamsFor(you.amount, profile).winChance;
          return (
            <motion.button
              key={profile}
              type="button"
              onClick={() => { if (!active) { playPurchase(); onSetRiskProfile(profile); } }}
              aria-pressed={active}
              whileHover={animateUnlessReduced(reduced, { scale: 1.03 })}
              whileTap={animateUnlessReduced(reduced, { scale: 0.97 })}
              className="flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 transition-colors"
              style={{
                background: active ? `${accent}1f` : "rgba(255,255,255,0.02)",
                borderColor: active ? `${accent}88` : "rgba(255,255,255,0.08)",
                willChange: "transform",
              }}
            >
              <span className="font-display text-[11px] font-black uppercase tracking-[0.06em]" style={{ color: accent }}>{RISK_PROFILES[profile].label}</span>
              <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color: accent }}>×{feeMult.toFixed(2)} fee</span>
              <span className="font-mono text-[10px] tabular-nums text-slate">{(odds * 100).toFixed(0)}% crack</span>
            </motion.button>
          );
        })}
      </div>
      <p className="px-1 font-mono text-[9px] leading-relaxed text-dim">
        Fortified banks a smaller toll but is cracked rarely; Exposed banks a fatter toll per siege but is cracked more often. Defender EV is the same — you're choosing variance.
      </p>
    </div>
  );
}

// ── 3b · Vault actions (compound / withdraw / cash out) ──────────────────────────

function VaultActions({ you, reduced, onClose, onWithdrawBanked, onToggleCompound }: {
  you: VaultType; reduced: boolean; onClose: () => void; onWithdrawBanked: () => void; onToggleCompound: (c: boolean) => void;
}) {
  const tier = tierForAmount(you.amount);
  const belowTierMin = you.amount < tier.min;
  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => onToggleCompound(!you.compound)}
        className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors"
        style={{ background: you.compound ? "rgba(112,0,255,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${you.compound ? "rgba(112,0,255,0.25)" : "rgba(255,255,255,0.08)"}` }}
        aria-pressed={you.compound}
      >
        <span className="flex items-center gap-2 font-mono text-[11px] text-slate">
          <Repeat className="h-3.5 w-3.5" style={{ color: you.compound ? "#7000FF" : "#8892a4" }} aria-hidden />
          Auto-compound banked fees
        </span>
        <span className="relative h-5 w-9 rounded-full transition-colors" style={{ background: you.compound ? "#7000FF" : "rgba(255,255,255,0.12)" }}>
          <motion.span className="absolute top-0.5 h-4 w-4 rounded-full bg-white" animate={{ left: you.compound ? 18 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} style={{ willChange: "left" }} />
        </span>
      </button>

      {belowTierMin && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,34,0,0.06)", border: "1px solid rgba(255,34,0,0.18)" }}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blood" aria-hidden />
          <span className="font-mono text-[10px] leading-relaxed text-slate">
            Vault depleted below the {tier.label} floor ({formatSol(tier.min, 2)} SOL). Cash out and re-open to re-up your corpus.
          </span>
        </div>
      )}

      <motion.button
        type="button"
        onClick={() => { if (you.banked > 0) { playPurchase(); onWithdrawBanked(); } }}
        disabled={you.banked <= 0}
        whileTap={you.banked > 0 ? animateUnlessReduced(reduced, { scale: 0.97 }) : undefined}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald/25 bg-emerald/[0.08] py-2.5 font-display text-xs font-bold uppercase tracking-[0.12em] text-emerald transition-colors hover:bg-emerald/15 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ willChange: "transform" }}
      >
        <HandCoins className="h-3.5 w-3.5" aria-hidden /> Withdraw banked {formatSol(you.banked, 3)} SOL
      </motion.button>

      <motion.button
        type="button"
        onClick={onClose}
        whileTap={animateUnlessReduced(reduced, { scale: 0.97 })}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 font-display text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/[0.08]"
        style={{ willChange: "transform" }}
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden /> Cash out {formatSol(you.amount + you.banked, 3)} SOL
      </motion.button>
      <p className="-mt-1 flex items-center justify-center gap-1 text-center font-mono text-[10px] text-dim">
        <Plus className="h-3 w-3" aria-hidden /> Corpus + banked fees returns to your wallet · streak resets
      </p>
    </div>
  );
}

// ── 4 · Open-vault flow ──────────────────────────────────────────────────────────

function OpenVaultFlow({ walletBalance, reduced, onOpen }: { walletBalance: number; reduced: boolean; onOpen: (amount: number, profile: RiskProfile) => void }) {
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
            <h3 className="font-display text-base font-black text-white">Deploy a vault · become the house</h3>
            <p className="font-mono text-[10px] text-dim">Two taps to a vault that earns while you sleep</p>
          </div>
        </div>

        {/* tier presets with est daily fee income */}
        <div>
          <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Pick your weight class</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {OPEN_STAKES.map((amt) => {
              const t = tierForAmount(amt);
              const active = amt === stake;
              const est = estDailyFees(amt, profile);
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setStake(amt)}
                  aria-pressed={active}
                  className="flex flex-col items-center gap-0.5 rounded-xl border py-2.5 font-mono transition-colors hover:bg-white/[0.04]"
                  style={{ background: active ? `${t.accent}1f` : `${t.accent}0d`, borderColor: active ? `${t.accent}88` : `${t.accent}40` }}
                >
                  <span className="text-sm font-black tabular-nums text-white">{amt}</span>
                  <span className="text-[8px] uppercase tracking-[0.08em]" style={{ color: t.accent }}>{t.label.replace("The ", "")}</span>
                  <span className="mt-0.5 text-[8px] tabular-nums text-emerald">≈{formatSol(est, 3)}/day</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* risk profiles with fee multipliers */}
        <div>
          <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Risk profile · low → high</span>
          <div className="grid grid-cols-3 gap-2">
            {previews.map((p) => {
              const active = p.profile === profile;
              const feeMult = feeMultiplierVsStandard(stake, p.profile);
              return (
                <motion.button
                  key={p.profile}
                  type="button"
                  onClick={() => setProfile(p.profile)}
                  aria-pressed={active}
                  whileHover={animateUnlessReduced(reduced, { scale: 1.03 })}
                  whileTap={animateUnlessReduced(reduced, { scale: 0.97 })}
                  animate={animateUnlessReduced(reduced, { opacity: active ? 1 : 0.62 })}
                  className="flex flex-col items-center gap-0.5 rounded-xl border py-2 font-mono transition-colors"
                  style={{ background: active ? `${p.accent}22` : "rgba(255,255,255,0.02)", borderColor: active ? `${p.accent}88` : "rgba(255,255,255,0.08)", willChange: "transform, opacity" }}
                >
                  <span className="text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: p.accent }}>{p.label}</span>
                  <span className="text-[9px] font-bold tabular-nums" style={{ color: p.accent }}>×{feeMult.toFixed(2)} fee</span>
                  <span className="text-[9px] tabular-nums text-slate">{p.crackPct} crack</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* selected preview */}
        <div className="flex flex-col gap-2 rounded-xl px-3 py-2.5" style={{ background: `${selected.accent}0d`, border: `1px solid ${selected.accent}33` }}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-slate">
              <Coins className="h-3.5 w-3.5 text-emerald" aria-hidden /> Est. daily fee income
            </span>
            <span className="font-mono text-sm font-black tabular-nums text-emerald">≈{formatSol(estDailyFees(stake, profile), 3)} SOL</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-slate">
              <ShieldCheck className="h-3.5 w-3.5" style={{ color: selected.accent }} aria-hidden /> Crack odds vs you
            </span>
            <span className="font-mono text-sm font-black tabular-nums" style={{ color: selected.accent }}>{selected.crackPct}</span>
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-dim">{selected.blurb}</p>
        </div>

        <motion.button
          type="button"
          onClick={() => { playPurchase(); onOpen(stake, profile); }}
          whileTap={animateUnlessReduced(reduced, { scale: 0.97 })}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border py-3 font-display text-sm font-black uppercase tracking-[0.12em] transition-colors"
          style={{ background: `${tier.accent}1a`, borderColor: `${tier.accent}55`, color: tier.accent, willChange: "transform" }}
        >
          <Vault className="h-4 w-4" aria-hidden /> Open {formatSol(stake, 2)} SOL · {selected.label}
        </motion.button>

        <p className="text-center font-mono text-[10px] text-dim">Real balance: {formatSol(walletBalance, 2)} SOL · stakes are simulated (devnet)</p>
      </div>
    </SpotlightCard>
  );
}

// ── 5 · Bounty section ───────────────────────────────────────────────────────────

function BountySection({ you, stashes, onPlaceBounty, reduced }: {
  you: VaultType | null; stashes: VaultType[]; onPlaceBounty: (id: string, amt: number) => { ok: boolean }; reduced: boolean;
}) {
  const [note, setNote] = useState<string | null>(null);

  const bountied = useMemo(
    () => stashes.filter((s) => !s.isYou && (s.bountyPool ?? 0) > 0).sort((a, b) => b.bountyPool - a.bountyPool).slice(0, 6),
    [stashes],
  );

  // Suggested target to put a price on: hottest same-class vault (or overall biggest).
  const target = useMemo(() => {
    const pool = you ? stashes.filter((s) => !s.isYou && tierIndexForAmount(s.amount) === tierIndexForAmount(you.amount)) : stashes.filter((s) => !s.isYou);
    return [...pool].sort((a, b) => b.amount - a.amount)[0] ?? null;
  }, [stashes, you]);

  const presets = you ? [tierForAmount(you.amount).minBet * 3, tierForAmount(you.amount).minBet * 6, tierForAmount(you.amount).minBet * 12].map((v) => +v.toFixed(3)) : [];

  function place(amt: number) {
    if (!you || !target) return;
    const res = onPlaceBounty(target.id, amt);
    if (res.ok) { playPurchase(); setNote(`Bounty +${formatSol(amt, 2)} SOL posted on ${truncateAddress(target.wallet, 4, 4)}`); }
    else setNote("Bounty declined — it would drop you below your tier, or the amount is invalid.");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <Target className="h-4 w-4 text-phantom" aria-hidden />
        <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-phantom">Bounties</h2>
      </div>

      {/* bounty exposure on your own vault */}
      <div className="flex items-center justify-between rounded-2xl border border-phantom/20 bg-phantom/[0.05] px-3.5 py-2.5">
        <span className="flex items-center gap-2 font-mono text-[11px] text-slate">
          <Crown className="h-3.5 w-3.5 text-phantom" aria-hidden /> Price on your head
        </span>
        <span className="font-mono text-sm font-black tabular-nums text-phantom">
          {you && you.bountyPool > 0 ? `${formatSol(you.bountyPool, 2)} SOL` : "None yet"}
        </span>
      </div>

      {/* place a bounty on others */}
      <div className="flex flex-col gap-2 rounded-2xl border border-phantom/20 bg-phantom/[0.04] px-3.5 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate">
          {target ? <>Put a price on <span className="text-white">{truncateAddress(target.wallet, 4, 4)}</span></> : "No targets to bounty yet"}
        </span>
        {you ? (
          <div className="grid grid-cols-3 gap-2">
            {presets.map((amt) => (
              <motion.button
                key={amt}
                type="button"
                onClick={() => place(amt)}
                disabled={!target}
                whileTap={target ? animateUnlessReduced(reduced, { scale: 0.96 }) : undefined}
                className="rounded-xl border border-phantom/30 bg-phantom/[0.08] py-2 font-mono text-xs font-bold tabular-nums text-phantom transition-colors hover:bg-phantom/15 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ willChange: "transform" }}
              >
                +{formatSol(amt, 2)}
              </motion.button>
            ))}
          </div>
        ) : (
          <p className="font-mono text-[10px] text-dim">Open a vault to fund bounties from your corpus.</p>
        )}
        <AnimatePresence>
          {note && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="font-mono text-[10px] text-phantom">
              {note}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* live bounty board */}
      <div className="flex flex-col gap-2">
        <span className="px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">Top active bounties</span>
        {bountied.length === 0 ? (
          <div className="rounded-2xl border border-phantom/15 bg-phantom/[0.04] px-4 py-3 text-center font-mono text-[11px] text-slate">
            No bounties live right now — be the first to post one.
          </div>
        ) : (
          bountied.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-phantom/25 bg-phantom/[0.06] px-3 py-2.5">
              <PurgeAvatar seed={s.wallet} size={30} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-xs font-bold text-white">{truncateAddress(s.wallet, 4, 4)}</span>
                <span className="font-mono text-[10px] text-dim">{tierForAmount(s.amount).label}</span>
              </div>
              <span className="flex items-center gap-1 font-mono text-sm font-black tabular-nums text-phantom">
                <Target className="h-3 w-3" aria-hidden /> {formatSol(s.bountyPool, 2)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
