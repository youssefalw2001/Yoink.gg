/**
 * OpportunityCard — a single siege target on the SIEGE RUNNER hunt board.
 *
 * Fast, exciting, target-focused. Shows exactly the fields a runner weighs and
 * nothing else: shortened wallet, ON FIRE badge (streak > 10), vault size, risk
 * badge, crack odds (emerald < 10% / gold ≥ 10%), the fee you risk (blood), the
 * crack slice you could win (gold + trophy), the upside multiple (slate), a
 * bounty badge (phantom) when live, an IDLE targeting signal (owner quiet > 30
 * min), and one big SIEGE button — or a SHIELDED badge when protected.
 *
 * Tap to expand the near-miss history: the last five attempts against this vault
 * and how close each came to cracking — targeting intelligence that builds
 * tension. All economy values come from siegeMath via `vaultEconomics`; the win
 * rule stays `roll < p`. Framer Motion transform/opacity only, reduced-motion safe.
 */

import { memo, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Crosshair, Lock, Flame, Trophy, Percent, Clock, ChevronDown } from "lucide-react";
import { type Vault, tierForAmount, WAR_CONFIG } from "@/lib/walletWarsState";
import { formatSol, truncateAddress } from "@/lib/utils";
import { vaultEconomics, animateUnlessReduced } from "./riskProfilePresentation";
import { upsideMultiple, lastActivityFromShield, isIdleTarget } from "@/lib/walletWarsActivity";
import { syntheticAttempts } from "./nearMiss";
import { PurgeAvatar } from "./PurgeAvatar";
import { usePrefersReducedMotion } from "./useReducedMotion";

interface OpportunityCardProps {
  vault: Vault;
  canRaid: boolean;
  onSiege: (id: string) => void;
  /** Shared clock (ms) from the board so we don't run an interval per card. */
  now: number;
}

