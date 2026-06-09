import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { YoinkLogoStack } from "@/components/ui/YoinkLogo";
import { RoundLiveBanner } from "@/components/ui/Banners";
import { GAME_CONFIG } from "@/lib/types";

interface LobbyScreenProps {
  playerCount: number;
  bagAmount: number;
  roundNumber: number;
}

/**
 * LobbyScreen — shown while playerCount < MIN_PLAYERS.
 * Simulates a "waiting room" that builds anticipation before the round starts.
 */
export function LobbyScreen({ playerCount, bagAmount, roundNumber }: LobbyScreenProps) {
  const needed = Math.max(0, GAME_CONFIG.MIN_PLAYERS - playerCount);
  const pct = Math.min(playerCount / GAME_CONFIG.MIN_PLAYERS, 1);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-8 px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-2 text-center"
      >
        {/* Brand logo stack — replaces the spinning loader */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          <YoinkLogoStack size={160} showTagline />
        </motion.div>

        <h2 className="font-display text-2xl font-black tracking-tight">
          <span className="gold-text-gradient">Round #{roundNumber}</span>
        </h2>
        <p className="font-mono text-sm text-slate">
          Waiting for players to join…
        </p>

        {/* Live announcement banner */}
        <div className="w-full">
          <RoundLiveBanner bagAmount={bagAmount} />
        </div>
      </motion.div>

      <SpotlightCard
        spotlightColor="rgba(112,0,255,0.2)"
        radius={280}
        className="premium-card w-full rounded-[24px]"
      >
        <div className="flex flex-col gap-5 px-6 py-6">
          {/* player fill bar */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-mono text-xs text-slate">
                <Users className="h-3.5 w-3.5" aria-hidden />
                Players joined
              </span>
              <span className="font-mono text-sm font-bold text-white">
                {playerCount}
                <span className="text-dim"> / {GAME_CONFIG.MIN_PLAYERS} min</span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: pct }}
                transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                style={{
                  transformOrigin: "left center",
                  background: "linear-gradient(90deg, #7000FF, #FFD700)",
                  willChange: "transform",
                }}
              />
            </div>
            {needed > 0 && (
              <p className="font-mono text-[11px] text-slate">
                {needed} more player{needed !== 1 ? "s" : ""} needed to start
              </p>
            )}
          </div>

          {/* bag preview */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <span className="font-mono text-xs text-slate">Starting bag</span>
            <span className="font-mono text-lg font-bold text-gold">
              {bagAmount.toFixed(3)}
              <span className="ml-1 text-xs text-gold/60">SOL</span>
            </span>
          </div>

          {/* pulse dots */}
          <div className="flex items-center justify-center gap-3">
            {Array.from({ length: GAME_CONFIG.MIN_PLAYERS }).map((_, i) => (
              <motion.span
                key={i}
                className="h-3 w-3 rounded-full"
                style={{
                  background: i < playerCount ? "#00E676" : "rgba(255,255,255,0.1)",
                  boxShadow: i < playerCount ? "0 0 8px rgba(0,230,118,0.6)" : "none",
                  willChange: "opacity",
                }}
                animate={
                  i < playerCount
                    ? { opacity: [0.6, 1, 0.6] }
                    : { opacity: 0.3 }
                }
                transition={
                  i < playerCount
                    ? {
                        duration: 1.4,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: "easeInOut",
                      }
                    : {}
                }
              />
            ))}
          </div>

          <p className="text-center font-mono text-[10px] text-dim">
            Round starts automatically when {GAME_CONFIG.MIN_PLAYERS} players are present
          </p>
        </div>
      </SpotlightCard>
    </div>
  );
}
