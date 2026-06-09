/**
 * RankBadge — shows the player's current rank with icon + name.
 * Sizes: sm (chip only) | md (default) | lg (with art panel)
 *
 * lg size shows the full RankArt illustration above the badge.
 */
import { Crown, Shield, Swords, Star, Flame, Skull, Gem, Zap, Award, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { RANKS, type Rank } from "@/lib/progression";
import { RankArt } from "./RankArt";
import { cn } from "@/lib/utils";

const RANK_ICONS = [Skull, Shield, Swords, Flame, Zap, Star, Award, Gem, TrendingUp, Crown];

interface RankBadgeProps {
  level: number;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  /** lg only: show the full SVG illustration above the badge */
  showArt?: boolean;
  className?: string;
  animate?: boolean;
}

export function RankBadge({
  level,
  size = "md",
  showName = true,
  showArt = false,
  className,
  animate = false,
}: RankBadgeProps) {
  const rank: Rank = RANKS[Math.min(level - 1, RANKS.length - 1)] ?? RANKS[0];
  const Icon = RANK_ICONS[Math.min(level - 1, RANK_ICONS.length - 1)];

  const sizeMap = {
    sm: { icon: "h-3 w-3",   text: "text-[10px]", pad: "px-1.5 py-0.5", gap: "gap-1"   },
    md: { icon: "h-4 w-4",   text: "text-xs",     pad: "px-2.5 py-1",   gap: "gap-1.5" },
    lg: { icon: "h-5 w-5",   text: "text-sm",     pad: "px-3 py-1.5",   gap: "gap-2"   },
  }[size];

  const badge = (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {/* SVG rank illustration — shown in lg + showArt mode */}
      {showArt && size === "lg" && (
        <div
          className="rounded-2xl border p-1"
          style={{ borderColor: `${rank.color}33`, background: `${rank.color}0d` }}
        >
          <RankArt level={level} size={80} />
        </div>
      )}

      <span
        className={cn(
          "inline-flex items-center rounded-full border font-mono font-bold uppercase tracking-wider",
          sizeMap.pad, sizeMap.gap, sizeMap.text,
        )}
        style={{
          color: rank.color,
          borderColor: `${rank.color}44`,
          background: `${rank.color}18`,
        }}
      >
        <Icon className={sizeMap.icon} aria-hidden />
        {showName && <span>{rank.name}</span>}
        {showName && (
          <span style={{ color: `${rank.color}80` }}>·{level}</span>
        )}
      </span>
    </div>
  );

  if (!animate) return badge;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
    >
      {badge}
    </motion.div>
  );
}
