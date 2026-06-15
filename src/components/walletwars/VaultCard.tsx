/**
 * VaultCard — a siegeable target on the Wallet Wars board (was `StashCard`).
 *
 * "Siege the Vault" economy surfacing:
 *   - HEAT badge (HOT / ON FIRE) driven by `siegeMath.heatScore` — fat,
 *     long-surviving vaults visually pop so raiders chase them.
 *   - A live SHIELD countdown (a freshly-sieged vault can't be re-cracked).
 *   - The PUBLISHED per-tier crack odds `p` (fixed within a tier, verifiable)
 *     and the prize slice a raider could crack (~10× the cheap attempt fee).
 *
 * Heat is visibility only — it NEVER changes the win chance (odds stay the
 * published per-tier value). Animation is Framer Motion + transform/opacity and
 * respects prefers-reduced-motion via the shared `usePrefersReducedMotion` hook.
 */

import { memo, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crosshair, Coins, Lock, Target, Flame, Trophy, Percent, ChevronDown } from "lucide-react";
import { type Vault, tierForAmount } from "@/lib/walletWarsState";
import { heatScore, STREAK_CFG } from "@/lib/siegeMath";
import { formatSol, truncateAddress } from "@/lib/utils";
import { PurgeAvatar } from "./PurgeAvatar";
import { usePrefersReducedMotion } from "./useReducedMotion";
import { vaultEconomics, animateUnlessReduced } from "./riskProfilePresentation";

interface VaultCardProps {
  vault: Vault;
  canRaid: boolean;
  onRaid: (id: string) => void;
}

type Heat = "cold" | "warm" | "hot" | "onfire";

/** Map a raw heat score + streak into a display band. Visibility only. */
function heatBand(score: number, streak: number): Heat {
  if (score >= 0.82 || streak >= STREAK_CFG.cap * 0.8) return "onfire";
  if (score >= 0.55 || streak >= STREAK_CFG.cap * 0.4) return "hot";
  if (score >= 0.34) return "warm";
  return "cold";
}

