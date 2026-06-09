/**
 * YOINK.GG — Custom Brand Icon Set
 *
 * Replaces generic lucide icons with on-brand custom SVGs
 * for every key game concept:
 *
 *   BagIcon          — coin bag (the core game object)
 *   CrownDaggerIcon  — king crown with dagger points (compact)
 *   YoinkFistIcon    — fist grabbing a bag
 *   SolCoinIcon      — Solana-style coin with ◎ mark
 *   TimerRingIcon    — countdown ring for stats
 *   DrainIcon        — liquid draining from bag (house drain)
 *   ShieldCoolIcon   — shield with clock (anti-snipe protection)
 *   FlameKingIcon    — flame with crown (king on fire)
 *   ThroneSeatIcon   — throne silhouette
 *   ChainLinkIcon    — chain link (chain of fallen)
 *   RakeIcon         — rake/percent (house rake)
 *   JackpotIcon      — slot machine star
 *
 * All icons: 24×24 viewBox default (matches lucide convention).
 * Use via: <BagIcon size={20} color="#FFD700" />
 */

interface BrandIconProps {
  size?: number;
  color?: string;
  className?: string;
  strokeWidth?: number;
}

const D = ({ children, size = 24, color = "currentColor", className, strokeWidth = 1.5 }: BrandIconProps & { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {children}
  </svg>
);

// ─── Bag ──────────────────────────────────────────────────────────────────────
export function BagIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      {/* knot */}
      <path d="M9 6 Q9 3 12 3 Q15 3 15 6" />
      {/* bag body */}
      <path d="M6 8 Q5 20 12 22 Q19 20 18 8 Z" />
      {/* coin symbol */}
      <text x="12" y="17" textAnchor="middle" fontSize="7" fontFamily="monospace" stroke="none" fill={p.color ?? "currentColor"} fontWeight="bold">◎</text>
    </D>
  );
}

// ─── Crown Dagger (compact) ───────────────────────────────────────────────────
export function CrownDaggerIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      <path d="M2 17 L2 11 L6 13 L8 5 L12 8 L12 3 L12 8 L16 5 L18 13 L22 11 L22 17" />
      {/* dagger points */}
      <path d="M6 17 L5 21 M12 17 L12 22 M18 17 L19 21" />
      {/* jewel */}
      <circle cx="12" cy="11" r="1.5" />
    </D>
  );
}

// ─── Yoink Fist (grabbing) ────────────────────────────────────────────────────
export function YoinkFistIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      {/* fist knuckles */}
      <rect x="5" y="10" width="14" height="7" rx="3" />
      {/* fingers */}
      <path d="M8 10 L8 7 Q8 5 10 5 Q12 5 12 7 L12 10" />
      <path d="M12 10 L12 6 Q12 4 14 4 Q16 4 16 6 L16 10" />
      <path d="M5 12 L4 12 Q2 12 2 10 Q2 8 4 8 L5 9" />
      {/* bag being grabbed */}
      <path d="M16 7 Q20 7 20 12 Q20 16 18 17" strokeDasharray="2 1" opacity="0.5" />
    </D>
  );
}

// ─── SOL Coin ─────────────────────────────────────────────────────────────────
export function SolCoinIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      <circle cx="12" cy="12" r="9" />
      {/* Solana ◎ inner ring */}
      <circle cx="12" cy="12" r="4" />
      {/* inner dot */}
      <circle cx="12" cy="12" r="1.5" fill={p.color ?? "currentColor"} stroke="none" />
      {/* shine */}
      <path d="M9 9 Q10 8 11 9" strokeWidth="1" opacity="0.5" />
    </D>
  );
}

// ─── Timer Ring ───────────────────────────────────────────────────────────────
export function TimerRingIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      <circle cx="12" cy="12" r="9" strokeDasharray="4 2" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 12 L12 8" strokeWidth="2" />
      <path d="M12 12 L15 12" />
      <circle cx="12" cy="12" r="1" fill={p.color ?? "currentColor"} stroke="none" />
    </D>
  );
}

