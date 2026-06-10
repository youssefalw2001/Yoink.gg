import { useMemo } from "react";
import { useSpring, animated } from "@react-spring/web";
import { GAME_CONFIG } from "@/lib/types";
import { clamp } from "@/lib/utils";

interface CountdownRingProps {
  countdown: number;
  children?: React.ReactNode;
  /** Render a compact ring (180px) for the mobile 2-col hero layout */
  compact?: boolean;
}

/* interpolate Phantom → Gold → Blood as fraction goes 1 → 0 */
function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}
function ringColor(frac: number): string {
  const phantom = [112, 0, 255];
  const gold    = [255, 215, 0];
  const blood   = [255, 34, 0];
  let c: number[];
  if (frac > 0.4) {
    const t = clamp((1 - frac) / 0.6, 0, 1);
    c = phantom.map((p, i) => lerp(p, gold[i], t));
  } else {
    const t = clamp((0.4 - frac) / 0.4, 0, 1);
    c = gold.map((g, i) => lerp(g, blood[i], t));
  }
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

const SIZE   = 320;
const STROKE = 10;
const R      = (SIZE - STROKE) / 2;
const CIRC   = 2 * Math.PI * R;

export function CountdownRing({ countdown, children, compact }: CountdownRingProps) {
  const frac     = clamp(countdown / GAME_CONFIG.ROUND_SECONDS, 0, 1);
  const color    = useMemo(() => ringColor(frac), [frac]);
  const offset   = CIRC * (1 - frac);
  const critical = countdown <= 5;
  const pulsing  = frac <= 0.1;

  // React Spring — smooth digit physics
  const { val } = useSpring({
    val: Math.max(0, countdown),
    config: { tension: 300, friction: 30, precision: 0.01 },
  });

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
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 h-full w-full -rotate-90"
        style={{
          animation: pulsing ? "danger-pulse 0.7s ease-in-out infinite" : undefined,
          willChange: "opacity",
        }}
        aria-hidden
      >
        {/* track */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={STROKE}
        />
        {/* progress */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 100ms linear, stroke 300ms linear" }}
        />
      </svg>

      {/* center */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-1">
        <animated.span
          className={`font-mono font-bold tabular-nums ${
            compact ? "text-3xl" : "text-5xl sm:text-6xl"
          } ${critical ? "glitch text-blood" : ""}`}
          style={!critical ? { color } : undefined}
          aria-live="polite"
          aria-label={`${Math.ceil(countdown)} seconds remaining`}
        >
          {val.to((v) => v.toFixed(1))}
        </animated.span>
        <span className={`font-mono uppercase tracking-[0.3em] text-slate ${compact ? "text-[9px]" : "text-[10px]"}`}>
          seconds
        </span>
        {children}
      </div>
    </div>
  );
}
