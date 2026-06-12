import { memo } from "react";
import { motion } from "framer-motion";
import { Hash, Crown, Coins, Users } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { formatSol } from "@/lib/utils";

interface StatsSidebarProps {
  roundNumber: number;
  biggestBag: number;
  totalDistributed: number;
  playerCount: number;
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

export const StatsSidebar = memo(function StatsSidebar({
  roundNumber,
  biggestBag,
  totalDistributed,
  playerCount,
}: StatsSidebarProps) {
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
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
});
