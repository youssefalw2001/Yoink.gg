/**
 * YOINK.GG — Rank SVG Illustrations
 *
 * 10 unique hand-crafted SVG artworks, one per rank.
 * All inline React — zero network requests, zero cost, instant render.
 *
 * Each illustration is 120×120 viewBox, designed to work at any size.
 * Uses the rank's accent color as the primary palette.
 */

import type { SVGProps } from "react";

interface RankArtProps {
  level: number;
  size?: number;
  className?: string;
}

// ─── Rank 1 — Peasant: broken coin on cracked earth ──────────────────────────
function PeasantArt({ size = 120, ...p }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="pg1" cx="50%" cy="60%" r="50%">
          <stop offset="0%" stopColor="#3a3f4f" />
          <stop offset="100%" stopColor="#1a1c26" />
        </radialGradient>
      </defs>
      {/* cracked earth */}
      <ellipse cx="60" cy="88" rx="46" ry="12" fill="#2a2d3a" />
      <path d="M30 88 L45 72 L52 80 L60 68 L68 78 L76 70 L90 88" stroke="#3a3f4f" strokeWidth="1.5" fill="none"/>
      {/* broken coin halves */}
      <path d="M42 58 A22 22 0 0 1 64 36 L64 58 Z" fill="#4a4f60" stroke="#8892a4" strokeWidth="1"/>
      <path d="M78 58 A22 22 0 0 1 56 36 L56 58 Z" fill="#3a3f4f" stroke="#8892a4" strokeWidth="1"/>
      {/* crack */}
      <path d="M60 36 L57 46 L63 52 L59 58" stroke="#8892a4" strokeWidth="1.5" strokeLinecap="round"/>
      {/* label */}
      <text x="60" y="106" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="#8892a4" letterSpacing="2">PEASANT</text>
    </svg>
  );
}

// ─── Rank 2 — Pickpocket: quick hand stealing a coin ─────────────────────────
function PickpocketArt({ size = 120, ...p }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="pkg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00E676" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00E676" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="55" r="38" fill="url(#pkg)" />
      {/* coin */}
      <circle cx="72" cy="44" r="14" fill="#00c853" stroke="#00E676" strokeWidth="1.5" />
      <text x="72" y="49" textAnchor="middle" fontFamily="monospace" fontSize="11" fontWeight="bold" fill="#00E676">$</text>
      {/* hand/fingers */}
      <path d="M28 72 Q32 52 44 50 L52 54" stroke="#00E676" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M52 54 L58 42 Q60 38 64 40 Q66 42 63 46 L62 50" stroke="#00E676" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M52 54 L56 40 Q58 36 62 38 Q64 40 61 44" stroke="#00E676" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M52 54 L54 42 Q55 38 59 39 Q61 41 59 45" stroke="#00E676" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      {/* motion lines */}
      <path d="M80 36 L88 32 M82 42 L91 40 M80 48 L89 49" stroke="#00E676" strokeWidth="1" strokeOpacity="0.5" strokeLinecap="round"/>
      <text x="60" y="106" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="#00E676" letterSpacing="2">PICKPOCKET</text>
    </svg>
  );
}

// ─── Rank 3 — Thief: masked figure with dagger ────────────────────────────────
function ThiefArt({ size = 120, ...p }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="tg" cx="50%" cy="45%" r="45%">
          <stop offset="0%" stopColor="#29B6F6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#29B6F6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="50" r="36" fill="url(#tg)" />
      {/* hood/cloak */}
      <path d="M38 90 Q38 58 60 46 Q82 58 82 90 Z" fill="#1a2a3a" stroke="#29B6F6" strokeWidth="1.2"/>
      {/* mask */}
      <ellipse cx="60" cy="52" rx="14" ry="11" fill="#0d1520" stroke="#29B6F6" strokeWidth="1.2"/>
      {/* eyes */}
      <ellipse cx="55" cy="51" rx="2.5" ry="2" fill="#29B6F6"/>
      <ellipse cx="65" cy="51" rx="2.5" ry="2" fill="#29B6F6"/>
      {/* dagger */}
      <path d="M76 62 L90 34 L94 38 Z" fill="#29B6F6" stroke="#29B6F6" strokeWidth="0.5"/>
      <path d="M90 34 L94 38 L92 36 Z" fill="#87CEEB"/>
      <rect x="74" y="61" width="5" height="3" rx="1" fill="#8892a4"/>
      <text x="60" y="106" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="#29B6F6" letterSpacing="2">THIEF</text>
    </svg>
  );
}

