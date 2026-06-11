/**
 * YOINK.GG — Hidden Fuse Ring (Danger Ring)
 *
 * The psychological core of the game. Nobody knows when it ends.
 *
 * WHAT MAKES IT FEEL HIDDEN (not just a question mark):
 *
 *   1. ARC JITTER — the arc doesn't deplete smoothly. Every few ticks
 *      it shudders slightly (random ±2-4% flicker). This makes it feel
 *      like a real burning fuse — uneven, unpredictable.
 *
 *   2. SPARK DOT — a bright dot travels the leading edge of the arc,
 *      like the burning end of a fuse. It has a glow filter.
 *
 *   3. LABEL ESCALATION — status labels get more alarming:
 *      "holding" → "burning" → "LIVE" → "NOW!"
 *      In critical phase the label blinks at 0.3s — very fast.
 *
 *   4. COLOUR CURVE — transitions happen faster in the second half:
 *      Phantom (0-30%) → Gold (30-60%) → Orange (60-80%) → Blood (80-100%)
 *      The blood phase arrives before the end — building dread.
 *
 *   5. RING THICKNESS GROWS — from 10px at start to 14px in danger,
 *      making it feel increasingly urgent.
 *
 *   6. GLOW INTENSITY SCALES — the radial glow behind the ring expands
 *      and intensifies in the final phase.
 *
 * The Bid Wars mode (showNumber=true) bypasses all of this and shows
 * the exact countdown — auctions need visible time.
 *
 * GPU rules: transform + opacity only for perpetual animations.
 * prefers-reduced-motion: shows static ring in current colour only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DangerRingProps {
  countdown:   number;
  fuseSeconds: number;
  children?:   React.ReactNode;
  compact?:    boolean;
  showNumber?: boolean;
}

// ── Colour curve ──────────────────────────────────────────────────────────────
function ringColor(elapsed: number): string {
  const phantom: [number,number,number] = [112, 0,   255];
  const gold:    [number,number,number] = [255, 215, 0  ];
  const orange:  [number,number,number] = [255, 100, 0  ];
  const blood:   [number,number,number] = [255, 34,  0  ];

  function lerp(a: [number,number,number], b: [number,number,number], t: number): string {
    const tt = Math.max(0, Math.min(1, t));
    return `rgb(${Math.round(a[0]+(b[0]-a[0])*tt)},${Math.round(a[1]+(b[1]-a[1])*tt)},${Math.round(a[2]+(b[2]-a[2])*tt)})`;
  }

  if (elapsed < 0.30) return lerp(phantom, gold,   elapsed / 0.30);
  if (elapsed < 0.60) return lerp(gold,   orange,  (elapsed - 0.30) / 0.30);
  if (elapsed < 0.80) return lerp(orange, blood,   (elapsed - 0.60) / 0.20);
  return "rgb(255,34,0)"; // full blood
}

// ── Spark position on arc ─────────────────────────────────────────────────────
// Returns the (x,y) of the leading edge of the depleting arc.
function sparkPosition(elapsed: number, cx: number, cy: number, r: number) {
  // Arc starts at top (-90deg / -π/2) and goes clockwise.
  // Depleted fraction = elapsed, so the spark is at angle:
  //   startAngle + elapsed * 2π (but we subtract because arc depletes clockwise from top)
  const angle = -Math.PI / 2 + (1 - elapsed) * 2 * Math.PI;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

const SIZE   = 320;
const STROKE_BASE = 10;
const R      = (SIZE - STROKE_BASE - 4) / 2;
const CIRC   = 2 * Math.PI * R;
const CX     = SIZE / 2;
const CY     = SIZE / 2;

export function CountdownRing({
  countdown,
  fuseSeconds,
  children,
  compact,
  showNumber = false,
}: DangerRingProps) {
  const reduced = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ).current;

  const elapsed = Math.max(0, Math.min(1, 1 - countdown / Math.max(fuseSeconds, 1)));
  const color   = useMemo(() => ringColor(elapsed), [elapsed]);

  // ── Arc jitter — random micro-flicker every 400ms ─────────────────────────
  // Makes the ring feel like a burning fuse, not a regular countdown.
  const [jitter, setJitter] = useState(0);
  useEffect(() => {
    if (reduced || showNumber) return;
    const id = setInterval(() => {
      // Jitter magnitude increases in danger phase
      const mag = elapsed > 0.7 ? 0.04 : elapsed > 0.4 ? 0.02 : 0.01;
      setJitter((Math.random() - 0.5) * mag);
    }, elapsed > 0.7 ? 200 : elapsed > 0.4 ? 300 : 450);
    return () => clearInterval(id);
  }, [elapsed, reduced, showNumber]);

  // Apply jitter to the elapsed for visual only (not for colour, not logic)
  const displayElapsed = Math.max(0, Math.min(1, elapsed + jitter));
  const offset = CIRC * displayElapsed;

  // ── Stroke thickness grows in danger ─────────────────────────────────────
  const strokeWidth = elapsed > 0.8 ? 14 : elapsed > 0.6 ? 12 : STROKE_BASE;

  // ── Pulse speed ──────────────────────────────────────────────────────────
  const pulseDuration =
    elapsed < 0.4 ? 2.2 :
    elapsed < 0.65 ? 1.1 :
    elapsed < 0.85 ? 0.6 :
    0.35;

  // ── Danger phases ─────────────────────────────────────────────────────────
  const dangerPhase  = elapsed > 0.65;
  const criticalPhase = elapsed > 0.85;

  // ── Spark dot position ────────────────────────────────────────────────────
  const spark = useMemo(() => sparkPosition(displayElapsed, CX, CY, R), [displayElapsed]);

  // ── Status labels — escalating urgency ───────────────────────────────────
  const statusLabel =
    elapsed < 0.20 ? "holding" :
    elapsed < 0.40 ? "burning" :
    elapsed < 0.65 ? "LIVE" :
    elapsed < 0.85 ? "NOW?" :
    "GO!";

  // ── Central character — escalates ────────────────────────────────────────
  const centerChar = criticalPhase ? "!!" : "?";

  // ── Glow radius scales with elapsed ──────────────────────────────────────
  const glowOpacity = elapsed * 0.35;

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
      {/* Atmospheric glow — scales with elapsed */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${color.replace("rgb","rgba").replace(")",`,${glowOpacity})`)} 0%, transparent 70%)`,
          willChange: "opacity",
          transition: "opacity 400ms, background 400ms",
        }}
        aria-hidden
      />

      {/* Outer pulse ring — only in danger */}
      {dangerPhase && !reduced && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-full border-2"
          style={{
            borderColor: color,
            willChange: "transform, opacity",
          }}
          animate={{ scale: [1, 1.06, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: pulseDuration, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        />
      )}

      {/* Main SVG ring */}
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 h-full w-full -rotate-90"
        aria-hidden
      >
        {/* Track ring */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={STROKE_BASE}
        />

        {/* Depleting arc */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          style={{
            transition: reduced
              ? "none"
              : "stroke-dashoffset 120ms linear, stroke 350ms linear, stroke-width 300ms ease",
            filter: dangerPhase ? `drop-shadow(0 0 ${strokeWidth}px ${color})` : "none",
          }}
        />

        {/* Spark dot — travels the leading edge of the arc */}
        {!reduced && !showNumber && elapsed > 0.05 && elapsed < 0.98 && (
          <circle
            cx={spark.x}
            cy={spark.y}
            r={strokeWidth * 0.8}
            fill={color}
            style={{
              filter: `drop-shadow(0 0 ${strokeWidth * 1.5}px ${color}) drop-shadow(0 0 4px white)`,
            }}
          />
        )}
      </svg>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-1.5">
        {showNumber ? (
          /* Bid Wars — exact countdown visible */
          <>
            <motion.span
              className={`font-mono font-black tabular-nums leading-none ${compact ? "text-3xl" : "text-5xl sm:text-6xl"}`}
              style={{ color, willChange: "transform" }}
              aria-live="polite"
              aria-label={`${Math.ceil(countdown)} seconds remaining`}
            >
              {countdown.toFixed(1)}
            </motion.span>
            <span className={`font-mono uppercase tracking-[0.3em] text-slate ${compact ? "text-[9px]" : "text-[10px]"}`}>
              seconds
            </span>
          </>
        ) : (
          /* Hidden Fuse — no number, escalating tension */
          <>
            <AnimatePresence mode="wait">
              <motion.span
                key={centerChar}
                className={`font-mono font-black leading-none select-none ${compact ? "text-4xl" : "text-6xl sm:text-7xl"}`}
                style={{ color, willChange: "transform" }}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={reduced ? { scale: 1, opacity: 1 } : criticalPhase
                  ? { scale: [1, 1.12, 1], opacity: 1 }
                  : dangerPhase
                    ? { scale: [1, 1.06, 1], opacity: 1 }
                    : { scale: 1, opacity: 1 }
                }
                transition={reduced ? { duration: 0 } : criticalPhase
                  ? { duration: pulseDuration, repeat: Infinity, ease: "easeInOut" }
                  : { duration: pulseDuration, repeat: Infinity, ease: "easeInOut" }
                }
                exit={{ scale: 1.3, opacity: 0, transition: { duration: 0.15 } }}
                aria-hidden
              >
                {centerChar}
              </motion.span>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.span
                key={statusLabel}
                className={`font-mono uppercase tracking-[0.18em] select-none ${compact ? "text-[8px]" : "text-[10px]"}`}
                style={{ color: `${color}cc` }}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.2 }}
              >
                {statusLabel}
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
