/**
 * YOINK.GG — Deterministic King Avatar Generator
 *
 * Takes a wallet address string and deterministically generates a unique
 * pixel-art style SVG face. Same wallet = same face, always.
 *
 * Seeded by summing char codes of the wallet string mod palette/shape sizes.
 * Zero dependencies, zero API calls, instant render.
 */

import type { } from "react";

interface KingAvatarProps {
  wallet: string;
  size?: number;
  className?: string;
  /** Show crown on top if this wallet is the current king */
  isKing?: boolean;
  critical?: boolean;
}

// ─── Deterministic seed from wallet string ────────────────────────────────────
function seed(wallet: string, offset = 0): number {
  let h = offset * 31337;
  for (let i = 0; i < wallet.length; i++) {
    h = (Math.imul(31, h) + wallet.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(arr: readonly T[], wallet: string, offset: number): T {
  return arr[seed(wallet, offset) % arr.length];
}

// ─── Palette pools ────────────────────────────────────────────────────────────

const SKIN_TONES = ["#FDBCB4","#F1A07A","#C68642","#8D5524","#4A2912","#2C1503"] as const;
const HAIR_COLORS = ["#FFD700","#FF6B6B","#7000FF","#00E676","#FF2200","#eef1f6","#1a1206","#4a3000"] as const;
const EYE_COLORS  = ["#FFD700","#00E676","#FF2200","#29B6F6","#7000FF","#FFFFFF"] as const;

const HAIR_STYLES = ["mohawk","long","bald","spiky","wavy","cap"] as const;
const ACCESSORY   = ["none","none","none","eyepatch","scar","goldchain","bandana","hoop"] as const;

// ─── SVG face builder ─────────────────────────────────────────────────────────

export function KingAvatar({
  wallet,
  size = 80,
  className,
  isKing = false,
  critical = false,
}: KingAvatarProps) {
  const w = wallet || "default";

  const skin     = pick(SKIN_TONES,  w, 0);
  const hairCol  = pick(HAIR_COLORS, w, 1);
  const eyeCol   = pick(EYE_COLORS,  w, 2);
  const hairStyle = pick(HAIR_STYLES, w, 3);
  const acc      = pick(ACCESSORY,   w, 4);
  const mouthIdx = seed(w, 5) % 4;  // 0=grin 1=smirk 2=frown 3=neutral

  const crownColor = critical ? "#FF2200" : "#FFD700";
  const glowColor  = critical ? "rgba(255,34,0,0.6)" : "rgba(255,215,0,0.6)";

  const mouth = [
    "M44 56 Q52 62 60 56",          // grin
    "M44 56 Q52 58 58 54",          // smirk
    "M44 60 Q52 54 60 60",          // frown
    "M44 58 L60 58",                // neutral
  ][mouthIdx];

  return (
    <svg
      viewBox="0 0 88 88"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-label={`King avatar for ${w.slice(0,8)}`}
    >
      <defs>
        <radialGradient id={`ag_${w.slice(0,4)}`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor={skin} stopOpacity="1"/>
          <stop offset="100%" stopColor={skin} stopOpacity="0.7"/>
        </radialGradient>
        {isKing && (
          <radialGradient id={`kglow_${w.slice(0,4)}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={glowColor}/>
            <stop offset="100%" stopColor={glowColor} stopOpacity="0"/>
          </radialGradient>
        )}
      </defs>

      {/* glow ring when king */}
      {isKing && (
        <circle cx="44" cy="48" r="40" fill={`url(#kglow_${w.slice(0,4)})`} />
      )}

      {/* ── Hair (behind head) ── */}
      {hairStyle === "mohawk" && (
        <path d="M34 32 Q44 8 54 32" fill={hairCol} />
      )}
      {hairStyle === "long" && (
        <path d="M22 40 Q20 14 44 12 Q68 14 66 40 L66 72 Q60 80 44 80 Q28 80 22 72 Z" fill={hairCol} opacity="0.9"/>
      )}
      {hairStyle === "spiky" && (
        <>
          <path d="M26 36 L30 14 L34 36" fill={hairCol}/>
          <path d="M36 32 L40 10 L44 32" fill={hairCol}/>
          <path d="M46 32 L50 10 L54 32" fill={hairCol}/>
          <path d="M56 36 L60 14 L64 36" fill={hairCol}/>
        </>
      )}
      {hairStyle === "wavy" && (
        <path d="M22 36 Q26 14 36 18 Q44 10 52 18 Q62 14 66 36" fill={hairCol} stroke={hairCol} strokeWidth="1"/>
      )}
      {hairStyle === "cap" && (
        <>
          <rect x="22" y="28" width="44" height="14" rx="4" fill={hairCol}/>
          <rect x="18" y="36" width="52" height="6" rx="3" fill={hairCol}/>
        </>
      )}
      {/* bald = no hair */}

      {/* ── Face ── */}
      <ellipse
        cx="44" cy="48"
        rx="22" ry="24"
        fill={`url(#ag_${w.slice(0,4)})`}
        stroke={skin}
        strokeWidth="0.5"
      />

      {/* ── Hair on top (over face edges) ── */}
      {(hairStyle === "mohawk" || hairStyle === "spiky") && (
        <ellipse cx="44" cy="32" rx="20" ry="8" fill={hairCol}/>
      )}
      {hairStyle === "long" && (
        <>
          <path d="M22 40 Q22 28 44 26 Q66 28 66 40" fill={hairCol}/>
        </>
      )}
      {hairStyle === "wavy" && (
        <ellipse cx="44" cy="32" rx="20" ry="7" fill={hairCol}/>
      )}

      {/* ── Eyes ── */}
      <ellipse cx="36" cy="46" rx="4.5" ry="4" fill="white"/>
      <ellipse cx="52" cy="46" rx="4.5" ry="4" fill="white"/>
      <ellipse cx="36.5" cy="46.5" rx="2.5" ry="2.5" fill={eyeCol}/>
      <ellipse cx="52.5" cy="46.5" rx="2.5" ry="2.5" fill={eyeCol}/>
      <circle cx="37" cy="45.5" r="0.9" fill="white" opacity="0.7"/>
      <circle cx="53" cy="45.5" r="0.9" fill="white" opacity="0.7"/>
      {/* eyebrows */}
      <path d="M32 40 Q36 37 40 40" stroke={hairCol === "#eef1f6" ? "#8892a4" : hairCol} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M48 40 Q52 37 56 40" stroke={hairCol === "#eef1f6" ? "#8892a4" : hairCol} strokeWidth="1.5" strokeLinecap="round" fill="none"/>

      {/* ── Nose ── */}
      <path d="M43 50 Q44 54 45 50" stroke={skin === "#FDBCB4" ? "#d89070" : "#2a1000"} strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.5"/>

      {/* ── Mouth ── */}
      <path d={mouth} stroke={skin === "#FDBCB4" ? "#d07060" : "#1a0800"} strokeWidth="1.8" strokeLinecap="round" fill="none"/>

      {/* ── Accessory ── */}
      {acc === "eyepatch" && (
        <path d="M31 43 Q36 40 41 43 Q36 50 31 43 Z" fill="#1a1206" stroke="#8892a4" strokeWidth="0.8"/>
      )}
      {acc === "scar" && (
        <path d="M50 38 L55 50" stroke="#CC4422" strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
      )}
      {acc === "goldchain" && (
        <path d="M30 62 Q44 70 58 62" stroke="#FFD700" strokeWidth="2" fill="none" strokeLinecap="round"/>
      )}
      {acc === "bandana" && (
        <path d="M22 44 Q44 36 66 44 L64 50 Q44 42 24 50 Z" fill={hairCol} opacity="0.85"/>
      )}
      {acc === "hoop" && (
        <circle cx="24" cy="52" r="3" stroke="#FFD700" strokeWidth="1.5" fill="none"/>
      )}

      {/* ── Crown (when king) ── */}
      {isKing && (
        <g>
          <path
            d="M26 34 L26 22 L36 30 L44 14 L52 30 L62 22 L62 34 Z"
            fill={crownColor}
            stroke={critical ? "#FF8877" : "#FFE566"}
            strokeWidth="1"
          />
          <circle cx="44" cy="18" r="3" fill={critical ? "#FF2200" : "#FF4444"}/>
          <circle cx="32" cy="26" r="2" fill={critical ? "#FF5500" : "#29B6F6"}/>
          <circle cx="56" cy="26" r="2" fill={critical ? "#FF5500" : "#00C853"}/>
        </g>
      )}
    </svg>
  );
}
