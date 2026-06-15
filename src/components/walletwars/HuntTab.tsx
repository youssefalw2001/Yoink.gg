/**
 * HuntTab — the SIEGE RUNNER bounty board ("crack the vault").
 *
 * Everything here helps a Siege Runner find and crack the right vault:
 *
 *   1. OPPORTUNITY HEADER — your Runner level (1→5 progress bar) + lifetime
 *                           stats (attempts, cracks, SOL won, win rate).
 *   2. TIER FILTER        — All / Pit / Grind / Arena / Court pills with live
 *                           active-vault counts. Defaults to All.
 *   3. OPPORTUNITY CARDS  — ranked by a value score (odds, upside, bounty, idle,
 *                           streak), each expandable to near-miss history.
 *   4. PROGRESSION LADDER — levels 1→5 with exact XP until the next unlock.
 *
 * Ranking is visibility only — it never touches the frozen odds/EV. Framer
 * Motion + transform/opacity only; reduced-motion aware; lucide icons only.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Crosshair, Trophy, TrendingUp, Coins, Swords, Check, Bell, Zap, History, Users, Vault as VaultIcon, ChevronRight,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import {
  type Vault, TIERS, tierIndexForAmount, WAR_CONFIG,
} from "@/lib/walletWarsState";
import {
  type RunnerStats, runnerLevel, runnerWinRate, RUNNER_LEVELS,
} from "@/lib/walletWarsRole";
import {
  opportunityScore, lastActivityFromShield, idleMsFor,
} from "@/lib/walletWarsActivity";
import { vaultEconomics } from "./riskProfilePresentation";
import { formatSol } from "@/lib/utils";
import { OpportunityCard } from "./OpportunityCard";
import { usePrefersReducedMotion } from "./useReducedMotion";

const LADDER_ICONS = [Crosshair, Bell, Zap, History, Users] as const;

interface HuntTabProps {
  you: Vault | null;
  stashes: Vault[];
  runnerStats: RunnerStats;
  canRaid: (s: Vault) => boolean;
  onSiege: (id: string) => void;
  /** Switch to the BUILD tab to open a vault (a siege fee is paid from your corpus). */
  onOpenVaultCta: () => void;
  /** Optional id to scroll/flash as the highlighted "best" target after onboarding. */
  highlightId?: string | null;
}

/** -1 = All, 0..3 = a tier index. */
type TierFilter = -1 | 0 | 1 | 2 | 3;