// ─── Rank 4 — Bandit: skull with crossed bones ────────────────────────────────
function BanditArt({ size = 120, ...p }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="bg2" cx="50%" cy="50%" r="48%">
          <stop offset="0%" stopColor="#FFA726" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#FFA726" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="52" r="36" fill="url(#bg2)" />
      {/* crossed bones */}
      <line x1="32" y1="78" x2="88" y2="32" stroke="#FFA726" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.4"/>
      <line x1="88" y1="78" x2="32" y2="32" stroke="#FFA726" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.4"/>
      {/* skull */}
      <ellipse cx="60" cy="50" rx="18" ry="16" fill="#1a1c26" stroke="#FFA726" strokeWidth="1.5"/>
      <rect x="50" y="62" width="20" height="10" rx="2" fill="#1a1c26" stroke="#FFA726" strokeWidth="1.2"/>
      {/* teeth */}
      {[52,56,60,64,68].map((x, i) => (
        <rect key={i} x={x} y="64" width="2.5" height="5" rx="0.5" fill="#FFA726" opacity="0.8"/>
      ))}
      {/* eyes */}
      <ellipse cx="53" cy="49" rx="4" ry="4.5" fill="#FFA726" opacity="0.9"/>
      <ellipse cx="67" cy="49" rx="4" ry="4.5" fill="#FFA726" opacity="0.9"/>
      <ellipse cx="53" cy="49" rx="2" ry="2.5" fill="#1a1c26"/>
      <ellipse cx="67" cy="49" rx="2" ry="2.5" fill="#1a1c26"/>
      <text x="60" y="106" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="#FFA726" letterSpacing="2">BANDIT</text>
    </svg>
  );
}

// ─── Rank 5 — Outlaw: wanted poster star badge ────────────────────────────────
function OutlawArt({ size = 120, ...p }: SVGProps<SVGSVGElement> & { size?: number }) {
  // 5-pointed star path
  const star = (cx: number, cy: number, r1: number, r2: number) => {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 === 0 ? r1 : r2;
      const a = (i * 36 - 90) * (Math.PI / 180);
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    });
    return `M${pts.join("L")}Z`;
  };
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="og" cx="50%" cy="50%" r="48%">
          <stop offset="0%" stopColor="#EF5350" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#EF5350" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="52" r="36" fill="url(#og)" />
      {/* wanted poster */}
      <rect x="34" y="28" width="52" height="62" rx="3" fill="#1a1208" stroke="#EF5350" strokeWidth="1.5"/>
      <text x="60" y="42" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="#EF5350" letterSpacing="1">WANTED</text>
      {/* star badge */}
      <path d={star(60, 58, 16, 7)} fill="#EF5350" stroke="#ff8a80" strokeWidth="0.8"/>
      <path d={star(60, 58, 10, 4)} fill="#1a1208"/>
      <text x="60" y="61" textAnchor="middle" fontFamily="monospace" fontSize="6" fill="#EF5350">LAW</text>
      <text x="60" y="80" textAnchor="middle" fontFamily="monospace" fontSize="6" fill="#EF5350" letterSpacing="1">DEAD OR ALIVE</text>
      <text x="60" y="106" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="#EF5350" letterSpacing="2">OUTLAW</text>
    </svg>
  );
}

// ─── Rank 6 — Warlord: armored helmet with horns ─────────────────────────────
function WarlordArt({ size = 120, ...p }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="wg" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#AB47BC" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#AB47BC" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wmet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6a2080"/>
          <stop offset="100%" stopColor="#3a0d4a"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="52" r="40" fill="url(#wg)" />
      {/* horns */}
      <path d="M40 46 Q30 20 36 14 Q42 22 44 40" fill="url(#wmet)" stroke="#AB47BC" strokeWidth="1"/>
      <path d="M80 46 Q90 20 84 14 Q78 22 76 40" fill="url(#wmet)" stroke="#AB47BC" strokeWidth="1"/>
      {/* helmet */}
      <path d="M36 64 Q36 36 60 34 Q84 36 84 64 L80 74 Q70 82 50 82 Z" fill="url(#wmet)" stroke="#AB47BC" strokeWidth="1.5"/>
      {/* visor slit */}
      <path d="M44 58 L76 58" stroke="#AB47BC" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
      <path d="M44 64 L76 64" stroke="#AB47BC" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
      {/* eye glow */}
      <ellipse cx="52" cy="54" rx="4" ry="2.5" fill="#AB47BC" opacity="0.9"/>
      <ellipse cx="68" cy="54" rx="4" ry="2.5" fill="#AB47BC" opacity="0.9"/>
      {/* cheek guards */}
      <path d="M36 64 Q34 72 40 78 Q50 82 50 82" fill="#4a0060" stroke="#AB47BC" strokeWidth="1"/>
      <path d="M84 64 Q86 72 80 78 Q70 82 70 82" fill="#4a0060" stroke="#AB47BC" strokeWidth="1"/>
      <text x="60" y="106" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="#AB47BC" letterSpacing="2">WARLORD</text>
    </svg>
  );
}

