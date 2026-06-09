import { useMemo } from "react";
import { GAME_CONFIG } from "@/lib/types";
import { clamp } from "@/lib/utils";

interface CountdownRingProps {
  countdown: number;
  children?: React.ReactNode;
}

/* interpolate Phantom → Gold → Blood as fraction goes 1 → 0 */
function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}
function ringColor(frac: number): string {
  const phantom = [112, 0, 255];
  const gold = [255, 215, 0];
  const blood = [255, 34, 0];
  let c: number[];
  if (frac > 0.4) {
    const t = clamp((1 - frac) / 0.6, 0, 1); // 1 → 0.4 maps phantom→gold
    c = phantom.map((p, i) => lerp(p, gold[i], t));
  } else {
    const t = clamp((0.4 - frac) / 0.4, 0, 1); // 0.4 → 0 maps gold→blood
    c = gold.map((g, i) => lerp(g, blood[i], t));
  }
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

const SIZE = 320;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

export function CountdownRing({ countdown, children }: CountdownRingProps) {
  const frac = clamp(countdown / GAME_CONFIG.ROUND_SECONDS, 0, 1);
  const color = useMemo(() => ringColor(frac), [frac]);
  const offset = CIRC * (1 - frac);

  const seconds = Math.max(0, countdown);
  const critical = countdown <= 5;
  const pulsing = frac <= 0.1;

  // show one decimal so the ring + digits feel alive
  const shown = seconds.toFixed(1);

  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={{ width: SIZE, height: SIZE, maxWidth: "92vw", maxHeight: "92vw" }}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 h-full w-full -rotate-90"
        style={{
          opacity: pulsing ? undefined : 1,
          animation: pulsing
            ? "danger-pulse 0.7s ease-in-out infinite"
            : undefined,
          willChange: "opacity",
        }}
        aria-hidden
      >
        {/* track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={STROKE}
        />
        {/* progress */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 100ms linear, stroke 300ms linear",
          }}
        />
      </svg>

      {/* center content */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-1">
        <span
          className={`font-mono text-5xl font-bold tabular-nums sm:text-6xl ${
            critical ? "glitch text-blood" : "text-white"
          }`}
          style={!critical ? { color } : undefined}
        >
          {shown}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
          seconds
        </span>
        {children}
      </div>
    </div>
  );
}
