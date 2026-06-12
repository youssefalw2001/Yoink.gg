/**
 * YOINK.GG — ConnectScreen
 *
 * Full-page gate shown before wallet is connected.
 *
 * ARCHITECTURAL DECISIONS:
 *   - NO fake live stats (bag amount, player count, round number).
 *     Showing simulated metrics on a connect screen is a rug signal.
 *     Replaced with 3 honest static value props.
 *   - Tagline: "The clock is hidden. The bag is real."
 *     Communicates the Hidden Fuse mechanic — our only real differentiator.
 *
 * GPU rules: transform + opacity only, will-change: transform on perpetual.
 * prefers-reduced-motion: skips all entrance animations.
 * Zero emojis. Lucide icons only.
 */

import { motion } from "framer-motion";
import { Wallet, ShieldCheck, Key, Timer, TrendingUp, Crosshair, Loader } from "lucide-react";
import { SnatchIcon } from "@/components/ui/YoinkLogo";
import { useWallet } from "@/lib/wallet";

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

const VALUE_PROPS = [
  {
    icon:  <Timer className="h-5 w-5 text-blood" aria-hidden />,
    title: "Hidden Fuse",
    desc:  "Nobody knows when it blows",
    border: "rgba(255,34,0,0.18)",
    color:  "#FF2200",
  },
  {
    icon:  <TrendingUp className="h-5 w-5 text-gold" aria-hidden />,
    title: "Real SOL",
    desc:  "Sub-second finality",
    border: "rgba(255,215,0,0.18)",
    color:  "#FFD700",
  },
  {
    icon:  <Crosshair className="h-5 w-5 text-phantom" aria-hidden />,
    title: "Wallet Wars",
    desc:  "Raid stashes, bank fees",
    border: "rgba(112,0,255,0.18)",
    color:  "#7000FF",
  },
] as const;

export function ConnectScreen() {
  const { connect, connecting } = useWallet();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-16">

      {/* Aurora pools */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute" style={{
          top: "-10%", left: "-10%", width: "60%", height: "70%",
          background: "radial-gradient(ellipse, rgba(112,0,255,0.22) 0%, transparent 70%)",
          willChange: "transform", animation: "aurora-breathe 22s cubic-bezier(0.22,1,0.36,1) infinite",
        }} />
        <div className="absolute" style={{
          bottom: "-10%", right: "-10%", width: "55%", height: "65%",
          background: "radial-gradient(ellipse, rgba(255,215,0,0.14) 0%, transparent 70%)",
          willChange: "transform", animation: "aurora-drift 28s ease-in-out infinite",
        }} />
      </div>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8">

        {/* Snatch mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.72, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.55, delay: D.mark, ease: EASE }}
          style={{
            filter: "drop-shadow(0 0 40px rgba(255,215,0,0.28)) drop-shadow(0 0 80px rgba(112,0,255,0.18))",
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
            The clock is hidden. The bag is real.
          </motion.p>
        </motion.div>

        {/* Divider */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.55, delay: D.divider, ease: EASE }}
          className="h-px w-full origin-center"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,215,0,0.35), rgba(112,0,255,0.25), transparent)" }}
          aria-hidden
        />

        {/* Honest value props — 3-up icon grid (no fake stats) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: D.props, ease: EASE }}
          className="grid w-full grid-cols-3 gap-2.5"
        >
          {VALUE_PROPS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.42, delay: D.props + i * 0.09, ease: EASE }}
              whileHover={{ y: -4 }}
              className="group flex flex-col items-center gap-2.5 rounded-2xl px-2 py-4 text-center"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${p.border}`,
                willChange: "transform",
              }}
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                style={{
                  background: `${p.color}14`,
                  border: `1px solid ${p.color}33`,
                  willChange: "transform",
                }}
              >
                {p.icon}
              </span>
              <span
                className="font-mono text-[10px] font-bold uppercase leading-none tracking-[0.1em]"
                style={{ color: p.color }}
              >
                {p.title}
              </span>
              <span className="font-mono text-[10px] leading-snug text-slate">{p.desc}</span>
            </motion.div>
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
            style={{ borderRadius: 18, willChange: "transform", opacity: connecting ? 0.8 : 1 }}
            aria-label="Connect Phantom wallet"
          >
            {connecting ? (
              <>
                <Loader className="h-5 w-5 animate-spin" aria-hidden style={{ willChange: "transform" }} />
                <span className="font-display text-sm font-black uppercase tracking-[0.12em]">Connecting…</span>
              </>
            ) : (
              <>
                <Wallet className="h-5 w-5" aria-hidden />
                <span className="font-display text-sm font-black uppercase tracking-[0.12em]">Connect Wallet</span>
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
