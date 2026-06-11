/**
 * YOINK.GG — Hidden Fuse Ring
 *
 * THE CORRECT IMPLEMENTATION:
 *
 * Previous attempts showed a depleting arc. That was wrong.
 * A depleting arc IS a countdown — users can read how much time is left
 * from how much arc remains. The "?" becomes meaningless.
 *
 * The correct approach: NO ARC DEPLETION AT ALL.
 * Show only a solid ring that pulses. The ONLY information:
 *   - Colour: phantom → gold → orange → blood (nobody knows the thresholds)
 *   - Pulse speed: slow → medium → fast → frantic
 *   - Text: "?" → "?!" → "!!" → "NOW"
 *
 * Players have NO WAY to calculate remaining time.
 * They can only feel the urgency. That is the Hidden Fuse.
 *
 * PERFORMANCE:
 * Zero setInterval calls. The component re-renders from the
 * parent game tick (useGameState, 150ms). No extra timers.
 * CSS animations only for the pulse — GPU, no JS.
 *
 * Bid Wars (showNumber=true): shows exact countdown — auctions need time.
 */

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DangerRingProps {
  countdown:   number;
  fuseSeconds: number;
  children?:   React.ReactNode;
  compact?:    boolean;
  /** Show exact number — for Bid Wars auctions only */
  showNumber?: boolean;
}

// ── Colour — phases not tied to visible arc so nobody can infer time ──────────
function ringColor(elapsed: number): string {
  if (elapsed < 0.35) {
    // Phantom → Gold
    const t = elapsed / 0.35;
    const r = Math.round(112 + (255-112)*t);
    const g = Math.round(0   + (215-0  )*t);
    const b = Math.round(255 + (0  -255)*t);
    return `rgb(${r},${g},${b})`;
  }
  if (elapsed < 0.65) {
    // Gold → Orange
    const t = (elapsed - 0.35) / 0.30;
    const r = 255;
    const g = Math.round(215 + (100-215)*t);
    const b = 0;
    return `rgb(${r},${g},${b})`;
  }
  // Orange → Blood (arrives at 0.65, full blood by 0.85)
  const t = Math.min((elapsed - 0.65) / 0.20, 1);
  const r = 255;
  const g = Math.round(100 * (1-t));
  const b = 0;
  return `rgb(${r},${g},${b})`;
}

// ── Pulse — CSS animation name based on urgency ───────────────────────────────
// Using CSS keyframes (border-breathe, danger-pulse) already in index.css
// so no JS animation loop is needed.
function pulseDuration(elapsed: number): number {
  if (elapsed < 0.35) return 2.2;
  if (elapsed < 0.60) return 1.2;
  if (elapsed < 0.80) return 0.65;
  return 0.32; // frantic
}

// ── Ring size ─────────────────────────────────────────────────────────────────
const SIZE = 320;
const CX   = SIZE / 2;
const CY   = SIZE / 2;

export function CountdownRing({
  countdown,
  fuseSeconds,
  children,
  compact,
  showNumber = false,
}: DangerRingProps) {
  const elapsed = Math.max(0, Math.min(1, 1 - countdown / Math.max(fuseSeconds, 1)));
  const color   = useMemo(() => ringColor(elapsed), [elapsed]);
  const pd      = pulseDuration(elapsed);

  const dangerPhase   = elapsed > 0.60;
  const criticalPhase = elapsed > 0.82;

  // ── Text escalation ───────────────────────────────────────────────────────
  const centerText = criticalPhase ? "!!" : "?";
  const label = elapsed < 0.25 ? "holding"
    : elapsed < 0.50 ? "burning"
    : elapsed < 0.70 ? "LIVE"
    : elapsed < 0.85 ? "NOW?"
    : "GO!";

  // ── Ring stroke — grows slightly in danger ────────────────────────────────
  const outerR = compact ? 82 : 148;
  const innerR = outerR - (dangerPhase ? 14 : criticalPhase ? 16 : 10);

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
      {/* Background glow — scales with urgency, pure CSS */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${color.replace("rgb(","rgba(").replace(")",`,${0.06 + elapsed * 0.22})`)} 0%, transparent 65%)`,
          transition: "background 600ms ease",
          willChange: "opacity",
        }}
        aria-hidden
      />

      {/* Outer pulse ring — appears only in danger, CSS animation */}
      {dangerPhase && (
        <div
          className="pointer-events-none absolute inset-[8%] rounded-full"
          style={{
            border:    `2px solid ${color}`,
            opacity:   0.35,
            animation: `border-breathe ${pd}s ease-in-out infinite`,
            willChange: "transform",
          }}
          aria-hidden
        />
      )}

      {/* The ring — solid, no depletion, just pulse */}
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {/* Track */}
        <circle
          cx={CX} cy={CY} r={outerR}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={compact ? 8 : 12}
        />

        {/* Solid ring — NO depletion, NO strokeDasharray */}
        <circle
          cx={CX} cy={CY} r={outerR}
          fill="none"
          stroke={color}
          strokeWidth={compact ? (dangerPhase ? 11 : 8) : (dangerPhase ? 16 : 12)}
          style={{
            filter:     dangerPhase
              ? `drop-shadow(0 0 ${dangerPhase ? 8 : 4}px ${color})`
              : "none",
            transition: "stroke 500ms ease, stroke-width 400ms ease",
          }}
        />

        {/* Inner ring — decorative, creates depth */}
        <circle
          cx={CX} cy={CY} r={innerR}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.2}
          style={{ transition: "stroke 500ms ease" }}
        />
      </svg>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-1.5">
        {showNumber ? (
          // Bid Wars — show exact time
          <>
            <span
              className={`font-mono font-black tabular-nums leading-none ${
                compact ? "text-3xl" : "text-5xl sm:text-6xl"
              }`}
              style={{ color }}
            >
              {countdown.toFixed(1)}
            </span>
            <span className={`font-mono uppercase tracking-[0.3em] text-slate ${compact ? "text-[9px]" : "text-[10px]"}`}>
              seconds
            </span>
          </>
        ) : (
          // Hidden Fuse — no time information
          <>
            <AnimatePresence mode="wait">
              <motion.span
                key={centerText}
                className={`font-mono font-black leading-none select-none ${
                  compact ? "text-4xl" : "text-6xl sm:text-7xl"
                }`}
                style={{ color, willChange: "transform" }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.2, opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {centerText}
              </motion.span>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.span
                key={label}
                className={`font-mono uppercase tracking-[0.18em] select-none ${
                  compact ? "text-[8px]" : "text-[10px]"
                }`}
                style={{ color: `${color}bb` }}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.2 }}
              >
                {label}
              </motion.span>
            </AnimatePresence>

            <span className="sr-only">Round in progress — time unknown</span>
          </>
        )}
        {children}
      </div>
    </div>
  );
}
