/**
 * YOINK.GG — Shop Category SVG Illustrations
 *
 * Four hero illustrations — one per shop tab.
 * Plus individual item preview glyphs for the shop cards.
 * All inline React SVG. Zero deps, zero API, instant render.
 */

import type { SVGProps } from "react";

type SvgProps = SVGProps<SVGSVGElement> & { size?: number };

// ─── COSMETICS hero: paint palette + magic wand ───────────────────────────────
export function CosmeticsArt({ size = 140, ...p }: SvgProps) {
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="cg" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="#FFD700" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="70" cy="70" r="58" fill="url(#cg)"/>
      {/* palette body */}
      <path d="M36 58 Q34 36 54 28 Q72 22 88 34 Q104 46 98 64 Q94 78 80 80 Q74 82 72 76 Q68 68 60 72 Q48 76 44 70 Q38 68 36 58Z"
        fill="#1a1208" stroke="#FFD700" strokeWidth="1.5"/>
      {/* colour dabs */}
      <circle cx="54" cy="38" r="6" fill="#FF2200"/>
      <circle cx="70" cy="32" r="6" fill="#FFD700"/>
      <circle cx="86" cy="40" r="6" fill="#00E676"/>
      <circle cx="94" cy="56" r="6" fill="#29B6F6"/>
      <circle cx="88" cy="72" r="5" fill="#7000FF"/>
      <circle cx="46" cy="66" r="5" fill="#FF9900"/>
      {/* thumb hole */}
      <ellipse cx="62" cy="74" rx="7" ry="5" fill="#0d0d18" stroke="#FFD700" strokeWidth="1"/>
      {/* magic wand */}
      <line x1="96" y1="86" x2="118" y2="108" stroke="#FFE566" strokeWidth="3" strokeLinecap="round"/>
      <polygon points="96,86 88,90 92,82" fill="#FFD700"/>
      {/* sparkles */}
      {[[104,74],[112,82],[100,90]].map(([x,y],i)=>(
        <g key={i}>
          <line x1={x} y1={y-4} x2={x} y2={y+4} stroke="#FFE566" strokeWidth="1.2"/>
          <line x1={x-4} y1={y} x2={x+4} y2={y} stroke="#FFE566" strokeWidth="1.2"/>
        </g>
      ))}
    </svg>
  );
}

// ─── UTILITY hero: wrench + shield + lock ─────────────────────────────────────
export function UtilityArt({ size = 140, ...p }: SvgProps) {
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="ug" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#00E676" stopOpacity="0.22"/>
          <stop offset="100%" stopColor="#00E676" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="70" cy="70" r="58" fill="url(#ug)"/>
      {/* shield */}
      <path d="M40 44 L100 44 L100 80 Q100 106 70 116 Q40 106 40 80 Z"
        fill="#0d2010" stroke="#00E676" strokeWidth="1.8"/>
      <path d="M50 52 L90 52 L90 80 Q90 100 70 108 Q50 100 50 80 Z"
        fill="#112816" stroke="#00E676" strokeWidth="1" opacity="0.6"/>
      {/* wrench */}
      <path d="M56 98 L76 60 Q82 50 90 54 Q86 62 82 62 L62 98 Q60 102 56 100 Z"
        fill="#00E676" opacity="0.9"/>
      <circle cx="88" cy="56" r="6" fill="#00E676" stroke="#00c853" strokeWidth="1"/>
      <circle cx="58" cy="96" r="5" fill="#00E676" stroke="#00c853" strokeWidth="1"/>
      {/* lock */}
      <rect x="60" y="72" width="20" height="16" rx="3" fill="#0d2010" stroke="#00E676" strokeWidth="1.5"/>
      <path d="M64 72 Q64 62 70 62 Q76 62 76 72" stroke="#00E676" strokeWidth="2" fill="none"/>
      <circle cx="70" cy="80" r="3" fill="#00E676"/>
      {/* keyhole */}
      <line x1="70" y1="80" x2="70" y2="85" stroke="#0d2010" strokeWidth="1.5"/>
    </svg>
  );
}

// ─── POWER-UPS hero: lightning bolt in explosion ──────────────────────────────
export function PowerUpsArt({ size = 140, ...p }: SvgProps) {
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="pow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#FF9900" stopOpacity="0.35"/>
          <stop offset="60%" stopColor="#FF9900" stopOpacity="0.1"/>
          <stop offset="100%" stopColor="#FF9900" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="powcore" cx="45%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#FFE566"/>
          <stop offset="100%" stopColor="#FF6600"/>
        </radialGradient>
      </defs>
      {/* burst ring */}
      <circle cx="70" cy="70" r="56" fill="url(#pow)"/>
      {/* burst spikes */}
      {Array.from({length:12},(_,i)=>{
        const a = (i*30-90)*Math.PI/180;
        const r1=46, r2=58;
        return <line key={i}
          x1={70+r1*Math.cos(a)} y1={70+r1*Math.sin(a)}
          x2={70+r2*Math.cos(a)} y2={70+r2*Math.sin(a)}
          stroke="#FF9900" strokeWidth={i%2===0?"2.5":"1.5"} strokeLinecap="round" opacity="0.7"/>;
      })}
      {/* explosion shape */}
      <path d="M70 20 L76 52 L104 42 L82 64 L114 70 L82 76 L104 98 L76 88 L70 120 L64 88 L36 98 L58 76 L26 70 L58 64 L36 42 L64 52 Z"
        fill="url(#powcore)" stroke="#FFE566" strokeWidth="1"/>
      {/* lightning bolt center */}
      <path d="M68 48 L58 72 L68 72 L56 96 L80 66 L68 66 L78 48 Z"
        fill="#1a0800" stroke="#FFE566" strokeWidth="0.5"/>
    </svg>
  );
}