export const OpportunityCard = memo(function OpportunityCard({ vault, canRaid, onSiege, now }: OpportunityCardProps) {
  const reduced = usePrefersReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const econ = vaultEconomics(vault);
  const upside = upsideMultiple(econ.sliceWon, econ.feeRisked);
  const oddsPct = econ.crackChance * 100;
  const oddsColor = econ.crackChance < 0.1 ? "#00E676" : "#FFD700";

  const onFire = vault.streak > 10;
  const shieldLeft = Math.max(0, vault.shieldUntil - now);
  const shielded = shieldLeft > 0;
  const idle = isIdleTarget(lastActivityFromShield(vault.shieldUntil, vault.openedAt, WAR_CONFIG.SHIELD_MS), now);

  const attempts = useMemo(() => syntheticAttempts(vault.id, econ.crackChance, 5), [vault.id, econ.crackChance]);

  const accent = vault.amount >= 5 ? "#FFD700" : "#7000FF";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="premium-card relative flex flex-col gap-3 overflow-hidden rounded-[20px] px-4 py-3.5"
      style={{
        border: `1px solid ${onFire ? "rgba(255,34,0,0.4)" : "rgba(255,255,255,0.06)"}`,
        boxShadow: onFire ? "0 0 24px rgba(255,34,0,0.18)" : vault.amount >= 5 ? "0 0 20px rgba(255,215,0,0.1)" : undefined,
      }}
    >
      {/* header */}
      <div className="flex items-center gap-2.5">
        <PurgeAvatar seed={vault.wallet} size={38} pulse={onFire} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono text-xs font-bold text-white">{truncateAddress(vault.wallet, 4, 4)}</span>
          <span className="font-mono text-[10px] text-dim">{tierForAmount(vault.amount).label}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.1em]" style={{ background: `${econ.accent}1f`, border: `1px solid ${econ.accent}66`, color: econ.accent }}>
            {econ.badge}
          </span>
          <div className="flex items-center gap-1">
            {idle && !shielded && (
              <span className="flex items-center gap-0.5 rounded-full border border-slate/30 bg-slate/10 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-slate">
                <Clock className="h-2.5 w-2.5" aria-hidden /> Idle
              </span>
            )}
            {onFire && (
              <motion.span
                className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-[0.08em]"
                style={{ background: "rgba(255,34,0,0.15)", border: "1px solid rgba(255,34,0,0.5)", color: "#FF2200" }}
                animate={animateUnlessReduced(reduced, { scale: [1, 1.08, 1] })}
                transition={{ duration: 1.1, repeat: Infinity }}
              >
                <Flame className="h-2.5 w-2.5" aria-hidden /> On Fire
              </motion.span>
            )}
          </div>
        </div>
      </div>

      {/* size + odds */}
      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim">Vault</span>
          <span className="font-display text-2xl font-black tabular-nums" style={{ color: accent }}>
            {formatSol(vault.amount, 2)}<span className="ml-1 text-xs text-slate">SOL</span>
          </span>
        </div>
        <span className="flex items-center gap-1 font-mono text-[11px] font-bold" style={{ color: oddsColor }}>
          <Percent className="h-3 w-3" aria-hidden /> {oddsPct.toFixed(0)}% crack odds
        </span>
      </div>

      {/* fee → slice → upside */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-0.5 rounded-lg px-2 py-1.5" style={{ background: "rgba(255,34,0,0.06)", border: "1px solid rgba(255,34,0,0.14)" }}>
          <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-dim">You risk</span>
          <span className="font-mono text-sm font-black tabular-nums text-blood">{formatSol(econ.feeRisked, 3)}</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg px-2 py-1.5" style={{ background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.14)" }}>
          <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-dim">Crack slice</span>
          <span className="flex items-center gap-1 font-mono text-sm font-black tabular-nums text-gold">
            <Trophy className="h-3 w-3" aria-hidden />{formatSol(econ.sliceWon, 2)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-dim">Upside</span>
          <span className="font-mono text-sm font-black tabular-nums text-slate">{upside.toFixed(1)}× fee</span>
        </div>
      </div>

      {/* near-miss history toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
      >
        <span className="font-mono text-[10px] text-slate">Near-miss history · last 5 sieges</span>
        <ChevronDown className="h-3.5 w-3.5 text-dim transition-transform" style={{ transform: expanded ? "rotate(180deg)" : undefined }} aria-hidden />
      </button>
      {expanded && (
        <motion.div
          initial={animateUnlessReduced(reduced, { opacity: 0, height: 0 })}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: reduced ? 0 : 0.2 }}
          className="flex flex-col gap-1.5 overflow-hidden"
        >
          {attempts.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              {/* mini meter: threshold marker + roll marker */}
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="absolute top-0 h-full w-[2px]" style={{ left: `${a.thresholdFrac * 100}%`, background: "#00E676" }} aria-hidden />
                <span className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full" style={{ left: `calc(${a.rollFrac * 100}% - 4px)`, background: a.cracked ? "#FFD700" : "#FF2200" }} aria-hidden />
              </div>
              <span className="w-10 shrink-0 text-right font-mono text-[9px] tabular-nums text-dim">{a.roll.toFixed(3)}</span>
              <span className="w-16 shrink-0 text-right font-mono text-[9px] tabular-nums" style={{ color: a.cracked ? "#FFD700" : "#8892a4" }}>
                {a.cracked ? "CRACKED" : `${a.awayPct}% off`}
              </span>
            </div>
          ))}
          <span className="font-mono text-[8px] text-dim">Green line = crack threshold · marker = the provably-fair roll. Simulated history.</span>
        </motion.div>
      )}

      {/* siege button / shielded */}
      <motion.button
        type="button"
        onClick={() => { if (canRaid && !shielded) onSiege(vault.id); }}
        disabled={!canRaid || shielded}
        whileHover={canRaid && !shielded ? animateUnlessReduced(reduced, { scale: 1.03 }) : undefined}
        whileTap={canRaid && !shielded ? animateUnlessReduced(reduced, { scale: 0.96 }) : undefined}
        className="flex items-center justify-center gap-2 rounded-xl border border-blood/35 bg-blood/10 py-2.5 font-display text-xs font-bold uppercase tracking-[0.12em] text-blood transition-colors hover:bg-blood/20 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ willChange: "transform" }}
      >
        {shielded ? (
          <><Lock className="h-3.5 w-3.5" aria-hidden /> Shielded {Math.ceil(shieldLeft / 1000)}s</>
        ) : !canRaid ? (
          <><Lock className="h-3.5 w-3.5" aria-hidden /> {tierForAmount(vault.amount).label} — not your class</>
        ) : (
          <><Crosshair className="h-3.5 w-3.5" aria-hidden /> Siege this vault</>
        )}
      </motion.button>
    </motion.div>
  );
});
