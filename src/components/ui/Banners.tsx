/**
 * YOINK.GG — SVG Banner System
 *
 * Four banners for every context:
 *
 *  HeroBanner       — 1200×630 OG image / landing hero
 *  WinShareBanner   — dynamic per-win social share card
 *  RoundLiveBanner  — "BAG IS LIVE" announcement strip
 *  RankShareBanner  — rank achievement flex card
 *
 * All inline React SVG. Pass as <img> src via encodeURIComponent or
 * render directly in the UI. Zero deps, zero cost, instant render.
 */

import { RANKS } from "@/lib/progression";
import { formatSol } from "@/lib/utils";

// ─── HeroBanner — 1200×630 OG / landing ──────────────────────────────────────
interface HeroBannerProps {
  bagAmount?: number;
  playerCount?: number;
  roundNumber?: number;
  className?: string;
}

export function HeroBanner({
  bagAmount = 12.5,
  playerCount = 247,
  roundNumber = 1847,
  className,
}: HeroBannerProps) {
  return (
    <svg
      viewBox="0 0 1200 630"
      className={className}
      aria-label="YOINK.GG — The King's Bag"
      style={{ width: "100%", height: "auto", maxWidth: 1200 }}
    >
      <defs>
        {/* Void background */}
        <linearGradient id="hbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#0a0b14" />
          <stop offset="100%" stopColor="#08080f" />
        </linearGradient>
        {/* Aurora violet pool */}
        <radialGradient id="hav" cx="20%" cy="25%" r="45%">
          <stop offset="0%"   stopColor="#7000FF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#7000FF" stopOpacity="0" />
        </radialGradient>
        {/* Aurora gold pool */}
        <radialGradient id="hag" cx="82%" cy="78%" r="48%">
          <stop offset="0%"   stopColor="#FFD700" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
        </radialGradient>
        {/* Gold wordmark gradient */}
        <linearGradient id="hwg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="50%"  stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FF9900" />
        </linearGradient>
        {/* Crown dagger gradient */}
        <linearGradient id="hcg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="50%"  stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FF9900" />
        </linearGradient>
        {/* Bag amount gradient */}
        <linearGradient id="hbag" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="45%"  stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FF9900" />
        </linearGradient>
        {/* Vignette */}
        <radialGradient id="hvig" cx="50%" cy="50%" r="70%">
          <stop offset="40%"  stopColor="transparent" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.6)" />
        </radialGradient>
        {/* Scanlines pattern */}
        <pattern id="hscl" x="0" y="0" width="1" height="3" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="1200" height="1" fill="white" opacity="0.025" />
        </pattern>
        <filter id="hglow">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Background */}
      <rect width="1200" height="630" fill="url(#hbg)" />
      <rect width="1200" height="630" fill="url(#hav)" />
      <rect width="1200" height="630" fill="url(#hag)" />
      <rect width="1200" height="630" fill="url(#hscl)" />
      <rect width="1200" height="630" fill="url(#hvig)" />

      {/* Gold top accent line */}
      <rect x="0" y="0" width="1200" height="2"
        fill="url(#hwg)" opacity="0.8" />

      {/* Crown-Dagger icon — large, left side */}
      <g transform="translate(80, 160) scale(5.5)" filter="url(#hglow)">
        {/* crown-dagger path (same as YoinkIcon, scaled) */}
        <path
          d="M4 28 L4 18 L10 22 L14 8 L20 14 L20 6 L20 14 L26 8 L30 22 L36 18 L36 28 L30 28 L28 34 L26 28 L20 28 L20 36 L20 28 L14 28 L12 34 L10 28 Z"
          fill="url(#hcg)" stroke="#FFE566" strokeWidth="0.6" strokeLinejoin="round"
        />
        <circle cx="20" cy="18" r="3" fill="#FF1744" stroke="#FFE566" strokeWidth="0.5" />
        <circle cx="19" cy="17" r="1" fill="white" opacity="0.45" />
        <circle cx="11" cy="20" r="1.8" fill="#7000FF" stroke="#FFE566" strokeWidth="0.4" />
        <circle cx="29" cy="20" r="1.8" fill="#00C853" stroke="#FFE566" strokeWidth="0.4" />
      </g>

      {/* YOINK.GG wordmark */}
      <text x="380" y="230"
        fontFamily="'Orbitron', sans-serif" fontWeight="900"
        fontSize="110" fill="white" letterSpacing="6"
      >YOINK</text>
      <text x="380" y="352"
        fontFamily="'Orbitron', sans-serif" fontWeight="900"
        fontSize="110" fill="url(#hwg)" letterSpacing="6"
      >.GG</text>

      {/* Tagline */}
      <text x="380" y="400"
        fontFamily="'Space Grotesk', sans-serif" fontWeight="500"
        fontSize="20" fill="#8892a4" letterSpacing="3"
      >THE MOST DANGEROUS 30 SECONDS IN CRYPTO</text>

      {/* Gold divider */}
      <line x1="380" y1="420" x2="1140" y2="420"
        stroke="url(#hwg)" strokeWidth="1" opacity="0.4" />

      {/* Live stats strip */}
      <g transform="translate(380, 450)">
        {/* Bag stat */}
        <rect x="0" y="0" width="200" height="64" rx="12"
          fill="rgba(255,215,0,0.08)" stroke="rgba(255,215,0,0.2)" strokeWidth="1" />
        <text x="16" y="22"
          fontFamily="'Space Grotesk', sans-serif" fontWeight="500"
          fontSize="11" fill="#8892a4" letterSpacing="2"
        >CURRENT BAG</text>
        <text x="16" y="50"
          fontFamily="'JetBrains Mono', monospace" fontWeight="700"
          fontSize="22" fill="url(#hwg)"
        >{formatSol(bagAmount)} SOL</text>

        {/* Players stat */}
        <rect x="220" y="0" width="180" height="64" rx="12"
          fill="rgba(0,230,118,0.08)" stroke="rgba(0,230,118,0.2)" strokeWidth="1" />
        <circle cx="236" cy="14" r="5" fill="#00E676" opacity="0.9" />
        <text x="248" y="22"
          fontFamily="'Space Grotesk', sans-serif" fontWeight="500"
          fontSize="11" fill="#8892a4" letterSpacing="2"
        >LIVE</text>
        <text x="236" y="50"
          fontFamily="'JetBrains Mono', monospace" fontWeight="700"
          fontSize="22" fill="#00E676"
        >{playerCount.toLocaleString()}</text>

        {/* Round stat */}
        <rect x="420" y="0" width="180" height="64" rx="12"
          fill="rgba(112,0,255,0.08)" stroke="rgba(112,0,255,0.2)" strokeWidth="1" />
        <text x="436" y="22"
          fontFamily="'Space Grotesk', sans-serif" fontWeight="500"
          fontSize="11" fill="#8892a4" letterSpacing="2"
        >ROUND</text>
        <text x="436" y="50"
          fontFamily="'JetBrains Mono', monospace" fontWeight="700"
          fontSize="22" fill="#7000FF"
        >#{roundNumber.toLocaleString()}</text>
      </g>

      {/* yoink.gg URL bottom right */}
      <text x="1140" y="606"
        textAnchor="end"
        fontFamily="'Orbitron', sans-serif" fontWeight="700"
        fontSize="16" fill="rgba(255,215,0,0.35)" letterSpacing="2"
      >yoink.gg</text>
    </svg>
  );
}

