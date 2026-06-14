/**
 * WalletWarsLeaderboard — season-scoped boards for the "Siege the Vault"
 * economy (Task 7.4 · Requirement 12). Wired live from engine state:
 *
 *   - FEES FARMED   → cumulative banked fees (the core "earner" board)
 *   - LONGEST VAULT → survival time + streak reached
 *   - BIGGEST VAULT → peak corpus (compounded)
 *   - BIGGEST HEIST → the largest single crack (raider hall of fame)
 *
 * Boards are SEASON-SCOPED: a weekly season index is persisted in localStorage
 * and auto-rolls at the Monday 00:00 UTC boundary; the biggest-heist high-water
 * mark is tracked per-season and a manual "reset season" affordance clears it.
 * Heat/odds are never involved here — this is pure recognition of fee farming
 * and survival. Framer Motion only; honours reduced motion.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Coins, Clock, TrendingUp, Crown, RotateCcw, Flame } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { type Vault, tierForAmount } from "@/lib/walletWarsState";
import { timeUntilSeasonReset } from "@/lib/seasonLeaderboard";
import { formatSol, truncateAddress } from "@/lib/utils";

type Board = "fees" | "longest" | "biggest" | "heist";

const SEASON_KEY = "yoink_ww_season_v1";

interface SeasonRecord {
  season: number;
  startedAt: number;
  /** Biggest single crack recorded this season (SOL). */
  heistHigh: number;
}

/** Whole weeks since the epoch — the season key (rolls at week boundaries). */
function weekIndex(now: number): number {
  return Math.floor(now / (7 * 24 * 60 * 60 * 1000));
}

