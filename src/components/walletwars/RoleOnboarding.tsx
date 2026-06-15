/**
 * RoleOnboarding — first-run, three-slide tutorial that BRANCHES on the role the
 * player picked on the landing screen.
 *
 *   VAULT LORD → "YOU ARE THE HOUSE" → "SURVIVE AND EARN" → "WORKS WHILE YOU
 *                SLEEP". CTA "OPEN MY FIRST VAULT" routes to tier selection.
 *   SIEGE RUNNER → "FIND YOUR TARGET" → "SMALL RISK BIG UPSIDE" → "PICK YOUR
 *                MOMENT". CTA "FIND MY FIRST TARGET" routes to the Hunt board.
 *
 * GPU-safe (transform/opacity), reduced-motion aware, lucide icons only.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, ChevronRight, Vault, ShieldCheck, Moon, Crosshair, TrendingUp, Clock, type LucideIcon,
} from "lucide-react";
import type { WarRole } from "@/lib/walletWarsRole";
import { usePrefersReducedMotion } from "./useReducedMotion";

interface Slide {
  icon: LucideIcon;
  color: string;
  title: string;
  body: string;
}

const LORD_SLIDES: Slide[] = [
  { icon: Vault, color: "#7000FF", title: "YOU ARE THE HOUSE", body: "Lock SOL in a vault. Every failed siege against you pays you a toll." },
  { icon: ShieldCheck, color: "#00E676", title: "SURVIVE AND EARN", body: "The longer your vault holds, the more fees pile up. Exposed vaults earn more per siege." },
  { icon: Moon, color: "#FFD700", title: "WORKS WHILE YOU SLEEP", body: "Fees bank automatically. Check back tomorrow and see what you made." },
];

const RUNNER_SLIDES: Slide[] = [
  { icon: Crosshair, color: "#FF2200", title: "FIND YOUR TARGET", body: "Every vault is a whale sitting on SOL. Your job is to crack it." },
  { icon: TrendingUp, color: "#FFD700", title: "SMALL RISK, BIG UPSIDE", body: "You risk a small fee. You could walk away with 10×. Published odds. Provably fair." },
  { icon: Clock, color: "#7000FF", title: "PICK YOUR MOMENT", body: "Idle vaults, active bounties, long streaks about to break — skill in target selection matters." },
];

interface RoleOnboardingProps {
  role: WarRole;
  onDone: () => void;
}

export function RoleOnboarding({ role, onDone }: RoleOnboardingProps) {
  const reduced = usePrefersReducedMotion();
  const [slide, setSlide] = useState(0);

  const slides = role === "lord" ? LORD_SLIDES : RUNNER_SLIDES;
  const cta = role === "lord" ? "Open my first vault" : "Find my first target";
  const current = slides[slide] ?? slides[0];
  const Icon = current.icon;
  const isLast = slide === slides.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[110] flex items-center justify-center px-5"
      style={{ background: "rgba(8,8,15,0.94)", backdropFilter: "blur(12px)" }}
      role="dialog"
      aria-modal="true"
      aria-label={role === "lord" ? "Vault Lord intro" : "Siege Runner intro"}
    >
      <motion.div
        initial={{ scale: 0.94, y: 14, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 26 }}
        className="premium-card relative w-full max-w-sm rounded-[24px] px-6 py-7"
      >
        <button type="button" onClick={onDone} className="absolute right-4 top-4 text-dim transition-colors hover:text-white" aria-label="Skip">
          <X className="h-5 w-5" aria-hidden />
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key={slide}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: reduced ? 0 : 0.22 }}
            className="flex flex-col items-center gap-5 text-center"
          >
            <motion.div
              initial={reduced ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 22 }}
              className="flex h-20 w-20 items-center justify-center rounded-3xl"
              style={{ background: `${current.color}1a`, border: `1px solid ${current.color}44` }}
            >
              <Icon className="h-9 w-9" style={{ color: current.color }} aria-hidden />
            </motion.div>

            <div className="flex flex-col gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.24em]" style={{ color: current.color }}>
                {role === "lord" ? "Vault Lord" : "Siege Runner"}
              </span>
              <h2 className="font-display text-2xl font-black tracking-tight text-white">{current.title}</h2>
              <p className="font-mono text-xs leading-relaxed text-slate">{current.body}</p>
            </div>

            <div className="flex items-center gap-1.5">
              {slides.map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: i === slide ? 18 : 6, background: i === slide ? current.color : "rgba(255,255,255,0.15)" }}
                  aria-hidden
                />
              ))}
            </div>

            {!isLast ? (
              <motion.button
                type="button"
                onClick={() => setSlide((s) => Math.min(s + 1, slides.length - 1))}
                whileTap={reduced ? undefined : { scale: 0.97 }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/[0.1]"
                style={{ willChange: "transform" }}
              >
                Next <ChevronRight className="h-4 w-4" aria-hidden />
              </motion.button>
            ) : (
              <motion.button
                type="button"
                onClick={onDone}
                whileTap={reduced ? undefined : { scale: 0.97 }}
                className="gold-button flex w-full items-center justify-center gap-2 py-3.5 text-sm"
                style={{ willChange: "transform" }}
              >
                {role === "lord" ? <Vault className="h-4 w-4" aria-hidden /> : <Crosshair className="h-4 w-4" aria-hidden />}
                {cta}
              </motion.button>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