// ─── WinShareBanner — dynamic win card ───────────────────────────────────────
interface WinShareBannerProps {
  wallet: string;
  solWon: number;
  round: number;
  isYou?: boolean;
  className?: string;
}

export function WinShareBanner({
  wallet,
  solWon,
  round,
  isYou = false,
  className,
}: WinShareBannerProps) {
  const display = wallet.length > 8
    ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
    : wallet;

  return (
    <svg
      viewBox="0 0 800 420"
      className={className}
      aria-label={`${display} won ${formatSol(solWon)} SOL`}
      style={{ width: "100%", height: "auto", maxWidth: 800 }}
    >
      <defs>
        <linearGradient id="wsbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#1a0800" />
          <stop offset="100%" stopColor="#08080f" />
        </linearGradient>
        <radialGradient id="wsglow" cx="50%" cy="50%" r="55%">
          <stop offset="0%"   stopColor={isYou ? "#FFD700" : "#7000FF"} stopOpacity="0.3" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wswg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="50%"  stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FF9900" />
        </linearGradient>
        <linearGradient id="wscg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="100%" stopColor="#FF9900" />
        </linearGradient>
      </defs>

      <rect width="800" height="420" fill="url(#wsbg)" />
      <rect width="800" height="420" fill="url(#wsglow)" />

      {/* Blood/gold top bar */}
      <rect x="0" y="0" width="800" height="6"
        fill={isYou ? "url(#wswg)" : "#7000FF"} />

      {/* Crown-dagger watermark */}
      <g transform="translate(580, 60) scale(4)" opacity="0.08">
        <path d="M4 28 L4 18 L10 22 L14 8 L20 14 L20 6 L20 14 L26 8 L30 22 L36 18 L36 28 L30 28 L28 34 L26 28 L20 28 L20 36 L20 28 L14 28 L12 34 L10 28 Z"
          fill="url(#wscg)" />
      </g>

      {/* WIN label */}
      <text x="60" y="100"
        fontFamily="'Space Grotesk', sans-serif" fontWeight="700"
        fontSize="14" fill="#8892a4" letterSpacing="6"
      >{isYou ? "YOU WON" : "KING CROWNED"}</text>

      {/* SOL amount — massive */}
      <text x="60" y="220"
        fontFamily="'Orbitron', sans-serif" fontWeight="900"
        fontSize="100" fill="url(#wswg)"
      >{formatSol(solWon)}</text>
      <text x="60" y="280"
        fontFamily="'Orbitron', sans-serif" fontWeight="700"
        fontSize="36" fill="rgba(255,215,0,0.5)"
      >SOL</text>

      {/* Wallet + round */}
      <text x="60" y="340"
        fontFamily="'JetBrains Mono', monospace" fontWeight="400"
        fontSize="18" fill="#8892a4"
      >{display} · Round #{round}</text>

      {/* Divider */}
      <line x1="60" y1="360" x2="740" y2="360"
        stroke="rgba(255,215,0,0.15)" strokeWidth="1" />

      {/* YOINK.GG branding bottom */}
      <text x="60" y="400"
        fontFamily="'Orbitron', sans-serif" fontWeight="900"
        fontSize="20" fill="white"
      >YOINK<tspan fill="url(#wswg)">.GG</tspan></text>
      <text x="740" y="400" textAnchor="end"
        fontFamily="'Space Grotesk', sans-serif" fontWeight="500"
        fontSize="13" fill="#8892a4"
      >Hold The Bag. Win Everything.</text>
    </svg>
  );
}