function loadSeason(now: number): SeasonRecord {
  const fresh: SeasonRecord = { season: weekIndex(now), startedAt: now, heistHigh: 0 };
  try {
    const raw = localStorage.getItem(SEASON_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<SeasonRecord>;
    if (typeof parsed.season !== "number" || parsed.season !== weekIndex(now)) return fresh;
    return {
      season: parsed.season,
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : now,
      heistHigh: typeof parsed.heistHigh === "number" ? parsed.heistHigh : 0,
    };
  } catch {
    return fresh;
  }
}

function saveSeason(rec: SeasonRecord): void {
  try { localStorage.setItem(SEASON_KEY, JSON.stringify(rec)); } catch { /* ignore */ }
}

interface Row {
  id: string;
  wallet: string;
  isYou: boolean;
  value: number;
  sub: string;
}

interface WalletWarsLeaderboardProps {
  stashes: Vault[];
  you: Vault | null;
  biggestHeist: number;
  displayName?: string;
}

const TABS: { id: Board; label: string; icon: React.ElementType; color: string }[] = [
  { id: "fees", label: "Fees Farmed", icon: Coins, color: "#00E676" },
  { id: "longest", label: "Longest", icon: Clock, color: "#7000FF" },
  { id: "biggest", label: "Biggest Vault", icon: TrendingUp, color: "#FFD700" },
  { id: "heist", label: "Biggest Heist", icon: Flame, color: "#FF9900" },
];

export function WalletWarsLeaderboard({ stashes, you, biggestHeist, displayName = "" }: WalletWarsLeaderboardProps) {
  const [tab, setTab] = useState<Board>("fees");
  const [now, setNow] = useState(() => Date.now());
  const [season, setSeason] = useState<SeasonRecord>(() => loadSeason(Date.now()));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Auto-roll the season at the week boundary; track the per-season heist high.
  useEffect(() => {
    setSeason((prev) => {
      let next = prev;
      if (prev.season !== weekIndex(now)) {
        next = { season: weekIndex(now), startedAt: now, heistHigh: 0 };
      }
      if (biggestHeist > next.heistHigh) next = { ...next, heistHigh: biggestHeist };
      if (next !== prev) saveSeason(next);
      return next;
    });
  }, [now, biggestHeist]);

  const timer = timeUntilSeasonReset();
  const youName = displayName || "You";

  // Merge the player's own vault into the population for ranking.
  const population = useMemo<Vault[]>(
    () => (you ? [...stashes, you] : stashes),
    [stashes, you],
  );

  const rows = useMemo<Row[]>(() => {
    const name = (v: Vault) => (v.isYou ? youName : truncateAddress(v.wallet, 4, 4));
    if (tab === "fees") {
      return population
        .map((v) => ({ id: v.id, wallet: name(v), isYou: v.isYou, value: v.banked, sub: `${tierForAmount(v.amount).label}` }))
        .sort((a, b) => b.value - a.value).slice(0, 8);
    }
    if (tab === "longest") {
      return population
        .map((v) => ({ id: v.id, wallet: name(v), isYou: v.isYou, value: Math.max(0, now - v.openedAt), sub: `${v.streak} streak · ${v.survived} survived` }))
        .sort((a, b) => b.value - a.value).slice(0, 8);
    }
    // biggest vault
    return population
      .map((v) => ({ id: v.id, wallet: name(v), isYou: v.isYou, value: v.amount, sub: `${tierForAmount(v.amount).label}` }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [tab, population, now, youName]);

  function fmtValue(r: Row): string {
    if (tab === "longest") {
      const mins = Math.floor(r.value / 60000);
      const hrs = Math.floor(mins / 60);
      return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
    }
    return `${formatSol(r.value, tab === "fees" ? 3 : 2)} SOL`;
  }

  function resetSeason() {
    const rec: SeasonRecord = { season: weekIndex(Date.now()), startedAt: Date.now(), heistHigh: 0 };
    saveSeason(rec);
    setSeason(rec);
  }

  const seasonHeist = Math.max(season.heistHigh, biggestHeist);

  return (
    <SpotlightCard spotlightColor="rgba(255,215,0,0.1)" radius={300} className="premium-card rounded-[24px]">
      <div className="flex flex-col gap-4 px-5 py-4">
        {/* header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-gold" aria-hidden />
            <h2 className="font-display text-sm font-black text-white">War Boards</h2>
            <span className="rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-gold">
              Season {season.season % 1000}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 font-mono text-[10px] text-slate">
              <Clock className="h-3 w-3" aria-hidden /> {timer.days}d {timer.hours}h {timer.minutes}m
            </span>
            <button
              type="button"
              onClick={resetSeason}
              className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-dim transition-colors hover:text-white"
              aria-label="Reset season boards"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Reset
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="grid grid-cols-4 gap-1.5">
          {TABS.map(({ id, label, icon: Icon, color }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="relative flex flex-col items-center gap-1 rounded-xl px-2 py-2 transition-colors"
                style={{ background: active ? `${color}14` : "rgba(255,255,255,0.02)", border: `1px solid ${active ? `${color}44` : "rgba(255,255,255,0.05)"}` }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: active ? color : "#8892a4" }} aria-hidden />
                <span className="font-mono text-[8px] font-bold uppercase tracking-[0.06em]" style={{ color: active ? color : "#8892a4" }}>{label}</span>
              </button>
            );
          })}
        </div>

        {/* biggest-heist highlight */}
        {tab === "heist" ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl px-4 py-6 text-center" style={{ background: "rgba(255,153,0,0.06)", border: "1px solid rgba(255,153,0,0.18)" }}>
            <Flame className="h-7 w-7 text-[#FF9900]" aria-hidden />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-dim">Biggest single crack · this season</span>
            <span className="font-display text-4xl font-black tabular-nums" style={{ color: "#FF9900" }}>{formatSol(seasonHeist, 3)}</span>
            <span className="font-mono text-[10px] text-slate">All-time record: {formatSol(biggestHeist, 3)} SOL</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.length === 0 || rows.every((r) => r.value <= 0) ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-center font-mono text-[11px] text-slate">
                No vaults ranked yet — open one and start farming fees to climb.
              </div>
            ) : (
              rows.map((r, i) => (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2"
                  style={{
                    background: r.isYou ? "rgba(112,0,255,0.07)" : i === 0 ? "rgba(255,215,0,0.05)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${r.isYou ? "rgba(112,0,255,0.2)" : i === 0 ? "rgba(255,215,0,0.16)" : "transparent"}`,
                  }}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-black"
                    style={{ background: i === 0 ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.04)", color: i === 0 ? "#FFD700" : "#8892a4" }}>
                    {i === 0 ? <Crown className="h-3 w-3" aria-hidden /> : i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-mono text-xs font-bold" style={{ color: r.isYou ? "#7000FF" : "#eef1f6" }}>{r.wallet}</span>
                    <span className="truncate font-mono text-[9px] text-dim">{r.sub}</span>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-black tabular-nums text-white">{fmtValue(r)}</span>
                </motion.div>
              ))
            )}
          </div>
        )}
        <p className="text-center font-mono text-[10px] text-dim">Rewards fee farming + survival · resets weekly (Mon 00:00 UTC)</p>
      </div>
    </SpotlightCard>
  );
}
