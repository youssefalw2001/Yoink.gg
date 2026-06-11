import { motion } from "framer-motion";
import { Trophy, Crown, Share2, Zap } from "lucide-react";
import { useSpring, animated } from "@react-spring/web";
import type { LeaderboardEntry } from "@/lib/types";
import { formatSol, truncateAddress, cn } from "@/lib/utils";
import { HeroBanner, RankShareBanner } from "@/components/ui/Banners";
import { SeasonLeaderboard } from "./SeasonLeaderboard";
import { useWallet } from "@/lib/wallet";
import { useState } from "react";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  bagAmount?: number;
  playerCount?: number;
  roundNumber?: number;
}

function rankColor(rank: number): string | undefined {
  if (rank === 1) return "#FFD700";
  if (rank === 2) return "#C0C0C0";
  if (rank === 3) return "#7000FF";
  return undefined;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "2-digit", year: "numeric",
  });
}

/** Animated number that counts up when it first appears */
function AnimatedSol({ value }: { value: number }) {
  const { val } = useSpring({
    from: { val: 0 },
    to:   { val: value },
    config: { tension: 120, friction: 20, precision: 0.001 },
    delay: 200,
  });
  return (
    <animated.span>
      {val.to((v) => formatSol(v))}
    </animated.span>
  );
}

export function Leaderboard({
  entries,
  bagAmount = 12.5,
  playerCount = 247,
  roundNumber = 1847,
}: LeaderboardProps) {
  const [shareTarget, setShareTarget] = useState<LeaderboardEntry | null>(null);
  const [tab, setTab] = useState<"alltime" | "season">("alltime");
  const { publicKey } = useWallet();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">

      {/* Hero OG banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-2xl border border-white/[0.06]"
      >
        <HeroBanner
          bagAmount={bagAmount}
          playerCount={playerCount}
          roundNumber={roundNumber}
        />
      </motion.div>

      {/* Header */}
      <div className="flex flex-col items-center gap-2 text-center">
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

      {/* Rank share card — shown when user clicks share */}
      {shareTarget && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
          className="overflow-hidden rounded-2xl border border-white/[0.06]"
        >
          <RankShareBanner
            level={shareTarget.rank <= 3 ? shareTarget.rank : 4}
            wallet={shareTarget.isYou ? "You" : shareTarget.wallet}
            totalYoinks={shareTarget.rank * 7}
            totalSolWon={shareTarget.solWon}
          />
          <div className="flex justify-end gap-2 border-t border-white/[0.06] bg-white/[0.02] px-4 py-2">
            <button
              type="button"
              onClick={() => setShareTarget(null)}
              className="font-mono text-xs text-dim hover:text-white transition-colors"
            >
              close
            </button>
          </div>
        </motion.div>
      )}

      {/* Tab switcher — All Time vs Season */}
      <div
        className="flex gap-2 rounded-2xl p-1.5"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        {([
          { id: "alltime" as const, label: "Hall of Kings", icon: <Trophy className="h-3.5 w-3.5" aria-hidden /> },
          { id: "season" as const, label: "Weekly Season", icon: <Zap className="h-3.5 w-3.5" aria-hidden /> },
        ] as const).map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className="relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.1em] transition-colors duration-200"
            style={{ color: tab === id ? "#FFD700" : "#8892a4" }}
          >
            {tab === id && (
              <motion.span
                layoutId="lb-tab-bg"
                className="absolute inset-0 rounded-xl"
                style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.2)" }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10">{icon}</span>
            <span className="relative z-10">{label}</span>
          </button>
        ))}
      </div>

      {/* Season Leaderboard */}
      {tab === "season" && <SeasonLeaderboard playerWallet={publicKey} />}

      {/* All-time table */}
      {tab === "alltime" && (
      <div className="premium-card overflow-hidden">
        {/* header row */}
        <div className="grid grid-cols-[44px_1fr_auto] gap-3 border-b border-white/[0.06] px-4 py-3 sm:grid-cols-[56px_1fr_120px_120px_100px_40px] sm:px-6">
          {["#", "King", "Won", "Date", "Round", ""].map((h, i) => (
            <span
              key={h + i}
              className={cn(
                "font-mono text-[10px] uppercase tracking-[0.2em] text-slate",
                i === 2 && "text-right sm:text-left",
                (i === 3 || i === 4) && "hidden sm:block",
                i === 5 && "hidden sm:block",
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
                  "grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b border-white/[0.04] px-4 py-3.5 transition-colors duration-200 hover:bg-white/[0.03] sm:grid-cols-[56px_1fr_120px_120px_100px_40px] sm:px-6",
                  e.isYou && "bg-gold/[0.06]",
                )}
              >
                {/* rank */}
                <span className="flex items-center">
                  {e.rank <= 3 ? (
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg border"
                      style={{ borderColor: `${color}55`, background: `${color}1a` }}
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

                {/* won — animated count-up */}
                <span className="text-right font-mono text-sm font-bold tabular-nums text-gold sm:text-left">
                  <AnimatedSol value={e.solWon} />
                  <span className="ml-1 hidden text-[10px] text-gold/50 sm:inline">SOL</span>
                </span>

                {/* date */}
                <span className="hidden font-mono text-xs text-slate sm:block">
                  {formatDate(e.dateWon)}
                </span>

                {/* round */}
                <span className="hidden text-right font-mono text-xs text-slate sm:block">
                  #{e.round}
                </span>

                {/* share button */}
                <span className="hidden sm:flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setShareTarget(e)}
                    className="text-dim hover:text-gold transition-colors duration-200 p-1 rounded"
                    aria-label={`Share ${e.isYou ? "your" : "this"} result`}
                  >
                    <Share2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
      )} {/* end alltime tab */}
    </div>
  );
}
