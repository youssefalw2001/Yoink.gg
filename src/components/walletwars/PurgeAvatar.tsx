/**
 * PurgeAvatar — procedural "Purge night" mask avatars for Wallet Wars.
 *
 * Deterministic from a seed (wallet address): same wallet → same mask + color,
 * every time. Six menacing mask archetypes, neon-glow features, dystopian vibe.
 *
 * GPU-safe: static SVG (no per-frame work). Optional glow pulse is CSS-only and
 * respects prefers-reduced-motion. Cheap enough to render a whole board of them.
 */

import { useMemo } from "react";

interface PurgeAvatarProps {
  seed: string;
  size?: number;
  className?: string;
  /** Subtle neon breathing — use sparingly (e.g. the raid target). */
  pulse?: boolean;
}

// Neon purge palette — toxic green, blood, phantom, gold, cyan, hot magenta.
const PALETTE = ["#00E676", "#FF2200", "#7000FF", "#FFD700", "#00E5FF", "#FF1FA0"];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MASK_PATH =
  "M32 6 C45 6 52 16 52 30 C52 45 43 58 32 58 C21 58 12 45 12 30 C12 16 19 6 32 6 Z";

function Features({ variant, c }: { variant: number; c: string }) {
  const s = { stroke: c, strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  switch (variant) {
    case 0: // GRIN — purge smiley
      return (
        <g>
          <polygon points="22,22 28,22 25,30" fill={c} />
          <polygon points="36,22 42,22 39,30" fill={c} />
          <polyline points="20,40 24,48 28,40 32,48 36,40 40,48 44,40" {...s} />
        </g>
      );
    case 1: // SLITS — LED mask
      return (
        <g>
          <rect x="21" y="20" width="4.5" height="13" rx="2.2" fill={c} />
          <rect x="38.5" y="20" width="4.5" height="13" rx="2.2" fill={c} />
          <rect x="24" y="43" width="16" height="3" rx="1.5" fill={c} />
          <rect x="28" y="40" width="2" height="9" rx="1" fill={c} opacity="0.6" />
          <rect x="34" y="40" width="2" height="9" rx="1" fill={c} opacity="0.6" />
        </g>
      );
    case 2: // CROSS — dead eyes + stitched mouth
      return (
        <g {...s}>
          <line x1="20" y1="22" x2="27" y2="29" /><line x1="27" y1="22" x2="20" y2="29" />
          <line x1="37" y1="22" x2="44" y2="29" /><line x1="44" y1="22" x2="37" y2="29" />
          <line x1="22" y1="45" x2="42" y2="45" />
          <line x1="26" y1="42" x2="26" y2="48" /><line x1="32" y1="42" x2="32" y2="48" /><line x1="38" y1="42" x2="38" y2="48" />
        </g>
      );
    case 3: // GAS — respirator
      return (
        <g>
          <circle cx="24" cy="26" r="6.5" fill="none" stroke={c} strokeWidth="2.6" />
          <circle cx="40" cy="26" r="6.5" fill="none" stroke={c} strokeWidth="2.6" />
          <circle cx="24" cy="26" r="2" fill={c} /><circle cx="40" cy="26" r="2" fill={c} />
          <rect x="27" y="40" width="10" height="13" rx="3" fill="none" stroke={c} strokeWidth="2.6" />
          <line x1="32" y1="40" x2="32" y2="36" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
        </g>
      );
    case 4: // TRIANGLE — jester/devil
      return (
        <g>
          <polygon points="20,30 28,30 24,21" fill={c} />
          <polygon points="36,30 44,30 40,21" fill={c} />
          <polyline points="21,44 26,40 31,44 37,40 43,44" {...s} />
        </g>
      );
    default: // 5: HORNS — purge king
      return (
        <g>
          <polygon points="13,15 19,3 21,17" fill={c} />
          <polygon points="51,15 45,3 43,17" fill={c} />
          <circle cx="24" cy="28" r="3.4" fill={c} />
          <circle cx="40" cy="28" r="3.4" fill={c} />
          <path d="M22 43 Q32 52 42 43" {...s} />
        </g>
      );
  }
}

export function PurgeAvatar({ seed, size = 40, className, pulse = false }: PurgeAvatarProps) {
  const { variant, color } = useMemo(() => {
    const h = hash(seed || "anon");
    return { variant: h % 6, color: PALETTE[(h >> 8) % PALETTE.length] };
  }, [seed]);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animate = pulse && !reduced;

  return (
    <span
      className={className}
      style={{ display: "inline-block", width: size, height: size, lineHeight: 0 }}
      aria-hidden
    >
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        style={{
          filter: `drop-shadow(0 0 ${animate ? 7 : 4}px ${color}aa)`,
          willChange: animate ? "transform" : undefined,
          ...(animate ? { animation: "purge-pulse 1.6s ease-in-out infinite" } : {}),
        }}
      >
        <defs>
          <radialGradient id={`pg-${variant}-${color.slice(1)}`} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="60%" stopColor="#0c0a14" stopOpacity="1" />
            <stop offset="100%" stopColor="#08080f" stopOpacity="1" />
          </radialGradient>
        </defs>
        {/* mask base */}
        <path d={MASK_PATH} fill={`url(#pg-${variant}-${color.slice(1)})`} stroke={color} strokeOpacity="0.35" strokeWidth="1.5" />
        {/* neon features */}
        <Features variant={variant} c={color} />
      </svg>
    </span>
  );
}
