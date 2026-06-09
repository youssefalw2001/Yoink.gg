import { motion } from "framer-motion";
import { Trophy, Crown } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/types";
import { formatSol, truncateAddress, cn } from "@/lib/utils";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
}

function rankColor(rank: number): string | undefined {
  if (rank === 1) return "#FFD700";
  if (rank === 2) return "#C0C0C0";
  if (rank === 3) return "#7000FF";
  return undefined;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export function Leaderboard({ entries }: LeaderboardProps) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10">
          <Trophy className="h-6 w-6 text-gold" aria-hidden />
        </span>
        <h1 className="font-display text-3xl font-black tracking-tight sm:text-4xl">
          <span className="gold-text-gradient">HALL OF KINGS</span>
        </h1>
        <p className="font-mono text-xs text-slate">
          Every king who held the bag to zero.
        </p>
      </div>

      <div className="premium-card overflow-hidden">
        {/* header row */}
        <div className="grid grid-cols-[44px_1fr_auto] gap-3 border-b border-white/[0.06] px-4 py-3 sm:grid-cols-[56px_1fr_120px_120px_100px] sm:px-6">
          {["#", "King", "Won", "Date", "Round"].map((h, i) => (
            <span
              key={h}
              className={cn(
                "font-mono text-[10px] uppercase tracking-[0.2em] text-slate",
                i === 2 && "text-right sm:text-left",
                (i === 3 || i === 4) && "hidden sm:block",
                i === 3 && "text-left",
                i === 4 && "text-right",
              )}
            >
              {h}
            </span>
          ))}
        </div>

        {/* rows */}
        <div>
          {entries.map((e, i) => {
            const color = rankColor(e.rank);
            return (
              <motion.div
                key={`${e.round}-${e.wallet}-${e.rank}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.35,
                  delay: Math.min(i * 0.04, 0.8),
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={cn(
                  "grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b border-white/[0.04] px-4 py-3.5 transition-colors duration-200 hover:bg-white/[0.03] sm:grid-cols-[56px_1fr_120px_120px_100px] sm:px-6",
                  e.isYou && "bg-gold/[0.06]",
                )}
              >
                {/* rank */}
                <span className="flex items-center">
                  {e.rank <= 3 ? (
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg border"
                      style={{
                        borderColor: `${color}55`,
                        background: `${color}1a`,
                      }}
                    >
                      <Crown className="h-3.5 w-3.5" style={{ color }} aria-hidden />
                    </span>
                  ) : (
                    <span className="font-mono text-sm text-dim">{e.rank}</span>
                  )}
                </span>

                {/* wallet */}
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="truncate font-mono text-sm font-bold"
                    style={{ color: color ?? "#eef1f6" }}
                  >
                    {e.isYou ? "You" : truncateAddress(e.wallet)}
                  </span>
                  {e.isYou && (
                    <span className="rounded-full border border-emerald/30 bg-emerald/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald">
                      you
                    </span>
                  )}
                </span>

                {/* won */}
                <span className="text-right font-mono text-sm font-bold tabular-nums text-gold sm:text-left">
                  {formatSol(e.solWon)}
                  <span className="ml-1 hidden text-[10px] text-gold/50 sm:inline">
                    SOL
                  </span>
                </span>

                {/* date */}
                <span className="hidden font-mono text-xs text-slate sm:block">
                  {formatDate(e.dateWon)}
                </span>

                {/* round */}
                <span className="hidden text-right font-mono text-xs text-slate sm:block">
                  #{e.round}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
