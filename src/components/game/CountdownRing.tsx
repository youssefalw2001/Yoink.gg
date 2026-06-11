/**
 * YOINK.GG — Hidden Fuse Ring (final correct version)
 *
 * THE DESIGN:
 *   - Depleting arc IS shown — this creates real tension and urgency
 *   - The arc depletes at DIFFERENT SPEEDS per round (random 20-45s fuse)
 *   - A fast-depleting arc means a short fuse — players panic
 *   - A slow arc means a long fuse — false sense of safety
 *   - Players can see HOW MUCH is left but NOT how long that translates to
 *     because they don't know if the fuse was 22s or 43s
 *   - THAT is the hidden fuse: the position is visible, the duration is not
 *
 * ZERO intervals in this component. Re-renders come from parent tick (150ms).
 * CSS animations for pulse — GPU only, no JS timers.
 *
 * Bid Wars (showNumber=true): exact countdown shown — auctions need time.
 */

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DangerRingProps {
  countdown:   number;
  fuseSeconds: number;
  children?:   React.ReactNode;
  compact?:    boolean;
  showNumber?: boolean;
}

// ── Colour — 4 stops, blood arrives before the end to build dread ─────────────
function ringColor(elapsed: number): string {
  const lerp = (
    a: [number,number,number],
    b: [number,number,number],
    t: number,
  ) => {
    const tt = Math.max(0, Math.min(1, t));
    return `rgb(${Math.round(a[0]+(b[0]-a[0])*tt)},${Math.round(a[1]+(b[1]-a[1])*tt)},${Math.round(a[2]+(b[2]-a[2])*tt)})`;
  };

  if (elapsed < 0.30) return lerp([112,0,255], [255,215,0],   elapsed / 0.30);
  if (elapsed < 0.60) return lerp([255,215,0], [255,100,0],   (elapsed-0.30)/0.30);
  if (elapsed < 0.82) return lerp([255,100,0], [255,34,0],    (elapsed-0.60)/0.22);
  return "rgb(255,34,0)";
}

const SIZE  = 320;
const STROKE = 10;
const R     = (SIZE - STROKE - 4) / 2;
const CIRC  = 2 * Math.PI * R;
const CX    = SIZE / 2;
const CY    = SIZE / 2;

export function CountdownRing({
  countdown,
  fuseSeconds,
  children,
  compact,
  showNumber = false,
}: DangerRingProps) {
  const elapsed = Math.max(0, Math.min(1, 1 - countdown / Math.max(fuseSeconds, 1)));
  const color   = useMemo(() => ringColor(elapsed), [elapsed]);

  // Arc offset — depletes as elapsed increases
  const offset = CIRC * elapsed;

  // Stroke grows in danger phase for physical urgency
  const strokeWidth = elapsed > 0.80 ? 14 : elapsed > 0.60 ? 12 : STROKE;

  // Pulse speed — only CSS, no JS
  const pulseDuration =
    elapsed < 0.35 ? 2.2 :
    elapsed < 0.60 ? 1.2 :
    elapsed < 0.82 ? 0.65 :
    0.32;

  const dangerPhase   = elapsed > 0.60;
  const criticalPhase = elapsed > 0.82;

  // Status labels — convey urgency without revealing time
  const label =
    elapsed < 0.20 ? "holding" :
    elapsed < 0.40 ? "burning" :
    elapsed < 0.65 ? "LIVE"    :
    elapsed < 0.85 ? "NOW?"    :
    "GO!";

  const centerText = criticalPhase ? "!!" : "?";

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
      {/* Background glow — scales with elapsed, pure CSS transition */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${
            color.replace("rgb(","rgba(").replace(")", `,${0.04 + elapsed * 0.20})`)
          } 0%, transparent 65%)`,
          transition: "background 500ms ease",
        }}
        aria-hidden
      />

      {/* Outer pulse ring in danger — CSS animation, no JS */}
      {dangerPhase && (
        <div
          className="pointer-events-none absolute inset-[6%] rounded-full border-2"
          style={{
            borderColor: color,
            opacity: 0.3,
            animation: `border-breathe ${pulseDuration}s ease-in-out infinite`,
            willChange: "transform",
            transition: "border-color 400ms ease",
          }}
          aria-hidden
        />
      )}

      {/* Main SVG — depleting arc */}
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 h-full w-full -rotate-90"
        aria-hidden
      >
        {/* Track */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={STROKE}
        />

        {/* Depleting arc — this is the "hidden" fuse visual */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 160ms linear, stroke 400ms ease, stroke-width 300ms ease",
            filter: dangerPhase
              ? `drop-shadow(0 0 ${strokeWidth}px ${color})`
              : "none",
          }}
        />
      </svg>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-1.5">
        {showNumber ? (
          // Bid Wars only — exact countdown
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
          // Hidden fuse — no number, ? only
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
