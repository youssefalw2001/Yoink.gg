import { motion } from "framer-motion";
import { Crown, Trophy, Swords, ShoppingBag, Volume2, VolumeX } from "lucide-react";
import { WalletButton } from "@/components/ui/WalletButton";
import { ProgressStrip } from "@/components/ui/XPBar";
import { setVolume, getVolume } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import type { PlayerProgress } from "@/lib/progression";
import { useState } from "react";

export type Page = "game" | "leaderboard" | "shop";

interface HeaderProps {
  page: Page;
  onNavigate: (page: Page) => void;
  progress: PlayerProgress;
}

const NAV: { id: Page; label: string; icon: typeof Swords }[] = [
  { id: "game",        label: "The Bag",      icon: Swords },
  { id: "leaderboard", label: "Hall of Kings", icon: Trophy },
  { id: "shop",        label: "Armory",        icon: ShoppingBag },
];

export function Header({ page, onNavigate, progress }: HeaderProps) {
  const [muted, setMuted] = useState(() => getVolume() === 0);

  function toggleMute() {
    if (muted) {
      setVolume(0.7);
      setMuted(false);
    } else {
      setVolume(0);
      setMuted(true);
    }
  }

  return (
    <header className="sticky top-0 z-40 w-full">
      {/* gold top accent */}
      <div
        className="h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,215,0,0.15) 20%, rgba(255,215,0,0.85) 50%, rgba(255,215,0,0.15) 80%, transparent)",
        }}
        aria-hidden
      />

      <div className="border-b border-white/[0.06] bg-[rgba(8,8,15,0.82)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">

          {/* ── wordmark ── */}
          <button
            type="button"
            onClick={() => onNavigate("game")}
            className="flex shrink-0 items-center gap-2.5"
            aria-label="YOINK.GG home"
          >
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-gold/10">
              <Crown className="h-5 w-5 text-gold" aria-hidden />
            </span>
            <span className="font-display text-xl font-black tracking-tight">
              <span className="text-white">YOINK</span>
              <span className="gold-text-gradient">.GG</span>
            </span>
          </button>

          {/* ── center nav (desktop) ── */}
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
            {NAV.map(({ id, label, icon: Icon }) => {
              const active = page === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate(id)}
                  className={cn(
                    "relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200",
                    active ? "text-white" : "text-slate hover:text-white",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-lg border border-white/10 bg-white/[0.05]"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* ── right cluster: XP strip + mute + wallet ── */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Rank + XP strip (hidden on very small screens) */}
            <div className="hidden sm:block">
              <ProgressStrip progress={progress} />
            </div>

            {/* Mute toggle */}
            <motion.button
              type="button"
              onClick={toggleMute}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate transition-colors duration-200 hover:text-white"
              aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            >
              {muted
                ? <VolumeX className="h-4 w-4" aria-hidden />
                : <Volume2 className="h-4 w-4" aria-hidden />
              }
            </motion.button>

            <WalletButton />
          </div>
        </div>

        {/* ── mobile nav strip ── */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-white/[0.04] px-4 py-2 no-scrollbar md:hidden">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                  active ? "bg-white/[0.08] text-white" : "text-slate",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </button>
            );
          })}

          {/* mobile XP strip */}
          <div className="ml-auto shrink-0">
            <ProgressStrip progress={progress} />
          </div>
        </div>
      </div>
    </header>
  );
}