// ─── Rank 7 — Baron: coat of arms on shield ───────────────────────────────────
function BaronArt({ size = 120, ...p }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="barg" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#7E57C2" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#7E57C2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bshield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d2080"/>
          <stop offset="100%" stopColor="#1a0d40"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="52" r="38" fill="url(#barg)" />
      {/* shield */}
      <path d="M34 30 L86 30 L86 64 Q86 82 60 92 Q34 82 34 64 Z" fill="url(#bshield)" stroke="#7E57C2" strokeWidth="1.8"/>
      {/* dividing cross */}
      <line x1="60" y1="30" x2="60" y2="92" stroke="#7E57C2" strokeWidth="1.5" opacity="0.5"/>
      <line x1="34" y1="58" x2="86" y2="58" stroke="#7E57C2" strokeWidth="1.5" opacity="0.5"/>
      {/* quarters: lions/eagles */}
      <text x="47" y="50" textAnchor="middle" fontSize="16" fill="#7E57C2">♞</text>
      <text x="73" y="50" textAnchor="middle" fontSize="16" fill="#7E57C2">⚜</text>
      <text x="47" y="76" textAnchor="middle" fontSize="16" fill="#7E57C2">⚜</text>
      <text x="73" y="76" textAnchor="middle" fontSize="16" fill="#7E57C2">♞</text>
      {/* crown on top */}
      <path d="M50 30 L54 22 L60 28 L66 22 L70 30" fill="#7E57C2" stroke="#9c8ae0" strokeWidth="1"/>
      <text x="60" y="106" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="#7E57C2" letterSpacing="2">BARON</text>
    </svg>
  );
}

// ─── Rank 8 — Duke: ornate signet ring ────────────────────────────────────────
function DukeArt({ size = 120, ...p }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="dg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#26C6DA" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#26C6DA" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dgem" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#80DEEA"/>
          <stop offset="100%" stopColor="#00838F"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="55" r="38" fill="url(#dg)" />
      {/* ring band */}
      <path d="M38 72 Q38 86 60 88 Q82 86 82 72 L80 62 Q80 74 60 76 Q40 74 40 62 Z" fill="#0d3340" stroke="#26C6DA" strokeWidth="1.5"/>
      {/* ring top setting */}
      <rect x="42" y="34" width="36" height="32" rx="6" fill="#0d3340" stroke="#26C6DA" strokeWidth="1.8"/>
      {/* gem */}
      <polygon points="60,38 72,46 68,56 52,56 48,46" fill="url(#dgem)" stroke="#80DEEA" strokeWidth="1"/>
      {/* gem facets */}
      <line x1="60" y1="38" x2="60" y2="56" stroke="#80DEEA" strokeWidth="0.5" opacity="0.6"/>
      <line x1="48" y1="46" x2="72" y2="46" stroke="#80DEEA" strokeWidth="0.5" opacity="0.6"/>
      <line x1="52" y1="56" x2="60" y2="38" stroke="#80DEEA" strokeWidth="0.5" opacity="0.4"/>
      <line x1="68" y1="56" x2="60" y2="38" stroke="#80DEEA" strokeWidth="0.5" opacity="0.4"/>
      {/* sparkle */}
      <circle cx="54" cy="43" r="1.5" fill="white" opacity="0.8"/>
      <text x="60" y="106" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="#26C6DA" letterSpacing="2">DUKE</text>
    </svg>
  );
}