// ─── RoundLiveBanner — "BAG IS GROWING" announcement strip ────────────────────
interface RoundLiveBannerProps {
  bagAmount: number;
  className?: string;
}

export function RoundLiveBanner({ bagAmount, className }: RoundLiveBannerProps) {
  return (
    <svg
      viewBox="0 0 900 120"
      className={className}
      aria-label={`The bag is live — ${formatSol(bagAmount)} SOL`}
      style={{ width: "100%", height: "auto", maxWidth: 900 }}
    >
      <defs>
        <linearGradient id="rlbg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#0d0d18" />
          <stop offset="50%"  stopColor="#14111a" />
          <stop offset="100%" stopColor="#0d0d18" />
        </linearGradient>
        <linearGradient id="rlwg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="50%"  stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FF9900" />
        </linearGradient>
        <radialGradient id="rlglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#FFD700" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="900" height="120" rx="16" fill="url(#rlbg)"
        stroke="rgba(255,215,0,0.15)" strokeWidth="1" />
      <rect width="900" height="120" rx="16" fill="url(#rlglow)" />

      {/* Left gold accent */}
      <rect x="0" y="0" width="4" height="120" rx="2" fill="url(#rlwg)" />

      {/* Mini crown icon */}
      <g transform="translate(28, 38) scale(1.1)">
        <path d="M4 28 L4 18 L10 22 L14 8 L20 14 L20 6 L20 14 L26 8 L30 22 L36 18 L36 28 L30 28 L28 34 L26 28 L20 28 L20 36 L20 28 L14 28 L12 34 L10 28 Z"
          fill="url(#rlwg)" />
        <circle cx="20" cy="18" r="3" fill="#FF1744" />
      </g>

      {/* LIVE dot */}
      <circle cx="105" cy="42" r="6" fill="#00E676" opacity="0.9" />

      {/* BAG IS LIVE label */}
      <text x="120" y="50"
        fontFamily="'Space Grotesk', sans-serif" fontWeight="700"
        fontSize="13" fill="#8892a4" letterSpacing="4"
      >THE BAG IS LIVE</text>

      {/* Bag amount */}
      <text x="120" y="88"
        fontFamily="'JetBrains Mono', monospace" fontWeight="700"
        fontSize="32" fill="url(#rlwg)"
      >{formatSol(bagAmount)} SOL</text>

      {/* Right: YOINK NOW CTA */}
      <rect x="680" y="35" width="190" height="50" rx="10"
        fill="rgba(255,215,0,0.1)" stroke="rgba(255,215,0,0.3)" strokeWidth="1" />
      <text x="775" y="56"
        textAnchor="middle"
        fontFamily="'Space Grotesk', sans-serif" fontWeight="700"
        fontSize="11" fill="#8892a4" letterSpacing="3"
      >PLAY NOW</text>
      <text x="775" y="76"
        textAnchor="middle"
        fontFamily="'Orbitron', sans-serif" fontWeight="900"
        fontSize="14" fill="url(#rlwg)" letterSpacing="1"
      >YOINK.GG</text>
    </svg>
  );
}

