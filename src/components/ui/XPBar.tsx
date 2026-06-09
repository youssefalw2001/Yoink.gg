/**
 * XPBar — animated XP progress bar with rank info.
 * Shows current rank, XP progress within level, and XP to next rank.
 */
import { motion, AnimatePresence } from "framer-motion";
import { RANKS } from "@/lib/progression";
import type { PlayerProgress } from "@/lib/progression";
import { RankBadge } from "./RankBadge";
import { cn } from "@/lib/utils";

interface XPBarProps {
  progress: PlayerProgress;
  compact?: boolean;
  className?: string;
}

export function XPBar({ progress, compact = false, className }: XPBarProps) {
  const rank  = RANKS[Math.min(progress.level - 1, RANKS.length - 1)];
  const next  = RANKS.find((r) => r.level === progress.level + 1);
  const maxed = !next;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {!compact && (
        <div className="flex items-center justify-between">
          <RankBadge level={progress.level} size="sm" />
          <span className="font-mono text-[10px] text-slate">
            {maxed ? "MAX RANK" : `${progress.xpToNext.toLocaleString()} XP to ${next?.name}`}
          </span>
        </div>
      )}

      {/* Track */}
      <div
        className="relative h-2 w-full overflow-hidden rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
        role="progressbar"
        aria-valuenow={Math.round(progress.progressPct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${rank.name} — ${Math.round(progress.progressPct * 100)}% to next rank`}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: progress.progressPct }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          style={{
            transformOrigin: "left center",
            width: "100%",
            background: maxed
              ? `linear-gradient(90deg, ${rank.color}, #FFD700)`
              : `linear-gradient(90deg, ${rank.color}99, ${rank.color})`,
            willChange: "transform",
          }}
        />
        {/* Glow pulse on the fill edge */}
        {!maxed && (
          <motion.div
            className="absolute inset-y-0 w-4 rounded-full"
            style={{
              left: `calc(${progress.progressPct * 100}% - 8px)`,
              background: rank.color,
              opacity: 0.6,
              willChange: "opacity",
            }}
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>

      {!compact && (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-dim">
            {progress.xp.toLocaleString()} XP total
          </span>
          {rank.discount > 0 && (
            <span className="font-mono text-[10px]" style={{ color: rank.color }}>
              −{(rank.discount * 1000).toFixed(0)}m SOL / YOINK
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Level-Up Toast ───────────────────────────────────────────────────────────

import type { LevelUpEvent } from "@/hooks/usePlayerProgress";
import { RankMorph } from "./RankMorph";

interface LevelUpToastProps {
  events: LevelUpEvent[];
}

export function LevelUpToast({ events }: LevelUpToastProps) {
  return (
    <div
      className="pointer-events-none fixed right-4 top-20 z-[90] flex flex-col gap-3"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {events.map((ev) => {
          const rank = RANKS[Math.min(ev.newLevel - 1, RANKS.length - 1)];
          return (
            <motion.div
              key={ev.id}
              layout
              initial={{ opacity: 0, x: 80, scale: 0.85 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="premium-card flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl"
              style={{ borderColor: `${rank.color}44`, maxWidth: 280 }}
            >
              {/* shimmer border glow */}
              <div
                className="absolute inset-0 rounded-[inherit] opacity-30"
                style={{
                  background: `radial-gradient(circle at 0% 50%, ${rank.color}66, transparent 60%)`,
                  pointerEvents: "none",
                }}
                aria-hidden
              />
              <div
                className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden"
                style={{ background: `${rank.color}22`, border: `1px solid ${rank.color}44` }}
              >
                {/* Anime.js morphTo animates the rank shape on level-up */}
                <RankMorph
                  fromLevel={ev.oldLevel}
                  toLevel={ev.newLevel}
                  size={36}
                />
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate">
                  Level Up!
                </span>
                <span className="font-display text-sm font-bold" style={{ color: rank.color }}>
                  {rank.name}
                </span>
                <span className="font-mono text-[10px] text-dim">{rank.perk}</span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ─── Compact stats strip (for header) ────────────────────────────────────────

interface ProgressStripProps {
  progress: PlayerProgress;
}

export function ProgressStrip({ progress }: ProgressStripProps) {
  const rank = RANKS[Math.min(progress.level - 1, RANKS.length - 1)];
  return (
    <div className="flex items-center gap-2">
      <RankBadge level={progress.level} size="sm" showName={false} />
      <div className="hidden w-24 sm:block">
        <XPBar progress={progress} compact />
      </div>
      <span
        className="hidden font-mono text-[11px] font-bold sm:inline"
        style={{ color: rank.color }}
      >
        {rank.name}
      </span>
    </div>
  );
}
