/**
 * YOINK.GG — Win Reveal SVG Artwork
 *
 * Three pieces:
 *   WinTrophy    — animated gold trophy with crown on top
 *   WinBagArt    — the bag bursting open with coins
 *   WinCrownArt  — large ornate crown for the YOU WON screen
 *
 * All inline React SVG. Animations via CSS keyframes only (no Framer on SVGs).
 * will-change: transform / opacity on animated elements.
 */

import type { SVGProps } from "react";

type SvgProps = SVGProps<SVGSVGElement> & { size?: number };

// ─── Trophy ───────────────────────────────────────────────────────────────────
export function WinTrophy({ size = 160, ...p }: SvgProps) {
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="wtrg" cx="50%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#FFE566" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="#FF9900" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="wtroph" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE566"/>
          <stop offset="40%" stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#AA6600"/>
        </linearGradient>
        <linearGradient id="wtbase" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#884400"/>
        </linearGradient>
      </defs>
      {/* glow */}
      <circle cx="80" cy="75" r="62" fill="url(#wtrg)"/>
      {/* handles */}
      <path d="M46 60 Q30 60 30 78 Q30 96 46 92" stroke="url(#wtroph)" strokeWidth="8" fill="none" strokeLinecap="round"/>
      <path d="M114 60 Q130 60 130 78 Q130 96 114 92" stroke="url(#wtroph)" strokeWidth="8" fill="none" strokeLinecap="round"/>
      {/* cup body */}
      <path d="M46 40 L46 92 Q46 110 80 114 Q114 110 114 92 L114 40 Z"
        fill="url(#wtroph)" stroke="#FFE566" strokeWidth="1"/>
      {/* cup shine */}
      <path d="M54 46 Q56 76 54 88" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.25"/>
      {/* inner shadow */}
      <path d="M60 40 L60 112 Q68 116 80 116 L80 40 Z" fill="#AA6600" opacity="0.2"/>
      {/* base stem */}
      <rect x="70" y="114" width="20" height="12" rx="2" fill="url(#wtbase)"/>
      {/* base plate */}
      <rect x="56" y="124" width="48" height="10" rx="4" fill="url(#wtbase)" stroke="#FFD700" strokeWidth="1"/>
      {/* star on cup */}
      <polygon points="80,54 83,64 94,64 85,71 88,81 80,75 72,81 75,71 66,64 77,64"
        fill="#FF9900" stroke="#FFE566" strokeWidth="0.8"/>
      {/* crown on top */}
      <path d="M64 40 L67 30 L72 36 L80 22 L88 36 L93 30 L96 40 Z"
        fill="#FFD700" stroke="#FFE566" strokeWidth="1"/>
      <circle cx="80" cy="26" r="4" fill="#FF1744" stroke="#FFE566" strokeWidth="0.8"/>
      <circle cx="68" cy="33" r="3" fill="#2979FF" stroke="#FFE566" strokeWidth="0.8"/>
      <circle cx="92" cy="33" r="3" fill="#00C853" stroke="#FFE566" strokeWidth="0.8"/>
    </svg>
  );
}

// ─── Bag Burst ────────────────────────────────────────────────────────────────
export function WinBagArt({ size = 160, ...p }: SvgProps) {
  const coins = [
    { x: 40,  y: 42, r: 10, col: "#FFD700" },
    { x: 110, y: 38, r: 8,  col: "#FFE566" },
    { x: 28,  y: 72, r: 7,  col: "#FF9900" },
    { x: 124, y: 68, r: 9,  col: "#FFD700" },
    { x: 50,  y: 30, r: 6,  col: "#FFE566" },
    { x: 98,  y: 28, r: 7,  col: "#FF9900" },
    { x: 72,  y: 18, r: 8,  col: "#FFD700" },
  ];
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="wbg" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#FF9900" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="wbag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a3000"/>
          <stop offset="100%" stopColor="#1a1206"/>
        </linearGradient>
      </defs>
      <circle cx="80" cy="90" r="62" fill="url(#wbg)"/>
      {/* flying coins */}
      {coins.map((c,i)=>(
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={c.r} fill={c.col} stroke="#FFE566" strokeWidth="0.8"/>
          <ellipse cx={c.x-c.r*0.3} cy={c.y-c.r*0.3} rx={c.r*0.3} ry={c.r*0.2} fill="white" opacity="0.35"/>
          <text x={c.x} y={c.y+c.r*0.35} textAnchor="middle" fontSize={c.r*0.9} fill="#AA6600" fontFamily="monospace" fontWeight="bold">◎</text>
        </g>
      ))}
      {/* bag body */}
      <path d="M46 100 Q40 72 54 62 Q62 56 72 58 L80 60 L88 58 Q98 56 106 62 Q120 72 114 100 Q110 126 80 130 Q50 126 46 100 Z"
        fill="url(#wbag)" stroke="#FFD700" strokeWidth="1.8"/>
      {/* bag tie / burst seam */}
      <path d="M62 60 Q70 52 80 58 Q90 52 98 60"
        stroke="#FFD700" strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* bag rip */}
      <path d="M66 66 L72 58 L80 66 L88 58 L94 66"
        stroke="#FFE566" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7"/>
      {/* coin pile in bag */}
      <ellipse cx="80" cy="108" rx="22" ry="10" fill="#CC8800" opacity="0.5"/>
      {[68,76,84,92].map((x,i)=>(
        <circle key={i} cx={x} cy={104+i%2*4} r="7" fill="#FFD700" stroke="#AA6600" strokeWidth="0.8"/>
      ))}
      {/* SOL symbol */}
      <text x="80" y="100" textAnchor="middle" fontFamily="monospace" fontSize="22" fontWeight="bold" fill="#FFE566" opacity="0.9">◎</text>
    </svg>
  );
}

