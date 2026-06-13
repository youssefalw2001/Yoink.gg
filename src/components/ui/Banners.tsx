/**
 * YOINK.GG — Banner System
 *
 *  HeroBanner       — Hall of Kings hero (Snatch mark, Framer Motion stats)
 *  WinShareBanner   — dynamic per-win social share card
 *  RoundLiveBanner  — "BAG IS LIVE" announcement strip
 *  RankShareBanner  — rank achievement flex card
 */

import { motion } from "framer-motion";
import { Trophy, Users, Hash } from "lucide-react";
import { RANKS } from "@/lib/progression";
import { formatSol } from "@/lib/utils";
import { SnatchIcon } from "@/components/ui/YoinkLogo";

// ─── HeroBanner — Hall of Kings hero ─────────────────────────────────────────
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
  const stats = [
    {
      icon:  <Trophy className="h-3.5 w-3.5 text-gold" aria-hidden />,
      label: "CURRENT BAG",
      value: `${formatSol(bagAmount)} SOL`,
      accent: "rgba(255,215,0,0.12)",
      border: "rgba(255,215,0,0.22)",
      color:  "text-gold",
    },
    {
      icon:  <Users className="h-3.5 w-3.5 text-emerald" aria-hidden />,
      label: "LIVE PLAYERS",
      value: playerCount.toLocaleString(),
      accent: "rgba(0,230,118,0.08)",
      border: "rgba(0,230,118,0.2)",
      color:  "text-emerald",
    },
    {
      icon:  <Hash className="h-3.5 w-3.5 text-phantom" aria-hidden />,
      label: "ROUND",
      value: `#${roundNumber.toLocaleString()}`,
      accent: "rgba(112,0,255,0.08)",
      border: "rgba(112,0,255,0.2)",
      color:  "text-phantom",
    },
  ];

  return (
    <div
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{
        background: "linear-gradient(160deg, #0c0b18 0%, #08080f 60%, #0a0810 100%)",
        minHeight: 300,
      }}
    >
      {/* ── Aurora pools — transform only, no box-shadow ── */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{ willChange: "transform" }}
      >
        {/* Phantom pool — top-left */}
        <div
          className="absolute"
          style={{
            top: "-10%", left: "-5%",
            width: "55%", height: "80%",
            background: "radial-gradient(ellipse at center, rgba(112,0,255,0.28) 0%, transparent 70%)",
            willChange: "transform",
            animation: "aurora-breathe 22s cubic-bezier(0.22,1,0.36,1) infinite",
          }}
        />
        {/* Gold pool — bottom-right */}
        <div
          className="absolute"
          style={{
            bottom: "-10%", right: "-5%",
            width: "50%", height: "75%",
            background: "radial-gradient(ellipse at center, rgba(255,215,0,0.18) 0%, transparent 70%)",
            willChange: "transform",
            animation: "aurora-drift 28s ease-in-out infinite",
          }}
        />
        {/* Indigo accent — center */}
        <div
          className="absolute"
          style={{
            top: "20%", left: "40%",
            width: "40%", height: "60%",
            background: "radial-gradient(ellipse at center, rgba(68,0,204,0.14) 0%, transparent 70%)",
            willChange: "transform",
            animation: "aurora-breathe 18s cubic-bezier(0.22,1,0.36,1) infinite reverse",
          }}
        />
      </div>

      {/* ── Scanlines ── */}
      <div
        className="pointer-events-none absolute inset-0 hidden sm:block"
        aria-hidden
        style={{
          background: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 3px)",
        }}
      />

      {/* ── Top gold accent bar ── */}
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: "linear-gradient(90deg, transparent 0%, #FFE566 20%, #FFD700 50%, #FF9900 80%, transparent 100%)" }}
      />

      {/* ── Bottom vignette ── */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
        style={{ background: "linear-gradient(to bottom, transparent, rgba(8,8,15,0.7))" }}
        aria-hidden
      />

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6 py-10 sm:py-14 md:flex-row md:items-center md:gap-12 md:px-14 md:py-16">

        {/* Snatch mark — left on desktop, top on mobile */}
        <motion.div
          initial={{ opacity: 0, scale: 0.75 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="shrink-0"
          style={{ filter: "drop-shadow(0 0 32px rgba(255,215,0,0.25)) drop-shadow(0 0 64px rgba(112,0,255,0.2))" }}
        >
          <SnatchIcon size={180} variant="gold" pulse />
        </motion.div>

        {/* Text + stats — right */}
        <div className="flex flex-1 flex-col items-center gap-5 text-center md:items-start md:text-left">

          {/* Badge */}
          <motion.span
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-3 py-1"
          >
            <Trophy className="h-3 w-3 text-gold" aria-hidden />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
              Hall of Kings
            </span>
          </motion.span>

          {/* Wordmark */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-1"
          >
            <h1
              className="font-display font-black leading-none tracking-tight"
              style={{ fontSize: "clamp(2.6rem, 6vw, 5rem)", letterSpacing: "0.02em" }}
            >
              <span className="text-white">YOINK</span>
              <span className="gold-text-gradient">.GG</span>
            </h1>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate">
              The clock is hidden. The bag is real.
            </p>
          </motion.div>

          {/* Divider */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="h-px w-full origin-left"
            style={{ background: "linear-gradient(90deg, rgba(255,215,0,0.45), rgba(112,0,255,0.2), transparent)" }}
          />

          {/* Stats row */}
          <div className="flex flex-wrap justify-center gap-3 md:justify-start">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  delay: 0.45 + i * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex flex-col gap-1 rounded-xl px-4 py-3"
                style={{
                  background: s.accent,
                  border: `1px solid ${s.border}`,
                  minWidth: 110,
                }}
              >
                <div className="flex items-center gap-1.5">
                  {s.icon}
                  <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-slate">
                    {s.label}
                  </span>
                </div>
                <span className={`font-mono text-lg font-bold tabular-nums ${s.color}`}>
                  {s.value}
                </span>
              </motion.div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Corner watermark ── */}
      <span
        className="absolute bottom-3 right-4 font-display text-[10px] font-bold uppercase tracking-[0.25em]"
        style={{ color: "rgba(255,215,0,0.2)" }}
        aria-hidden
      >
        yoink.gg
      </span>
    </div>
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
  const display = wallet && wallet.length > 8
    ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
    : (wallet || "Anon");

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
      >Hold the bag · Raid the wallet</text>
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
  const display = wallet && wallet.length > 8
    ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
    : (wallet || "Anon");

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
      >Hold the bag · Raid the wallet</text>
    </svg>
  );
}