// ─── Drain (liquid drip from bag) ─────────────────────────────────────────────
export function DrainIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      {/* bag top */}
      <path d="M8 5 Q8 3 12 3 Q16 3 16 5" />
      <path d="M7 7 Q6 13 12 14 Q18 13 17 7 Z" />
      {/* drip drops */}
      <path d="M12 14 L12 17" />
      <circle cx="12" cy="19" r="1.5" />
      <path d="M9 16 L9 18" opacity="0.5" />
      <circle cx="9" cy="20" r="1" opacity="0.5" />
      <path d="M15 16 L15 18" opacity="0.5" />
      <circle cx="15" cy="20" r="1" opacity="0.5" />
    </D>
  );
}

// ─── Shield Cool (anti-snipe) ─────────────────────────────────────────────────
export function ShieldCoolIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      <path d="M12 2 L20 5 L20 12 Q20 18 12 22 Q4 18 4 12 L4 5 Z" />
      {/* clock inside */}
      <circle cx="12" cy="12" r="4" />
      <path d="M12 10 L12 12 L14 12" />
    </D>
  );
}

// ─── Flame King ───────────────────────────────────────────────────────────────
export function FlameKingIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      {/* flame */}
      <path d="M12 2 Q8 6 9 10 Q7 9 7 7 Q4 10 5 14 Q5 19 12 22 Q19 19 19 14 Q20 10 17 7 Q17 9 15 10 Q16 6 12 2 Z" />
      {/* mini crown inside flame */}
      <path d="M9 15 L9 13 L11 14 L12 12 L13 14 L15 13 L15 15 Z" strokeWidth="0.8" />
    </D>
  );
}

// ─── Throne ───────────────────────────────────────────────────────────────────
export function ThroneSeatIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      {/* back */}
      <path d="M6 4 L6 16 M18 4 L18 16" />
      {/* top spires */}
      <path d="M5 4 L6 2 L7 4 M11 4 L12 1 L13 4 M17 4 L18 2 L19 4" />
      {/* seat */}
      <path d="M5 16 L19 16 L19 18 L5 18 Z" />
      {/* legs */}
      <path d="M7 18 L7 22 M17 18 L17 22" />
      {/* armrests */}
      <path d="M4 10 L6 10 M18 10 L20 10" />
    </D>
  );
}

// ─── Chain Link ───────────────────────────────────────────────────────────────
export function ChainLinkIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      <path d="M9 12 L5 12 Q2 12 2 9 Q2 6 5 6 L9 6 Q12 6 12 9" />
      <path d="M15 12 L19 12 Q22 12 22 15 Q22 18 19 18 L15 18 Q12 18 12 15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </D>
  );
}

// ─── Rake (house %) ───────────────────────────────────────────────────────────
export function RakeIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      {/* handle */}
      <line x1="12" y1="22" x2="12" y2="11" />
      {/* rake head */}
      <path d="M4 11 L20 11" />
      {/* tines */}
      <path d="M6 11 L5 7 M9 11 L9 7 M12 11 L12 7 M15 11 L15 7 M18 11 L19 7" />
      {/* percent */}
      <circle cx="8" cy="4" r="1.5" />
      <circle cx="16" cy="4" r="1.5" />
      <line x1="6" y1="6" x2="18" y2="2" />
    </D>
  );
}

// ─── Jackpot Star ─────────────────────────────────────────────────────────────
export function JackpotIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      {/* star */}
      <path d="M12 2 L14.5 9 L22 9 L16 13.5 L18.5 21 L12 17 L5.5 21 L8 13.5 L2 9 L9.5 9 Z" />
      {/* coin circle overlay */}
      <circle cx="12" cy="12" r="3" />
    </D>
  );
}

// ─── Activity / Feed icon ─────────────────────────────────────────────────────
export function ActivityIcon(p: BrandIconProps) {
  return (
    <D {...p}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </D>
  );
}

// ─── Export map (for programmatic use) ───────────────────────────────────────
export const BRAND_ICONS = {
  bag:         BagIcon,
  crownDagger: CrownDaggerIcon,
  yoinkFist:   YoinkFistIcon,
  solCoin:     SolCoinIcon,
  timerRing:   TimerRingIcon,
  drain:       DrainIcon,
  shieldCool:  ShieldCoolIcon,
  flameKing:   FlameKingIcon,
  throne:      ThroneSeatIcon,
  chainLink:   ChainLinkIcon,
  rake:        RakeIcon,
  jackpot:     JackpotIcon,
  activity:    ActivityIcon,
} as const;