export const VaultCard = memo(function VaultCard({ vault, canRaid, onRaid }: VaultCardProps) {
  const reduced = usePrefersReducedMotion();
  const [expanded, setExpanded] = useState(false);

  // Live clock so the shield countdown + heat freshness stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const shieldLeft = Math.max(0, vault.shieldUntil - now);
  const shielded = shieldLeft > 0;

  // Siege economics from the vault's OWN published risk-profile params.
  const econ = vaultEconomics(vault);
  const oddsPct = econ.crackPct.replace("%", "");

  const heat = heatBand(heatScore(vault, now), vault.streak);
  const hot = heat === "hot" || heat === "onfire";
  const onFire = heat === "onfire";

  const accent = onFire ? "#FF2200" : hot ? "#FF9900" : vault.amount >= 5 ? "#FFD700" : "#7000FF";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="premium-card relative flex flex-col gap-3 overflow-hidden rounded-[20px] px-4 py-3.5"
      style={{
        border: `1px solid ${hot ? `${accent}55` : "rgba(255,255,255,0.06)"}`,
        boxShadow: onFire
          ? `0 0 28px ${accent}33, inset 0 0 22px ${accent}12`
          : hot
            ? `0 0 20px ${accent}22`
            : vault.amount >= 5
              ? "0 0 24px rgba(255,215,0,0.12), inset 0 0 20px rgba(255,215,0,0.04)"
              : undefined,
      }}
    >
      {/* "On fire" ember sweep — pure transform/opacity, skipped when reduced. */}
      {onFire && !reduced && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-full"
          style={{ background: `linear-gradient(120deg, transparent 40%, ${accent}14 50%, transparent 60%)` }}
          animate={{ x: ["-120%", "120%"] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* header: avatar + wallet + profile badge (+ heat) */}
      <div className="relative flex items-center gap-2.5">
        <PurgeAvatar seed={vault.wallet} size={40} pulse={onFire} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono text-xs font-bold text-white">
            {truncateAddress(vault.wallet, 4, 4)}
          </span>
          <span className="font-mono text-[10px] text-dim">{tierForAmount(vault.amount).label}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {/* profile badge — FORTIFIED / STANDARD / EXPOSED */}
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.1em]"
            style={{ background: `${econ.accent}1f`, border: `1px solid ${econ.accent}66`, color: econ.accent }}
          >
            {econ.badge}
          </span>
          {hot && (
            <motion.span
              className="rounded-full px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.1em]"
              style={{ background: `${accent}1f`, border: `1px solid ${accent}55`, color: accent }}
              animate={animateUnlessReduced(reduced, onFire ? { scale: [1, 1.08, 1] } : { scale: 1 })}
              transition={{ duration: 1.1, repeat: Infinity }}
            >
              <span className="inline-flex items-center gap-1">
                <Flame className="h-2.5 w-2.5" aria-hidden />
                {onFire ? "On Fire" : "Hot"}
              </span>
            </motion.span>
          )}
        </div>
      </div>

      {vault.bountyPool > 0 && (
        <div className="relative flex items-center gap-1.5 rounded-lg border border-gold/25 bg-gold/[0.07] px-2.5 py-1.5">
          <Target className="h-3 w-3 shrink-0 text-gold" aria-hidden />
          <span className="font-mono text-[10px] text-gold">
            <span className="font-bold">{formatSol(vault.bountyPool, 2)} SOL</span> bounty — crack them, take it
          </span>
        </div>
      )}

      {/* corpus (the vault) + its own crack odds */}
      <div className="relative flex items-end justify-between">
        <div className="flex flex-col">
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim">Vault</span>
          <span className="font-display text-2xl font-black tabular-nums" style={{ color: accent }}>
            {formatSol(vault.amount, 2)}
            <span className="ml-1 text-xs text-slate">SOL</span>
          </span>
        </div>
        <span className="flex items-center gap-1 font-mono text-[11px] font-bold text-phantom">
          <Percent className="h-3 w-3" aria-hidden />
          {oddsPct}% crack odds
        </span>
      </div>

      {/* value proposition: fee you risk → slice you win */}
      <div className="relative grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(255,34,0,0.06)", border: "1px solid rgba(255,34,0,0.14)" }}>
          <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-dim">Fee (all you risk)</span>
          <span className="font-mono text-sm font-black tabular-nums text-blood">{formatSol(econ.feeRisked, 3)}</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(255,153,0,0.06)", border: "1px solid rgba(255,153,0,0.14)" }}>
          <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-dim">Slice you win</span>
          <span className="flex items-center gap-1 font-mono text-sm font-black tabular-nums text-[#FF9900]">
            <Trophy className="h-3 w-3" aria-hidden />{formatSol(econ.sliceWon, 2)}
          </span>
        </div>
      </div>

      {/* secondary fields — banked (with accumulation shimmer), streak, survived/cracked */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="relative flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
      >
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald">
          <Coins className="h-3 w-3" aria-hidden />
          <motion.span
            className="tabular-nums"
            animate={animateUnlessReduced(reduced, vault.banked > 0 ? { opacity: [0.55, 1, 0.55] } : { opacity: 1 })}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            style={{ willChange: "opacity" }}
          >
            {formatSol(vault.banked, 3)} banked
          </motion.span>
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 text-dim transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : undefined }}
          aria-hidden
        />
      </button>
      {expanded && (
        <motion.div
          initial={animateUnlessReduced(reduced, { opacity: 0, height: 0 })}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: reduced ? 0 : 0.2 }}
          className="relative grid grid-cols-3 gap-2 overflow-hidden font-mono text-[10px]"
        >
          <div className="flex flex-col items-center gap-0.5 rounded-lg bg-white/[0.03] py-1.5">
            <span className="font-black tabular-nums text-emerald">{vault.streak}</span>
            <span className="text-[8px] uppercase tracking-[0.1em] text-dim">streak</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 rounded-lg bg-white/[0.03] py-1.5">
            <span className="font-black tabular-nums text-white">{vault.survived}</span>
            <span className="text-[8px] uppercase tracking-[0.1em] text-dim">survived</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 rounded-lg bg-white/[0.03] py-1.5">
            <span className="font-black tabular-nums text-blood">{vault.cracked}</span>
            <span className="text-[8px] uppercase tracking-[0.1em] text-dim">cracked</span>
          </div>
        </motion.div>
      )}

      {/* siege button */}
      <motion.button
        type="button"
        onClick={() => onRaid(vault.id)}
        disabled={!canRaid || shielded}
        whileHover={canRaid && !shielded ? { scale: 1.03 } : undefined}
        whileTap={canRaid && !shielded ? { scale: 0.96 } : undefined}
        transition={{ duration: 0.14 }}
        className="relative flex items-center justify-center gap-2 rounded-xl border border-blood/35 bg-blood/10 py-2.5 font-display text-xs font-bold uppercase tracking-[0.12em] text-blood transition-colors hover:bg-blood/20 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ willChange: "transform" }}
      >
        {shielded ? (
          <>
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Shielded {(shieldLeft / 1000).toFixed(0)}s
          </>
        ) : !canRaid ? (
          <>
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {tierForAmount(vault.amount).label} — not your class
          </>
        ) : (
          <>
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
            Siege this vault
          </>
        )}
      </motion.button>
    </motion.div>
  );
});