export function HuntTab({ you, stashes, runnerStats, canRaid, onSiege, onOpenVaultCta, highlightId }: HuntTabProps) {
  const reduced = usePrefersReducedMotion();
  const [filter, setFilter] = useState<TierFilter>(-1);

  // One shared clock for all cards (idle + shield countdowns).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const level = runnerLevel(runnerStats);
  const winRate = runnerWinRate(runnerStats);

  // Filter → rank by value score (hottest opportunity first).
  const ranked = useMemo(() => {
    const pool = stashes.filter((s) => !s.isYou && (filter === -1 || tierIndexForAmount(s.amount) === filter));
    return pool
      .map((s) => {
        const econ = vaultEconomics(s);
        const idleMs = idleMsFor(lastActivityFromShield(s.shieldUntil, s.openedAt, WAR_CONFIG.SHIELD_MS), now);
        const score = opportunityScore({
          crackChance: econ.crackChance,
          sliceWon: econ.sliceWon,
          feeRisked: econ.feeRisked,
          sizeSol: s.amount,
          bountyPool: s.bountyPool ?? 0,
          streak: s.streak,
          idleMs,
          shielded: now < s.shieldUntil,
        });
        return { vault: s, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [stashes, filter, now]);

  return (
    <div className="flex flex-col gap-5">
      {/* 1 — opportunity header */}
      <SpotlightCard spotlightColor="rgba(255,34,0,0.12)" radius={280} className="premium-card rounded-[24px]">
        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crosshair className="h-4 w-4 text-blood" aria-hidden />
              <h3 className="font-display text-sm font-black uppercase tracking-[0.08em] text-white">Siege Runner</h3>
            </div>
            <span className="rounded-full border border-blood/30 bg-blood/10 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-blood">
              Lv {level.level} · {level.spec.title}
            </span>
          </div>

          {/* level progress bar 1 → 5 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1">
              {RUNNER_LEVELS.map((rung) => {
                const reached = level.level > rung.level;
                const current = level.level === rung.level;
                return (
                  <div key={rung.level} className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(90deg,#FF2200,#FF9900)" }}
                      initial={false}
                      animate={{ width: reached ? "100%" : current ? `${level.pctToNext * 100}%` : "0%" }}
                      transition={{ duration: reduced ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                );
              })}
            </div>
            <span className="font-mono text-[10px] text-dim">
              {level.isMax
                ? "Max level — Warlord. Syndicate access unlocked."
                : `${level.xpToNext} XP to Lv ${level.next?.level} · ${level.next?.title}`}
            </span>
          </div>

          {/* stats */}
          <div className="grid grid-cols-4 gap-2">
            <RunnerStat icon={<Swords className="h-3.5 w-3.5 text-slate" aria-hidden />} label="Sieges" value={`${runnerStats.attempts}`} color="#eef1f6" />
            <RunnerStat icon={<Trophy className="h-3.5 w-3.5 text-gold" aria-hidden />} label="Cracked" value={`${runnerStats.cracks}`} color="#FFD700" />
            <RunnerStat icon={<Coins className="h-3.5 w-3.5 text-emerald" aria-hidden />} label="SOL won" value={formatSol(runnerStats.solWon, 2)} color="#00E676" />
            <RunnerStat icon={<TrendingUp className="h-3.5 w-3.5 text-blood" aria-hidden />} label="Win rate" value={`${(winRate * 100).toFixed(0)}%`} color="#FF2200" />
          </div>
        </div>
      </SpotlightCard>

      {/* fund-your-sieges prompt — a siege fee is paid from your own corpus */}
      {!you && (
        <button
          type="button"
          onClick={onOpenVaultCta}
          className="flex items-center gap-3 rounded-2xl border border-gold/25 bg-gold/[0.06] px-4 py-3 text-left transition-colors hover:bg-gold/[0.1]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/10">
            <VaultIcon className="h-4 w-4 text-gold" aria-hidden />
          </span>
          <div className="flex flex-1 flex-col">
            <span className="font-display text-xs font-black uppercase tracking-[0.08em] text-gold">Fund your sieges</span>
            <span className="font-mono text-[10px] leading-relaxed text-slate">
              Open a vault in BUILD — your corpus pays the small siege fee and sets the weight class you can hunt.
            </span>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-gold" aria-hidden />
        </button>
      )}

      {/* 2 — tier filter */}
      <div className="flex flex-wrap gap-2">
        <FilterPill label="All" count={stashes.filter((s) => !s.isYou).length} active={filter === -1} onClick={() => setFilter(-1)} accent="#FFD700" />
        {TIERS.map((t, i) => (
          <FilterPill
            key={t.id}
            label={t.label.replace("The ", "").replace("King's ", "")}
            count={stashes.filter((s) => !s.isYou && tierIndexForAmount(s.amount) === i).length}
            active={filter === i}
            onClick={() => setFilter(i as TierFilter)}
            accent={t.accent}
          />
        ))}
      </div>

      {/* 3 — opportunity cards */}
      {ranked.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center font-mono text-[11px] text-slate">
          No targets in this filter right now — switch tiers or check back as new vaults open.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ranked.map(({ vault }) => (
            <div
              key={vault.id}
              style={highlightId === vault.id ? { outline: "2px solid rgba(255,34,0,0.5)", outlineOffset: 2, borderRadius: 20 } : undefined}
            >
              <OpportunityCard vault={vault} canRaid={canRaid(vault)} onSiege={onSiege} now={now} />
            </div>
          ))}
        </div>
      )}

      {/* 4 — progression ladder */}
      <SpotlightCard spotlightColor="rgba(255,153,0,0.1)" radius={300} className="premium-card rounded-[24px]">
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#FF9900]" aria-hidden />
            <h2 className="font-display text-sm font-black text-white">Runner ladder</h2>
            {!level.isMax && (
              <span className="ml-auto font-mono text-[10px] text-dim">{level.xpToNext} XP to next unlock</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {RUNNER_LEVELS.map((rung, i) => {
              const Icon = LADDER_ICONS[i] ?? Crosshair;
              const reached = level.level >= rung.level;
              const current = level.level === rung.level;
              const isNext = level.next?.level === rung.level;
              return (
                <div
                  key={rung.level}
                  className="flex items-center gap-3 rounded-xl px-3 py-2"
                  style={{
                    background: current ? "rgba(255,153,0,0.08)" : reached ? "rgba(0,230,118,0.04)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${current ? "rgba(255,153,0,0.3)" : reached ? "rgba(0,230,118,0.14)" : "rgba(255,255,255,0.05)"}`,
                  }}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: reached ? "rgba(0,230,118,0.12)" : "rgba(255,255,255,0.04)", color: current ? "#FF9900" : reached ? "#00E676" : "#8892a4" }}
                  >
                    {reached && !current ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Icon className="h-3.5 w-3.5" aria-hidden />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-display text-xs font-bold uppercase tracking-[0.08em]" style={{ color: current ? "#FF9900" : reached ? "#eef1f6" : "#8892a4" }}>
                      Lv {rung.level} · {rung.title}
                    </span>
                    <span className="truncate font-mono text-[10px] text-dim">{rung.unlock}</span>
                  </div>
                  {isNext && (
                    <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-[#FF9900]">+{level.xpToNext} XP</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </SpotlightCard>
    </div>
  );
}

function RunnerStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.03] py-2">
      {icon}
      <span className="font-mono text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
      <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-dim">{label}</span>
    </div>
  );
}

function FilterPill({ label, count, active, onClick, accent }: { label: string; count: number; active: boolean; onClick: () => void; accent: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] transition-colors"
      style={{
        background: active ? `${accent}1f` : "rgba(255,255,255,0.02)",
        borderColor: active ? `${accent}88` : "rgba(255,255,255,0.08)",
        color: active ? accent : "#8892a4",
      }}
    >
      {label}
      <span className="rounded-full px-1.5 py-0.5 font-mono text-[9px] tabular-nums" style={{ background: active ? `${accent}22` : "rgba(255,255,255,0.05)", color: active ? accent : "#8892a4" }}>
        {count}
      </span>
    </button>
  );
}
