/**
 * YOINK.GG — ConnectScreen
 *
 * Full-page gate shown before wallet is connected.
 *
 * ARCHITECTURAL DECISIONS:
 *
 * 1. NO FAKE LIVE STATS.
 *    We do not show bagAmount/playerCount from the simulation here.
 *    Displaying fabricated metrics on a connect screen is a rug signal to
 *    any degen who opens DevTools. We show honest static value propositions
 *    instead. Real numbers arrive after the user connects and enters a room.
 *
 * 2. NO FAKE HANDSHAKE DELAY.
 *    The wallet context previously simulated a 600ms delay. Removed. Training
 *    users to expect a sub-second wallet connect will cause rage-cancels when
 *    real Phantom (3-8s) arrives. connect() is instant in simulation mode.
 *
 * 3. SIMULATION PAUSED WHILE GATE IS SHOWING.
 *    The game tick loop should not run while no player is connected —
 *    that is handled at the App level (tick pauses when !connected).
 *
 * GPU rules: transform + opacity only, will-change: transform on perpetual.
 * prefers-reduced-motion: skips all entrance animations, shows final state.
 * Zero emojis. Lucide icons only.
 */

import { motion } from "framer-motion";
import {
  Wallet, Zap, ShieldCheck, Key, Timer, Loader, TrendingUp, Lock,
} from "lucide-react";
import { SnatchIcon } from "@/components/ui/YoinkLogo";
import { useWallet } from "@/lib/wallet";

// Stagger delays for entrance
const D = {
  mark:    0.0,
  word:    0.20,
  tag:     0.30,
  divider: 0.40,
  props:   0.50,
  cta:     0.64,
  trust:   0.76,
} as const;

const EASE = [0.22, 1, 0.36, 1] as const;

/** Static value proposition chips — honest, not fabricated. */
const VALUE_PROPS = [
  {
    icon:  <Timer className="h-4 w-4 text-blood" aria-hidden />,
    title: "30-Second Rounds",
    desc:  "One king. One bag. Clock hits zero — you win everything.",
    accent: "rgba(255,34,0,0.07)",
    border: "rgba(255,34,0,0.16)",
    color:  "#FF2200",
  },
  {
    icon:  <TrendingUp className="h-4 w-4 text-gold" aria-hidden />,
    title: "SOL on Solana",
    desc:  "Real money. Real transactions. Sub-second finality.",
    accent: "rgba(255,215,0,0.07)",
    border: "rgba(255,215,0,0.16)",
    color:  "#FFD700",
  },
  {
    icon:  <Lock className="h-4 w-4 text-phantom" aria-hidden />,
    title: "Three Arenas",
    desc:  "The Pit, The Arena, King's Court. Pick your weight class.",
    accent: "rgba(112,0,255,0.07)",
    border: "rgba(112,0,255,0.16)",
    color:  "#7000FF",
  },
] as const;

export function ConnectScreen() {
  const { connect, connecting } = useWallet();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-16">

      {/* ── Aurora accent pools ── */}
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

      {/* ── Content card ── */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8">

        {/* Snatch mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.72, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.55, delay: D.mark, ease: EASE }}
          style={{
            filter:     "drop-shadow(0 0 40px rgba(255,215,0,0.28)) drop-shadow(0 0 80px rgba(112,0,255,0.18))",
            willChange: "transform",
          }}
        >
          <SnatchIcon size={96} variant="gold" pulse />
        </motion.div>

        {/* Wordmark + tagline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: D.word, ease: EASE }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <h1
            className="font-display font-black leading-none tracking-tight"
            style={{ fontSize: "clamp(2.8rem, 13vw, 4.2rem)", letterSpacing: "0.02em" }}
          >
            <span className="text-white">YOINK</span>
            <span className="gold-text-gradient">.GG</span>
          </h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: D.tag, ease: EASE }}
            className="font-mono text-xs uppercase tracking-[0.28em] text-slate"
          >
            Hold the bag. Win everything.
          </motion.p>
        </motion.div>

        {/* Divider */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.55, delay: D.divider, ease: EASE }}
          className="h-px w-full origin-center"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,215,0,0.35), rgba(112,0,255,0.25), transparent)",
          }}
          aria-hidden
        />

        {/* Value props — honest, static */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: D.props, ease: EASE }}
          className="flex w-full flex-col gap-2.5"
        >
          {VALUE_PROPS.map((p) => (
            <div
              key={p.title}
              className="flex items-start gap-3 rounded-2xl px-4 py-3"
              style={{ background: p.accent, border: `1px solid ${p.border}` }}
            >
              <div className="mt-0.5 shrink-0">{p.icon}</div>
              <div className="flex flex-col gap-0.5">
                <span
                  className="font-mono text-[11px] font-bold uppercase tracking-[0.15em]"
                  style={{ color: p.color }}
                >
                  {p.title}
                </span>
                <span className="font-mono text-[11px] text-slate">{p.desc}</span>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Connect CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: D.cta, ease: EASE }}
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
          transition={{ duration: 0.4, delay: D.trust, ease: EASE }}
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
          <span className="trust-chip">
            <Zap className="h-3.5 w-3.5 text-gold" aria-hidden />
            Solana · sub-second
          </span>
        </motion.div>

        {/* Fine print */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: D.trust + 0.1, ease: EASE }}
          className="text-center font-mono text-[10px] text-dim"
        >
          18+ only · Not available in restricted jurisdictions
        </motion.p>

      </div>
    </div>
  );
}