// ─── RankShareBanner — level-up flex card ────────────────────────────────────
interface RankShareBannerProps {
  level: number;
  wallet: string;
  totalYoinks: number;
  totalSolWon: number;
  className?: string;
}

export function RankShareBanner({
  level,
  wallet,
  totalYoinks,
  totalSolWon,
  className,
}: RankShareBannerProps) {
  const rank    = RANKS[Math.min(level - 1, RANKS.length - 1)];
  const display = wallet.length > 8
    ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
    : wallet;

  return (
    <svg
      viewBox="0 0 800 320"
      className={className}
      aria-label={`${display} just reached ${rank.name} on YOINK.GG`}
      style={{ width: "100%", height: "auto", maxWidth: 800 }}
    >
      <defs>
        <linearGradient id="rsbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#08080f" />
          <stop offset="100%" stopColor="#0d0d18" />
        </linearGradient>
        <radialGradient id="rsglow" cx="25%" cy="50%" r="45%">
          <stop offset="0%"   stopColor={rank.color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={rank.color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rswg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="50%"  stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FF9900" />
        </linearGradient>
        <linearGradient id="rsrankgrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={rank.color} stopOpacity="0.8" />
          <stop offset="100%" stopColor={rank.color} />
        </linearGradient>
      </defs>

      <rect width="800" height="320" fill="url(#rsbg)"
        stroke={`${rank.color}33`} strokeWidth="1.5" rx="16" />
      <rect width="800" height="320" fill="url(#rsglow)" rx="16" />

      {/* Left side: rank art (rendered as foreignObject for SVG-in-SVG) */}
      {/* We position a simple rank emblem instead */}
      <rect x="40" y="40" width="200" height="240" rx="16"
        fill={`${rank.color}12`} stroke={`${rank.color}33`} strokeWidth="1" />

      {/* Rank number large */}
      <text x="140" y="150"
        textAnchor="middle"
        fontFamily="'Orbitron', sans-serif" fontWeight="900"
        fontSize="80" fill={rank.color} opacity="0.9"
      >{level}</text>
      <text x="140" y="210"
        textAnchor="middle"
        fontFamily="'Orbitron', sans-serif" fontWeight="700"
        fontSize="16" fill={rank.color} letterSpacing="2"
      >{rank.name.toUpperCase()}</text>
      <text x="140" y="248"
        textAnchor="middle"
        fontFamily="'Space Grotesk', sans-serif" fontWeight="400"
        fontSize="11" fill="#8892a4"
      >{rank.perk}</text>

      {/* Right: info */}
      <text x="280" y="90"
        fontFamily="'Space Grotesk', sans-serif" fontWeight="700"
        fontSize="13" fill="#8892a4" letterSpacing="4"
      >RANK ACHIEVED</text>

      <text x="280" y="150"
        fontFamily="'Orbitron', sans-serif" fontWeight="900"
        fontSize="44" fill={rank.color}
      >{rank.name}</text>

      <text x="280" y="185"
        fontFamily="'JetBrains Mono', monospace" fontWeight="400"
        fontSize="14" fill="#8892a4"
      >{display}</text>

      {/* Stats row */}
      <rect x="280" y="210" width="120" height="54" rx="8"
        fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <text x="340" y="232" textAnchor="middle"
        fontFamily="'Space Grotesk', sans-serif" fontSize="10" fill="#8892a4" letterSpacing="1"
      >YOINKs</text>
      <text x="340" y="255" textAnchor="middle"
        fontFamily="'JetBrains Mono', monospace" fontWeight="700" fontSize="18" fill="white"
      >{totalYoinks.toLocaleString()}</text>

      <rect x="416" y="210" width="140" height="54" rx="8"
        fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <text x="486" y="232" textAnchor="middle"
        fontFamily="'Space Grotesk', sans-serif" fontSize="10" fill="#8892a4" letterSpacing="1"
      >SOL WON</text>
      <text x="486" y="255" textAnchor="middle"
        fontFamily="'JetBrains Mono', monospace" fontWeight="700" fontSize="18" fill="url(#rswg)"
      >{formatSol(totalSolWon)}</text>

      {/* YOINK.GG branding */}
      <text x="280" y="298"
        fontFamily="'Orbitron', sans-serif" fontWeight="900"
        fontSize="16" fill="white"
      >YOINK<tspan fill="url(#rswg)">.GG</tspan></text>
      <text x="740" y="298" textAnchor="end"
        fontFamily="'Space Grotesk', sans-serif" fontWeight="400"
        fontSize="11" fill="#3a3f4f"
      >Hold The Bag. Win Everything.</text>
    </svg>
  );
}
