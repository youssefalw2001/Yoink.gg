import { memo } from "react";
import { motion } from "framer-motion";
import { Hash, Crown, Coins, Users, Landmark } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { usePrefersReducedMotion } from "@/components/walletwars/useReducedMotion";
import { formatSol } from "@/lib/utils";

interface StatsSidebarProps {
  roundNumber: number;
  biggestBag: number;
  totalDistributed: number;
  playerCount: number;
  /** Reign Toll — local player's tolls banked this round. */
  roundTollsBanked?: number;
  /** Reign Toll — local player's lifetime banked tolls (from localStorage). */
  lifetimeTolls?: number;
}

function StatRow({
  icon: Icon,
  label,
  value,
  accent,
  live,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
  accent?: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="flex items-center gap-2.5 text-xs text-slate">
        <Icon className="h-4 w-4 text-dim" aria-hidden />
        {label}
      </span>
      <span className="flex items-center gap-2">
        {live && <span className="blink-dot" aria-hidden />}
        <span
          className="font-mono text-sm font-bold tabular-nums"
          style={{ color: accent ?? "#eef1f6" }}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

/**
 * Reign Tolls row — shows this round's banked tolls and the lifetime total,
 * with the lifetime number animating upward (scale pop) whenever it grows.
 */
function ReignTollsRow({
  round,
  lifetime,
  animate,
}: {
  round: number;
  lifetime: number;
  animate: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="flex items-center gap-2.5 text-xs text-slate">
        <Landmark className="h-4 w-4 text-dim" aria-hidden />
        Reign Tolls
      </span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold tabular-nums text-gold">
          {formatSol(round, 3)}
        </span>
        <span className="font-mono text-[10px] text-dim">round</span>
        <span className="text-dim">·</span>
        {animate ? (
          <motion.span
            key={lifetime.toFixed(3)}
            initial={{ scale: 1.2, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 18 }}
            className="font-mono text-sm font-bold tabular-nums text-gold/80"
            style={{ willChange: "transform" }}
          >
            {formatSol(lifetime, 3)}
          </motion.span>
        ) : (
          <span className="font-mono text-sm font-bold tabular-nums text-gold/80">
            {formatSol(lifetime, 3)}
          </span>
        )}
        <span className="font-mono text-[10px] text-dim">lifetime</span>
      </span>
    </div>
  );
}

export const StatsSidebar = memo(function StatsSidebar({
  roundNumber,
  biggestBag,
  totalDistributed,
  playerCount,
  roundTollsBanked = 0,
  lifetimeTolls = 0,
}: StatsSidebarProps) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <SpotlightCard
        spotlightColor="rgba(255, 215, 0, 0.12)"
        radius={260}
        className="premium-card rounded-[24px]"
      >
        <div className="px-5 py-4">
          <h3 className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
            Round Telemetry
          </h3>
          <div className="divide-y divide-white/[0.05]">
            <StatRow
              icon={Hash}
              label="Current Round"
              value={`#${roundNumber.toLocaleString("en-US")}`}
            />
            <StatRow
              icon={Crown}
              label="Biggest Bag Won"
              value={`${formatSol(biggestBag)} SOL`}
              accent="#FFD700"
            />
            <StatRow
              icon={Coins}
              label="Total Distributed"
              value={`${formatSol(totalDistributed, 2)} SOL`}
              accent="#FFE566"
            />
            <StatRow
              icon={Users}
              label="Players Live"
              value={playerCount.toLocaleString("en-US")}
              accent="#00E676"
              live
            />
            <ReignTollsRow
              round={roundTollsBanked}
              lifetime={lifetimeTolls}
              animate={!reducedMotion}
            />
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
});