// ─── Rank 9 — Prince: ornate sceptre ─────────────────────────────────────────
function PrinceArt({ size = 120, ...p }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="prg" cx="50%" cy="30%" r="55%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="prsceptre" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFE566"/>
          <stop offset="50%" stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#FF9900"/>
        </linearGradient>
        <radialGradient id="prorb" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#FFE566"/>
          <stop offset="100%" stopColor="#FF6600"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="52" r="40" fill="url(#prg)" />
      {/* sceptre staff */}
      <rect x="58" y="42" width="4" height="52" rx="2" fill="url(#prsceptre)"/>
      {/* orb */}
      <circle cx="60" cy="38" r="16" fill="url(#prorb)" stroke="#FFE566" strokeWidth="1.5"/>
      {/* orb cross */}
      <line x1="60" y1="26" x2="60" y2="50" stroke="#FFE566" strokeWidth="1.2" opacity="0.6"/>
      <line x1="48" y1="38" x2="72" y2="38" stroke="#FFE566" strokeWidth="1.2" opacity="0.6"/>
      {/* fleur-de-lis top */}
      <path d="M60 22 Q56 16 60 12 Q64 16 60 22" fill="#FFD700"/>
      <path d="M55 20 Q50 14 54 10 Q58 13 55 20" fill="#FFD700" opacity="0.8"/>
      <path d="M65 20 Q70 14 66 10 Q62 13 65 20" fill="#FFD700" opacity="0.8"/>
      {/* sceptre base */}
      <ellipse cx="60" cy="92" rx="7" ry="4" fill="#FF9900" stroke="#FFD700" strokeWidth="1"/>
      {/* sparkles */}
      {[[44,30],[76,30],[44,48],[76,46]].map(([x,y],i) => (
        <g key={i}>
          <line x1={x} y1={y-3} x2={x} y2={y+3} stroke="#FFE566" strokeWidth="1" opacity="0.7"/>
          <line x1={x-3} y1={y} x2={x+3} y2={y} stroke="#FFE566" strokeWidth="1" opacity="0.7"/>
        </g>
      ))}
      <text x="60" y="106" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="#FFD700" letterSpacing="2">PRINCE</text>
    </svg>
  );
}

// ─── Rank 10 — The King: full crown with jewels ────────────────────────────────
function TheKingArt({ size = 120, ...p }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="kg" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#FF9900" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#FF9900" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="kcrown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE566"/>
          <stop offset="50%" stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#CC8800"/>
        </linearGradient>
        <filter id="kglow">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* outer glow */}
      <circle cx="60" cy="52" r="42" fill="url(#kg)" />
      {/* crown base band */}
      <rect x="28" y="66" width="64" height="16" rx="3" fill="url(#kcrown)" />
      {/* ermine / band details */}
      {[32,40,48,56,64,72,80].map((x, i) => (
        <circle key={i} cx={x} cy="74" r="2.5" fill="#CC8800" opacity="0.5"/>
      ))}
      {/* crown spires */}
      <path d="M28 66 L28 42 L44 56 L60 28 L76 56 L92 42 L92 66 Z" fill="url(#kcrown)" stroke="#FFE566" strokeWidth="1" filter="url(#kglow)"/>
      {/* center jewel — ruby */}
      <circle cx="60" cy="46" r="7" fill="#FF1744" stroke="#FFE566" strokeWidth="1.5"/>
      <circle cx="57" cy="43" r="2" fill="white" opacity="0.4"/>
      {/* left jewel — sapphire */}
      <circle cx="37" cy="54" r="5" fill="#2979FF" stroke="#FFE566" strokeWidth="1.2"/>
      <circle cx="35" cy="52" r="1.5" fill="white" opacity="0.4"/>
      {/* right jewel — emerald */}
      <circle cx="83" cy="54" r="5" fill="#00C853" stroke="#FFE566" strokeWidth="1.2"/>
      <circle cx="81" cy="52" r="1.5" fill="white" opacity="0.4"/>
      {/* sparkle rays from center */}
      {[0,45,90,135,180,225,270,315].map((deg, i) => {
        const r = Math.PI * deg / 180;
        const x1 = 60 + 9 * Math.cos(r), y1 = 46 + 9 * Math.sin(r);
        const x2 = 60 + 16 * Math.cos(r), y2 = 46 + 16 * Math.sin(r);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFE566" strokeWidth="1" opacity="0.7"/>;
      })}
      <text x="60" y="106" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="#FFD700" letterSpacing="1" fontWeight="bold">THE KING</text>
    </svg>
  );
}

// ─── Export map ───────────────────────────────────────────────────────────────

const ART_MAP: Record<number, React.ComponentType<SVGProps<SVGSVGElement> & { size?: number }>> = {
  1:  PeasantArt,
  2:  PickpocketArt,
  3:  ThiefArt,
  4:  BanditArt,
  5:  OutlawArt,
  6:  WarlordArt,
  7:  BaronArt,
  8:  DukeArt,
  9:  PrinceArt,
  10: TheKingArt,
};

export function RankArt({ level, size = 120, className }: RankArtProps) {
  const Component = ART_MAP[Math.min(Math.max(level, 1), 10)];
  return <Component size={size} className={className} />;
}

export {
  PeasantArt, PickpocketArt, ThiefArt, BanditArt, OutlawArt,
  WarlordArt, BaronArt, DukeArt, PrinceArt, TheKingArt,
};