// ─── PASSES hero: VIP card + ticket ───────────────────────────────────────────
export function PassesArt({ size = 140, ...p }: SvgProps) {
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="psg" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#7000FF" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#7000FF" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="vipcard" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2a0060"/>
          <stop offset="100%" stopColor="#0d0020"/>
        </linearGradient>
        <linearGradient id="goldstrip" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFE566"/>
          <stop offset="50%" stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#FF9900"/>
        </linearGradient>
      </defs>
      <circle cx="70" cy="70" r="58" fill="url(#psg)"/>
      {/* back ticket (rotated) */}
      <g transform="rotate(-12 70 70)">
        <rect x="30" y="72" width="80" height="44" rx="6" fill="#1a0040" stroke="#4400CC" strokeWidth="1.5"/>
        <line x1="30" y1="86" x2="110" y2="86" stroke="#4400CC" strokeWidth="0.8" strokeDasharray="3 2"/>
        {/* notch cuts */}
        <circle cx="30" cy="86" r="5" fill="#0d0d18"/>
        <circle cx="110" cy="86" r="5" fill="#0d0d18"/>
        <text x="70" y="104" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="#7000FF" letterSpacing="3">JACKPOT TICKET</text>
      </g>
      {/* front VIP card */}
      <rect x="24" y="36" width="92" height="58" rx="8" fill="url(#vipcard)" stroke="#7000FF" strokeWidth="1.8"/>
      {/* gold chip */}
      <rect x="36" y="50" width="24" height="18" rx="3" fill="url(#goldstrip)"/>
      <line x1="44" y1="50" x2="44" y2="68" stroke="#CC8800" strokeWidth="0.8"/>
      <line x1="52" y1="50" x2="52" y2="68" stroke="#CC8800" strokeWidth="0.8"/>
      <line x1="36" y1="58" x2="60" y2="58" stroke="#CC8800" strokeWidth="0.8"/>
      {/* VIP text */}
      <text x="94" y="58" textAnchor="end" fontFamily="monospace" fontSize="14" fontWeight="bold" fill="#7000FF" letterSpacing="2">VIP</text>
      {/* card number */}
      <text x="38" y="84" fontFamily="monospace" fontSize="7" fill="#7000FF" letterSpacing="2" opacity="0.7">**** **** 4269</text>
      {/* crown watermark */}
      <path d="M76 44 L78 40 L80 44 L82 40 L84 44 L84 48 L76 48 Z" fill="#7000FF" opacity="0.15"/>
    </svg>
  );
}

// ─── Founding King NFT art ────────────────────────────────────────────────────
export function FoundingKingArt({ size = 160, ...p }: SvgProps) {
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="fkg" cx="50%" cy="40%" r="58%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.6"/>
          <stop offset="60%" stopColor="#FF9900" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="#FF9900" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="fkcrown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE566"/>
          <stop offset="50%" stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#AA7700"/>
        </linearGradient>
        <filter id="fkglow">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx="80" cy="80" r="72" fill="url(#fkg)"/>
      {/* rays */}
      {Array.from({length:16},(_,i)=>{
        const a=(i*22.5-90)*Math.PI/180;
        return <line key={i}
          x1={80+52*Math.cos(a)} y1={80+52*Math.sin(a)}
          x2={80+68*Math.cos(a)} y2={80+68*Math.sin(a)}
          stroke="#FFD700" strokeWidth={i%2===0?"2":"1"} opacity="0.5"/>;
      })}
      {/* crown */}
      <path d="M32 90 L32 58 L54 72 L80 38 L106 72 L128 58 L128 90 Z"
        fill="url(#fkcrown)" stroke="#FFE566" strokeWidth="1.5" filter="url(#fkglow)"/>
      {/* base band */}
      <rect x="32" y="88" width="96" height="22" rx="4" fill="url(#fkcrown)" stroke="#FFE566" strokeWidth="1"/>
      {/* jewels on band */}
      {[48,64,80,96,112].map((x,i)=>(
        <circle key={i} cx={x} cy="99" r="4"
          fill={["#FF1744","#7000FF","#FFD700","#00C853","#29B6F6"][i]}
          stroke="#FFE566" strokeWidth="0.8"/>
      ))}
      {/* center ruby */}
      <circle cx="80" cy="60" r="10" fill="#FF1744" stroke="#FFE566" strokeWidth="1.5" filter="url(#fkglow)"/>
      <circle cx="77" cy="57" r="3" fill="white" opacity="0.4"/>
      {/* side gems */}
      <circle cx="48" cy="70" r="7" fill="#2979FF" stroke="#FFE566" strokeWidth="1.2"/>
      <circle cx="112" cy="70" r="7" fill="#00C853" stroke="#FFE566" strokeWidth="1.2"/>
      {/* sparkles */}
      {[[60,42],[100,42],[38,58],[122,58],[34,78],[126,78]].map(([x,y],i)=>(
        <g key={i}>
          <line x1={x} y1={y-4} x2={x} y2={y+4} stroke="#FFE566" strokeWidth="1.5"/>
          <line x1={x-4} y1={y} x2={x+4} y2={y} stroke="#FFE566" strokeWidth="1.5"/>
        </g>
      ))}
      <text x="80" y="128" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="#FFD700" letterSpacing="2" fontWeight="bold">FOUNDING KING</text>
      <text x="80" y="140" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="#FF9900" letterSpacing="1">100 ONLY · FOREVER</text>
    </svg>
  );
}

// ─── Shop category map ────────────────────────────────────────────────────────
export const SHOP_CATEGORY_ART = {
  cosmetics: CosmeticsArt,
  utility:   UtilityArt,
  powerups:  PowerUpsArt,
  passes:    PassesArt,
} as const;
