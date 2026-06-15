/**
 * YOINK.GG — BagComingSoonScreen
 *
 * Launch gate for "The Bag". Shown in place of RoomSelectScreen / GameScreen
 * while the `BAG_COMING_SOON` feature flag is true, so the app can launch with
 * only the fully-hardened Wallet Wars visible.
 *
 * Purely presentational — no game/economy logic. On-brand dark/gold styling
 * with the app fonts, a headline, a one-line teaser, and a CTA that routes the
 * player to Wallet Wars.
 *
 * GPU rules: transform + opacity only. Respects prefers-reduced-motion via the
 * shared `usePrefersReducedMotion` hook (skips entrance + perpetual anims).
 */

import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Crown } from "lucide-react";
import { AnimatedLogo } from "@/components/ui/AnimatedLogo";
import { usePrefersReducedMotion } from "@/components/walletwars/useReducedMotion";

interface BagComingSoonScreenProps {
  /** Routes the player to the live Wallet Wars experience. */
  onGoToWalletWars: () => void;
}

export function BagComingSoonScreen({ onGoToWalletWars }: BagComingSoonScreenProps) {
  const reduced = usePrefersReducedMotion();

  // Entrance animation — disabled under prefers-reduced-motion.
  const enter = (delay: number) =>
    reduced
      ? { initial: false as const }
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10 px-4 py-20 text-center sm:px-6">

      {/* Brand mark */}
      <motion.div {...enter(0)}>
        <AnimatedLogo size={88} />
      </motion.div>

      {/* SOON pill */}
      <motion.div {...enter(0.12)}>
        <span
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-gold"
          style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.3)" }}
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          Coming Soon
        </span>
      </motion.div>

      {/* Headline + teaser */}
      <motion.div {...enter(0.2)} className="flex flex-col gap-3">
        <h1 className="font-display text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          <span className="text-white">The Bag — </span>
          <span className="gold-text-gradient">Coming Soon</span>
        </h1>
        <p className="font-mono text-sm text-slate sm:text-base">
          Hold the throne. Bank tolls. Dropping soon.
        </p>
      </motion.div>

      {/* CTA → Wallet Wars */}
      <motion.div {...enter(0.3)} className="flex flex-col items-center gap-3">
        <motion.button
          type="button"
          onClick={onGoToWalletWars}
          whileHover={reduced ? undefined : { scale: 1.04 }}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
          className="gold-button flex items-center justify-center gap-2.5 px-8 py-4 font-display text-sm font-black uppercase tracking-[0.15em]"
          style={{ willChange: "transform" }}
        >
          <Crown className="h-4 w-4" aria-hidden />
          Play Wallet Wars
          <ArrowRight className="h-4 w-4" aria-hidden />
        </motion.button>
        <span className="font-mono text-[11px] text-dim">
          Siege the Vault is live right now — claim your throne.
        </span>
      </motion.div>
    </div>
  );
}