// ─── Ornate Crown (main win reveal hero) ──────────────────────────────────────
export function WinCrownArt({ size = 200, ...p }: SvgProps) {
  return (
    <svg viewBox="0 0 200 180" width={size} height={size} fill="none" {...p}>
      <defs>
        <radialGradient id="wcg" cx="50%" cy="50%" r="58%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.55"/>
          <stop offset="55%" stopColor="#FF9900" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="#FF9900" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="wccrown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE566"/>
          <stop offset="45%" stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#884400"/>
        </linearGradient>
        <linearGradient id="wcband" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#662200"/>
        </linearGradient>
        <filter id="wcglow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* outer glow halo */}
      <ellipse cx="100" cy="110" rx="88" ry="60" fill="url(#wcg)"/>
      {/* rays */}
      {Array.from({length:20},(_,i)=>{
        const a=(i*18-90)*Math.PI/180;
        const [r1,r2]=[68,84];
        return <line key={i}
          x1={100+r1*Math.cos(a)} y1={110+r1*Math.sin(a)}
          x2={100+r2*Math.cos(a)} y2={110+r2*Math.sin(a)}
          stroke="#FFD700" strokeWidth={i%2===0?"2":"1"} opacity="0.4"/>;
      })}
      {/* crown body */}
      <path d="M22 118 L22 72 L52 92 L76 44 L100 22 L124 44 L148 92 L178 72 L178 118 Z"
        fill="url(#wccrown)" stroke="#FFE566" strokeWidth="1.5" filter="url(#wcglow)"/>
      {/* band */}
      <rect x="22" y="116" width="156" height="28" rx="5"
        fill="url(#wcband)" stroke="#FFE566" strokeWidth="1.2"/>
      {/* band jewels */}
      {[42,66,90,100,110,134,158].map((x,i)=>(
        <circle key={i} cx={x} cy="130" r={i===3?6:4.5}
          fill={["#FF1744","#7000FF","#00C853","#FFD700","#2979FF","#FF9900","#FF1744"][i]}
          stroke="#FFE566" strokeWidth="0.8"/>
      ))}
      {/* fleur top spires */}
      {[100].map((cx)=>(
        <g key={cx}>
          <path d={`M${cx} 22 Q${cx-4} 12 ${cx} 6 Q${cx+4} 12 ${cx} 22`} fill="#FFD700"/>
          <path d={`M${cx-6} 20 Q${cx-10} 10 ${cx-6} 6 Q${cx-2} 10 ${cx-6} 20`} fill="#FFD700" opacity="0.8"/>
          <path d={`M${cx+6} 20 Q${cx+10} 10 ${cx+6} 6 Q${cx+2} 10 ${cx+6} 20`} fill="#FFD700" opacity="0.8"/>
        </g>
      ))}
      {/* center ruby */}
      <circle cx="100" cy="56" r="14" fill="#FF1744" stroke="#FFE566" strokeWidth="1.8" filter="url(#wcglow)"/>
      <ellipse cx="95" cy="51" rx="4" ry="3" fill="white" opacity="0.35"/>
      {/* left amethyst */}
      <circle cx="62" cy="78" r="10" fill="#7000FF" stroke="#FFE566" strokeWidth="1.2"/>
      <ellipse cx="59" cy="75" rx="3" ry="2" fill="white" opacity="0.3"/>
      {/* right emerald */}
      <circle cx="138" cy="78" r="10" fill="#00C853" stroke="#FFE566" strokeWidth="1.2"/>
      <ellipse cx="135" cy="75" rx="3" ry="2" fill="white" opacity="0.3"/>
      {/* sparkles */}
      {[[76,36],[124,36],[46,60],[154,60],[28,90],[172,90]].map(([x,y],i)=>(
        <g key={i}>
          <line x1={x} y1={y-5} x2={x} y2={y+5} stroke="#FFE566" strokeWidth="1.5" opacity="0.8"/>
          <line x1={x-5} y1={y} x2={x+5} y2={y} stroke="#FFE566" strokeWidth="1.5" opacity="0.8"/>
          <line x1={x-3} y1={y-3} x2={x+3} y2={y+3} stroke="#FFE566" strokeWidth="1" opacity="0.5"/>
          <line x1={x+3} y1={y-3} x2={x-3} y2={y+3} stroke="#FFE566" strokeWidth="1" opacity="0.5"/>
        </g>
      ))}
    </svg>
  );
}
