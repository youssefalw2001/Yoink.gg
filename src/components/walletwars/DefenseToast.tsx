/**
 * DefenseToast — the Vault Lord's feedback beat.
 *
 * Replaces the never-mounted `FeeToast` in WalletWarsExtras, which only ever
 * showed "+N SOL BANKED / X failed to raid you" and could not express a
 * milestone, a near-miss, a crack, or reduced-motion preferences.
 *
 * ── THE RESTRAINT THAT MAKES THIS WORK ──────────────────────────────────────
 *
 * `WalletWarsScreen` carried a deliberate note: "No popup toast (kept calm)."
 * That instinct was right — the ambient tick attacks the player roughly every
 * 16 seconds, so a toast per survival would be a firehose that teaches the user
 * to ignore it. The fix for "no feedback" must not be "constant feedback".
 *
 * So this component is driven by `defenseMoment`'s classifier, not by every
 * event. Routine holds never reach it and stay exactly as calm as before —
 * silent numbers plus a feed row. Only close calls (throttled) and milestones
 * (always) surface here.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, Flame, TrendingUp } from "lucide-react";
import { formatSol, truncateAddress } from "@/lib/utils";
import {
  defenseHeadline,
  defenseMilestone,
  defenseNearMissCopy,
  defenseSignificance,
  shouldAnnounce,
  type DefenseEvent,
} from "@/lib/defenseMoment";
import { usePrefersReducedMotion } from "./useReducedMotion";
import { playTick, playLevelUp, playCooldownBlock } from "@/lib/sounds";

/** How long an announcement stays on screen. */
const HOLD_MS = 3_600;

/**
 * Watch `state.lastDefense` and surface only the events worth interrupting for.
 *
 * Owns the announcement cooldown (the policy itself lives in `defenseMoment` so
 * it stays pure and testable) and plays a sound matched to significance. All
 * sound functions already early-return under `prefers-reduced-motion`.
 */
export function useDefenseAnnouncer(lastDefense: DefenseEvent | null | undefined) {
  const [shown, setShown] = useState<DefenseEvent | null>(null);
  const lastAnnouncedAt = useRef(0);
  const seenId = useRef(0);

  useEffect(() => {
    if (!lastDefense || lastDefense.id === seenId.current) return;
    seenId.current = lastDefense.id;

    if (!shouldAnnounce(lastDefense, lastAnnouncedAt.current)) return;
    lastAnnouncedAt.current = lastDefense.ts;
    setShown(lastDefense);

    // Sound matched to weight: a crack is bad news, a milestone is a reward,
    // a close call is a heartbeat.
    const sig = defenseSignificance(lastDefense);
    if (lastDefense.outcome === "cracked") playCooldownBlock();
    else if (sig === "milestone") playLevelUp();
    else playTick(true);

    const id = window.setTimeout(() => setShown(null), HOLD_MS);
    return () => window.clearTimeout(id);
  }, [lastDefense]);

  return shown;
}

export function DefenseToast({ event }: { event: DefenseEvent | null }) {
  const reduced = usePrefersReducedMotion();
  const cracked = event?.outcome === "cracked";
  const milestone = event ? defenseMilestone(event) : null;
  const nearMiss = event ? defenseNearMissCopy(event) : null;

  // Blood for a crack, gold for a milestone, emerald for a plain hold.
  const accent = cracked ? "#FF2200" : milestone ? "#FFD700" : "#00E676";
  const Icon = cracked ? ShieldAlert : milestone ? TrendingUp : ShieldCheck;

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[95] w-[min(92vw,26rem)] -translate-x-1/2"
      /*
       * `PositionStatusBar` is also an aria-live="polite" region. Two anonymous
       * live regions compete for the same announcement queue, and a screen reader
       * gives no clue which is speaking — so this one is labelled. The testid
       * exists for the same reason: an unlabelled duplicate live region is
       * ambiguous to assistive tech AND to automation.
       */
      aria-live="polite"
      aria-label="Vault defence updates"
      data-testid="defense-toast"
    >
      <AnimatePresence>
        {event && (
          <motion.div
            key={event.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.92 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.95 }}
            transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 360, damping: 24 }}
            className="flex flex-col gap-1 rounded-2xl px-4 py-3"
            style={{
              background: `${accent}1f`,
              border: `1px solid ${accent}66`,
              backdropFilter: "blur(8px)",
              willChange: "transform",
            }}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} aria-hidden />
              <span
                className="font-display text-xs font-black uppercase tracking-[0.08em]"
                style={{ color: accent }}
              >
                {defenseHeadline(event)}
              </span>
              <span className="ml-auto font-mono text-sm font-black tabular-nums" style={{ color: accent }}>
                {cracked ? `-${formatSol(event.lost, 3)}` : `+${formatSol(event.toll, 3)}`}
              </span>
            </div>

            <span className="font-mono text-[10px] leading-relaxed text-slate">
              {cracked
                ? <>{truncateAddress(event.attacker, 4, 4)} cracked your vault · you kept the {formatSol(event.toll, 3)} SOL toll</>
                : <>{truncateAddress(event.attacker, 4, 4)} failed to crack you</>}
            </span>

            {/* The defender's half of the near-miss — same roll the raider saw. */}
            {nearMiss && (
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-[#FF9900]">
                <Flame className="h-3 w-3" aria-hidden /> {nearMiss}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
