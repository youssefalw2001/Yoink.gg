import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { KingCardShader } from "@/components/ui/KingCardShader";
import { AnimatedKingAvatar } from "@/components/ui/AnimatedKingAvatar";
import { truncateAddress } from "@/lib/utils";

interface KingCardProps {
  king: string;
  isYou: boolean;
  heldFor: number;
  critical: boolean;
  theme?: string;  // 'theme_blood' | 'theme_phantom' | 'crown_animated' | 'default'
}

const THEME_COLORS: Record<string, { spot: string; border: string; shadow: string; flame: string }> = {
  theme_blood: {
    spot:   "rgba(255, 34, 0, 0.22)",
    border: "rgba(255,34,0,0.4)",
    shadow: "0 0 20px rgba(255,34,0,0.3)",
    flame:  "linear-gradient(to top, #b81700, #ff2200)",
  },
  theme_phantom: {
    spot:   "rgba(112, 0, 255, 0.22)",
    border: "rgba(112,0,255,0.4)",
    shadow: "0 0 20px rgba(112,0,255,0.3)",
    flame:  "linear-gradient(to top, #4700aa, #7000ff)",
  },
  crown_animated: {
    spot:   "rgba(255, 215, 0, 0.22)",
    border: "rgba(255,215,0,0.4)",
    shadow: "0 0 20px rgba(255,215,0,0.3)",
    flame:  "linear-gradient(to top, #cc9900, #ffd700)",
  },
};

const FLAMES = [
  { left: "14%", delay: "0s",    dur: "2.2s" },
  { left: "32%", delay: "0.5s",  dur: "2.6s" },
  { left: "50%", delay: "0.2s",  dur: "2.0s" },
  { left: "68%", delay: "0.7s",  dur: "2.4s" },
  { left: "86%", delay: "0.35s", dur: "2.8s" },
];

export const KingCard = memo(function KingCard({ king, isYou, heldFor, critical, theme }: KingCardProps) {
  const key = `${king}-${isYou}`;

  // Theme colours — critical (blood) always overrides any cosmetic theme
  const tc = !critical && theme && theme in THEME_COLORS ? THEME_COLORS[theme] : null;

  const spotColor   = tc?.spot   ?? (critical ? "rgba(255, 34, 0, 0.20)"  : isYou ? "rgba(255, 215, 0, 0.16)" : "rgba(112, 0, 255, 0.20)");
  const borderColor = tc?.border ?? (critical ? "rgba(255,34,0,0.4)"      : isYou ? "rgba(255,215,0,0.4)"     : "rgba(112,0,255,0.4)");
  const boxShadow   = tc?.shadow ?? (critical ? "0 0 20px rgba(255,34,0,0.3)" : isYou ? "0 0 20px rgba(255,215,0,0.3)" : "0 0 20px rgba(112,0,255,0.3)");
  const flameGrad   = tc?.flame  ?? (critical ? "linear-gradient(to top, #b81700, #ff2200)" : undefined);

  return (
    <div className="relative flex w-full items-center justify-center sm:mx-auto sm:max-w-sm">
      {/* Orbiting crown — crown_animated cosmetic theme */}
      {theme === "crown_animated" && (
        <div className="pointer-events-none absolute -top-5 left-1/2 z-20 -translate-x-1/2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            style={{ willChange: "transform" }}
            aria-hidden
          >
            <Crown
              className="h-7 w-7"
              style={{ color: "#FFD700", filter: "drop-shadow(0 0 10px rgba(255,215,0,0.9))" }}
            />
          </motion.div>
        </div>
      )}
      <AnimatePresence mode="popLayout">
        {/* shockwave ring */}
        <motion.span
          key={`shock-${key}`}
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: 3, opacity: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute h-28 w-28 rounded-full border border-gold/60"
          aria-hidden
        />

        <motion.div
          key={key}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: [0.85, 1.04, 1] }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1], opacity: { duration: 0.3 } }}
          className="w-full"
        >
          <SpotlightCard
            spotlightColor={spotColor}
            radius={280}
            className="glow-border premium-card relative w-full overflow-hidden rounded-[24px]"
          >
            {/* OGL WebGL vortex shader — rendered on GPU behind content */}
            <KingCardShader
              isYou={isYou}
              critical={critical}
              kingKey={key}
              theme={theme}
            />

            <div className="relative px-4 py-4 sm:px-6 sm:py-6">
              <div className="relative z-10 flex flex-col items-center gap-2 sm:gap-3">
                {/* King badge */}
                <span className="flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1">
                  <Crown className="h-3.5 w-3.5 text-gold" aria-hidden />
                  <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
                    The King
                  </span>
                </span>

                {/* Animated avatar */}
                <motion.div
                  key={`avatar-${key}`}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 24 }}
                  className="relative"
                >
                  <div
                    className="overflow-hidden rounded-2xl border-2 shadow-lg"
                    style={{
                      width: 72, height: 72,
                      borderColor,
                      boxShadow,
                    }}
                  >
                    <AnimatedKingAvatar
                      wallet={isYou ? "You" : king}
                      size={72}
                      isKing
                      critical={critical}
                    />
                  </div>
                </motion.div>

                {/* Wallet + hold time */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className="font-mono text-sm font-bold text-white sm:text-base">
                    {isYou ? "You" : truncateAddress(king, 4, 4)}
                  </span>
                  <span className="font-mono text-[10px] text-slate sm:text-xs">
                    holds the bag · {heldFor}s
                  </span>
                </div>

                {isYou && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-emerald">
                    defend the throne
                  </span>
                )}
              </div>

              {/* flame particles */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12" aria-hidden>
                {FLAMES.map((f, i) => (
                    <span
                      key={i}
                      className="flame"
                      style={{
                        left: f.left,
                        animationDelay: f.delay,
                        animationDuration: f.dur,
                        background: flameGrad,
                      }}
                    />
                ))}
              </div>
            </div>
          </SpotlightCard>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});
