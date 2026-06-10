/**
 * YOINK.GG — Danger Ring (Hidden Fuse)
 *
 * The Hidden Fuse mechanic means the exact countdown is NEVER shown to players.
 * Instead, this ring shows psychological tension:
 *   - The arc depletes as time passes (from full → empty)
 *   - The colour shifts from Phantom (calm) → Gold (building) → Blood (danger)
 *   - The pulse speed increases as the round progresses
 *   - "?" where the number used to be — nobody knows when it ends
 *
 * The internal countdown prop is used ONLY to drive the visual.
 * The fuseSeconds prop tells us what 100% looks like.
 *
 * On round start: full arc, slow pulse, phantom colour.
 * At 50% elapsed: half arc, medium pulse, gold.
 * At 80%+ elapsed: small arc, fast pulse, blood red.
 *
 * This is the core psychological innovation:
 *   Everyone acts on instinct, not math.
 *   Bots can't time the final second because there is no visible final second.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";

interface DangerRingProps {
  /** Internal countdown — NOT shown to users */
  countdown: number;
  /** The total fuse seconds for this round */
  fuseSeconds: number;
  children?: React.ReactNode;
  /** Compact size for mobile */
  compact?: boolean;
}

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

function ringColor(elapsed: number): string {
  const phantom = [112, 0, 255];
  const gold    = [255, 215, 0];
  const blood   = [255, 34, 0];
  let c: number[];
  if (elapsed < 0.4) {
    // Phantom → Gold
    const t = elapsed / 0.4;
    c = phantom.map((p, i) => lerp(p, gold[i], t));
  } else {
    // Gold → Blood
    const t = (elapsed - 0.4) / 0.6;
    c = gold.map((g, i) => lerp(g, blood[i], t));
  }
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

const SIZE   = 320;
const STROKE = 10;
const R      = (SIZE - STROKE) / 2;
const CIRC   = 2 * Math.PI * R;

// ── Danger Ring ───────────────────────────────────────────────────────────────
export function CountdownRing({ countdown, fuseSeconds, children, compact }: DangerRingProps) {
  // Elapsed fraction: 0 = round just started, 1 = about to end
  // We clamp to avoid negative values from floating point
  const elapsed = Math.max(0, Math.min(1, 1 - countdown / Math.max(fuseSeconds, 1)));
  const color   = useMemo(() => ringColor(elapsed), [elapsed]);

  // Arc shows how much time is LEFT (full arc = just started)
  const frac  = 1 - elapsed;
  const offset = CIRC * elapsed;

  // Pulse gets faster as elapsed increases
  // 0-40%: slow (2.4s), 40-70%: medium (1.2s), 70-100%: fast (0.5s)
  const pulseDuration =
    elapsed < 0.4 ? 2.4 :
    elapsed < 0.7 ? 1.2 :
    0.5;

  // Danger phase — visually intense
  const dangerPhase = elapsed > 0.7;

  // Label shows ambiguous urgency not time
  const dangerLabel =
    elapsed < 0.25 ? "holding" :
    elapsed < 0.5  ? "building" :
    elapsed < 0.75 ? "getting hot" :
    "critical";

  return (
    <div
      className="relative mx-auto flex shrink-0 items-center justify-center"
      style={{
        width:     compact ? 180 : SIZE,
        height:    compact ? 180 : SIZE,
        maxWidth:  compact ? "48vw" : "92vw",
        maxHeight: compact ? "48vw" : "92vw",
      }}
    >
      {/* Glow halo behind ring when danger */}
      {dangerPhase && (
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${color}22 0%, transparent 70%)`,
            willChange: "opacity",
            animation:  `danger-pulse ${pulseDuration}s ease-in-out infinite`,
          }}
          aria-hidden
        />
      )}

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 h-full w-full -rotate-90"
        style={{
          willChange: "opacity",
          animation:  dangerPhase
            ? `danger-pulse ${pulseDuration}s ease-in-out infinite`
            : undefined,
        }}
        aria-hidden
      >
        {/* Track */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={STROKE}
        />
        {/* Progress arc */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE + (dangerPhase ? 2 : 0)}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 100ms linear, stroke 400ms linear" }}
        />
      </svg>

      {/* Center — NO number. The Hidden Fuse. */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-1.5">

        {/* Pulsing ? mark — pure tension */}
        <motion.span
          className={`font-mono font-black leading-none ${
            compact ? "text-4xl" : "text-6xl sm:text-7xl"
          }`}
          style={{ color, willChange: "transform" }}
          animate={dangerPhase ? {
            scale: [1, 1.08, 1],
          } : { scale: 1 }}
          transition={{
            duration: pulseDuration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          aria-hidden
        >
          ?
        </motion.span>

        {/* Status label — descriptive, not numeric */}
        <span
          className={`font-mono uppercase tracking-[0.2em] ${
            compact ? "text-[8px]" : "text-[10px]"
          }`}
          style={{ color: `${color}99` }}
        >
          {dangerLabel}
        </span>

        {/* Screen-reader only — gives accessibility without exposing time */}
        <span className="sr-only">
          Round in progress — time unknown
        </span>

        {children}
      </div>
    </div>
  );
}
