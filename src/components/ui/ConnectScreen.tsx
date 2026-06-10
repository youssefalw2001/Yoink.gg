/**
 * YOINK.GG — ConnectScreen
 *
 * Full-page gate shown before wallet is connected.
 * Designed to be the first thing a new user sees.
 *
 * Goals:
 *   1. Communicate the game in 3 seconds
 *   2. Make connecting feel safe and obvious
 *   3. Build tension — they should WANT to connect
 *
 * Layout:
 *   - Snatch mark (animated entrance, large)
 *   - YOINK.GG wordmark
 *   - One-line tagline
 *   - Three stat chips (live bag · active players · rounds played)
 *   - Connect Wallet CTA (gold, primary action)
 *   - Two trust chips below (no private key · self-custody)
 *   - Fine print (Solana network)
 *
 * GPU rules: transform + opacity only, will-change: transform on perpetual.
 * prefers-reduced-motion: skips all entrance animations.
 * Zero emojis. Lucide icons only.
 */

import { motion } from "framer-motion";
import { Wallet, Zap, Users, Trophy, ShieldCheck, Key, Loader } from "lucide-react";
import { SnatchIcon } from "@/components/ui/YoinkLogo";
import { useWallet } from "@/lib/wallet";

interface ConnectScreenProps {
  /** Live stats to show while waiting — passed from App so the sim keeps ticking */
  bagAmount:   number;
  playerCount: number;
  roundNumber: number;
}

// Stagger delays for entrance
const D = {
  mark:    0.0,
  word:    0.18,
  tag:     0.28,
  divider: 0.38,
  stats:   0.46,
  cta:     0.60,
  trust:   0.72,
};

export function ConnectScreen({
  bagAmount,
  playerCount,
  roundNumber,
}: ConnectScreenProps) {
  const { connect, connecting } = useWallet();

  const ease = [0.22, 1, 0.36, 1] as const;

  const stats = [
    {
      icon:  <Trophy className="h-3.5 w-3.5 text-gold" aria-hidden />,
      label: "CURRENT BAG",
      value: `${bagAmount.toFixed(2)} SOL`,
      accent: "rgba(255,215,0,0.10)",
      border: "rgba(255,215,0,0.20)",
      color:  "#FFD700",
    },
    {
      icon:  <Users className="h-3.5 w-3.5 text-emerald" aria-hidden />,
      label: "LIVE PLAYERS",
      value: playerCount.toLocaleString(),
      accent: "rgba(0,230,118,0.07)",
      border: "rgba(0,230,118,0.18)",
      color:  "#00E676",
    },
    {
      icon:  <Zap className="h-3.5 w-3.5 text-phantom" aria-hidden />,
      label: "ROUNDS PLAYED",
      value: `#${roundNumber.toLocaleString()}`,
      accent: "rgba(112,0,255,0.07)",
      border: "rgba(112,0,255,0.18)",
      color:  "#7000FF",
    },
  ];

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-16">

      {/* ── Aurora accent pools behind content ── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute"
          style={{
            top: "-10%", left: "-10%",
            width: "60%", height: "70%",
            background: "radial-gradient(ellipse, rgba(112,0,255,0.22) 0%, transparent 70%)",
            willChange: "transform",
            animation: "aurora-breathe 22s cubic-bezier(0.22,1,0.36,1) infinite",
          }}
        />
        <div
          className="absolute"
          style={{
            bottom: "-10%", right: "-10%",
            width: "55%", height: "65%",
            background: "radial-gradient(ellipse, rgba(255,215,0,0.14) 0%, transparent 70%)",
            willChange: "transform",
            animation: "aurora-drift 28s ease-in-out infinite",
          }}
        />
      </div>

      {/* ── Card container ── */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8">

        {/* Snatch mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.72, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.55, delay: D.mark, ease }}
          style={{
            filter:     "drop-shadow(0 0 40px rgba(255,215,0,0.28)) drop-shadow(0 0 80px rgba(112,0,255,0.18))",
            willChange: "transform",
          }}
        >
          <SnatchIcon size={100} variant="gold" pulse />
        </motion.div>

        {/* Wordmark */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: D.word, ease }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <h1
            className="font-display font-black leading-none tracking-tight"
            style={{ fontSize: "clamp(3rem, 14vw, 4.5rem)", letterSpacing: "0.02em" }}
          >
            <span className="text-white">YOINK</span>
            <span className="gold-text-gradient">.GG</span>
          </h1>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: D.tag, ease }}
            className="font-mono text-xs uppercase tracking-[0.28em] text-slate"
          >
            Hold the bag. Win everything.
          </motion.p>
        </motion.div>

        {/* Divider */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.55, delay: D.divider, ease }}
          className="h-px w-full origin-center"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,215,0,0.35), rgba(112,0,255,0.25), transparent)",
          }}
          aria-hidden
        />

        {/* Live stats */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: D.stats, ease }}
          className="grid w-full grid-cols-3 gap-2"
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex flex-col gap-1.5 rounded-2xl px-3 py-3 text-center"
              style={{
                background: s.accent,
                border:     `1px solid ${s.border}`,
              }}
            >
              <div className="flex justify-center">{s.icon}</div>
              <span
                className="font-mono text-sm font-bold tabular-nums"
                style={{ color: s.color }}
              >
                {s.value}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
                {s.label}
              </span>
            </div>
          ))}
        </motion.div>

        {/* Connect CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: D.cta, ease }}
          className="w-full"
        >
          <motion.button
            type="button"
            onClick={connect}
            disabled={connecting}
            whileTap={connecting ? {} : { scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="gold-button relative flex w-full items-center justify-center gap-3 py-4 text-base"
            style={{
              borderRadius: 18,
              willChange:   "transform",
              opacity:      connecting ? 0.8 : 1,
            }}
            aria-label="Connect Phantom wallet"
          >
            {connecting ? (
              <>
                <Loader
                  className="h-5 w-5 animate-spin"
                  aria-hidden
                  style={{ willChange: "transform" }}
                />
                <span className="font-display text-sm font-black uppercase tracking-[0.12em]">
                  Connecting…
                </span>
              </>
            ) : (
              <>
                <Wallet className="h-5 w-5" aria-hidden />
                <span className="font-display text-sm font-black uppercase tracking-[0.12em]">
                  Connect Wallet
                </span>
              </>
            )}
          </motion.button>
        </motion.div>

        {/* Trust chips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: D.trust, ease }}
          className="flex flex-wrap items-center justify-center gap-3"
        >
          <span className="trust-chip">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald" aria-hidden />
            No private key access
          </span>
          <span className="trust-chip">
            <Key className="h-3.5 w-3.5 text-slate" aria-hidden />
            Self-custody always
          </span>
        </motion.div>

        {/* Fine print */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: D.trust + 0.1, ease }}
          className="text-center font-mono text-[10px] text-dim"
        >
          Runs on Solana · Built by degens for degens
        </motion.p>

      </div>
    </div>
  );
}
