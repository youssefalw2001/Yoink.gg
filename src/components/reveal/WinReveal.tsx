import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { Twitter, RotateCcw, X } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { WinCrownArt, WinTrophy, WinBagArt } from "@/components/ui/WinArt";
import { WinShareBanner } from "@/components/ui/Banners";
import { formatSol, truncateAddress } from "@/lib/utils";

interface WinRevealProps {
  open: boolean;
  winner: string | null;
  isYou: boolean;
  amount: number;
  round: number;
  onPlayAgain: () => void;
}

const COIN_COUNT = 24;
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function easeOutExpo(t: number) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function WinReveal({
  open,
  winner,
  isYou,
  amount,
  round,
  onPlayAgain,
}: WinRevealProps) {
  const coinLayer = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const reduced = prefersReducedMotion();

    // --- number count-up: 0 → amount, easeOutExpo ---
    if (reduced) {
      setCount(amount);
    } else {
      const duration = 1600;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        setCount(amount * easeOutExpo(t));
        if (t < 1) rafRef.current = requestAnimationFrame(step);
        else setCount(amount);
      };
      rafRef.current = requestAnimationFrame(step);
    }

    if (reduced) {
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    // --- GSAP cinematic timeline ---
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      if (stageRef.current) {
        tl.from(stageRef.current, { opacity: 0, duration: 0.2 });
      }

      const coins = coinLayer.current?.querySelectorAll(".coin");
      if (coins && coins.length) {
        tl.fromTo(
          coins,
          {
            y: "-10vh",
            opacity: 1,
            rotate: () => gsap.utils.random(-180, 180),
          },
          {
            y: "110vh",
            rotate: () => gsap.utils.random(180, 540),
            opacity: 1,
            duration: () => gsap.utils.random(1.2, 1.8),
            ease: "power1.in",
            stagger: { each: 0.05, from: "random" },
          },
          0.1,
        );
      }

      tl.from(
        ".reveal-winner",
        { y: -40, opacity: 0, duration: 0.5, ease: "back.out(1.7)" },
        0.25,
      );
      tl.from(
        ".reveal-title",
        { scale: 0.4, opacity: 0, duration: 0.5, ease: "back.out(1.6)" },
        0.4,
      );
      tl.from(
        ".reveal-actions",
        { y: 24, opacity: 0, duration: 0.4, ease: "power2.out" },
        1.1,
      );
    }, stageRef);

    return () => {
      ctx.revert();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open, amount]);

  const shareText = encodeURIComponent(
    `I just won ${formatSol(amount)} SOL from THE KING'S BAG 😈 yoink.gg`,
  );
  const shareUrl = `https://twitter.com/intent/tweet?text=${shareText}`;

  const title = isYou ? "YOU WON" : "KING CROWNED";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{
            background: "rgba(8,8,15,0.92)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Round result"
        >
          {/* coin rain layer */}
          <div
            ref={coinLayer}
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden
          >
            {Array.from({ length: COIN_COUNT }).map((_, i) => (
              <span
                key={i}
                className="coin absolute top-0 h-4 w-4 rounded-full"
                style={{
                  left: `${(i / COIN_COUNT) * 100 + Math.random() * 4}%`,
                  background:
                    "radial-gradient(circle at 35% 30%, #ffe566, #ffd700 55%, #ff9900)",
                  boxShadow: "0 0 12px rgba(255,215,0,0.6)",
                }}
              />
            ))}
          </div>

          <SpotlightCard
            spotlightColor="rgba(255, 215, 0, 0.14)"
            radius={360}
            className="w-full max-w-md rounded-[24px]"
          >
          <div
            ref={stageRef}
            className="premium-card relative z-10 flex w-full flex-col items-center gap-5 px-8 py-10 text-center"
          >
            <span className="reveal-winner flex flex-col items-center gap-2">
              {/* Conditional art: trophy for others, bag burst for you */}
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.3 }}
              >
                {isYou ? (
                  <WinBagArt size={120} />
                ) : (
                  <WinTrophy size={120} />
                )}
              </motion.div>
              <span className="font-mono text-sm text-slate">
                {isYou ? "You" : winner ? truncateAddress(winner) : "—"}
                <span className="text-dim"> · round #{round}</span>
              </span>
            </span>

            {/* Big crown art behind the YOU WON title */}
            <div className="relative flex flex-col items-center">
              <div className="absolute -top-4 opacity-20" aria-hidden>
                <WinCrownArt size={160} />
              </div>
              <h2
                className="reveal-title shimmer-text relative z-10 font-display font-black leading-none"
                style={{ fontSize: "clamp(48px, 9vw, 72px)" }}
              >
                {title}
              </h2>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="gold-text-gradient font-display text-5xl font-black tabular-nums sm:text-6xl">
                {formatSol(count)}
              </span>
              <span className="font-display text-xl font-bold text-gold/70">
                SOL
              </span>
            </div>

            <div className="reveal-actions flex w-full flex-col gap-3 pt-2">
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/[0.08]"
              >
                <Twitter className="h-4 w-4 text-[#1d9bf0]" aria-hidden />
                Share on X
              </a>

              {/* Share card preview — exactly what gets shared */}
              <div className="w-full overflow-hidden rounded-xl border border-white/[0.06]">
                <WinShareBanner
                  wallet={isYou ? "You" : (winner ?? "")}
                  solWon={count}
                  round={round}
                  isYou={isYou}
                />
              </div>
              <motion.button
                type="button"
                onClick={onPlayAgain}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
                className="gold-button flex w-full items-center justify-center gap-2 px-6 py-3.5"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Play Again
              </motion.button>
            </div>

            <button
              type="button"
              onClick={onPlayAgain}
              className="absolute right-4 top-4 text-dim transition-colors duration-200 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          </SpotlightCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
