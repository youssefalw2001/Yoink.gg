import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { WalletButton } from "@/components/ui/WalletButton";
import { ProgressStrip } from "@/components/ui/XPBar";
import { PuterStatus } from "@/components/ui/PuterStatus";
import { YoinkIcon, YoinkWordmark } from "@/components/ui/YoinkLogo";
import {
  BagIcon,
  ThroneSeatIcon,
  RakeIcon,
} from "@/components/ui/BrandIcons";
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

// Nav items use brand icons instead of generic lucide icons
const NAV: { id: Page; label: string; Icon: React.ComponentType<{ size?: number; color?: string; className?: string }> }[] = [
  { id: "game",        label: "The Bag",      Icon: BagIcon },
  { id: "leaderboard", label: "Hall of Kings", Icon: ThroneSeatIcon },
  { id: "shop",        label: "Armory",        Icon: RakeIcon },
];

export function Header({ page, onNavigate, progress }: HeaderProps) {
  const [muted, setMuted] = useState(() => getVolume() === 0);

  function toggleMute() {
    if (muted) { setVolume(0.7); setMuted(false); }
    else        { setVolume(0);   setMuted(true);  }
  }

  return (
    <header className="sticky top-0 z-40 w-full">
      {/* gold top accent line */}
      <div
        className="h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,215,0,0.15) 20%, rgba(255,215,0,0.85) 50%, rgba(255,215,0,0.15) 80%, transparent)",
        }}
        aria-hidden
      />

      <div className="border-b border-white/[0.06] bg-[rgba(8,8,15,0.88)] backdrop-blur-xl">

        {/* ── top bar: logo | (desktop nav) | right cluster ── */}
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">

          {/* logo — brand SVG icon + wordmark */}
          <button
            type="button"
            onClick={() => onNavigate("game")}
            className="flex shrink-0 items-center gap-2.5"
            aria-label="YOINK.GG home"
          >
            <YoinkIcon size={32} variant="gold" glow />
            <YoinkWordmark size="md" />
          </button>

          {/* desktop nav — brand icons, visible md+ */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map(({ id, label, Icon }) => {
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
                      className="absolute inset-0 -z-10 rounded-lg border border-white/10 bg-white/[0.06]"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <Icon size={16} color={active ? "#FFD700" : "currentColor"} />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* spacer pushes right cluster to the right */}
          <div className="flex-1" />

          {/* right cluster: XP + AI status + mute + wallet */}
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden sm:block">
              <ProgressStrip progress={progress} />
            </div>
            <PuterStatus />

            <motion.button
              type="button"
              onClick={toggleMute}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate transition-colors duration-200 hover:text-white"
              aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            >
              {muted
                ? <VolumeX className="h-3.5 w-3.5" aria-hidden />
                : <Volume2 className="h-3.5 w-3.5" aria-hidden />}
            </motion.button>

            <WalletButton />
          </div>
        </div>

        {/* ── bottom nav strip — ALWAYS visible, all screen sizes ── */}
        <div className="border-t border-white/[0.05] bg-[rgba(8,8,15,0.6)]">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-1.5 no-scrollbar sm:px-6">
            {NAV.map(({ id, label, Icon }) => {
              const active = page === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate(id)}
                  className={cn(
                    "relative flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200",
                    active ? "text-white" : "text-slate hover:text-white",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill-mobile"
                      className="absolute inset-0 -z-10 rounded-lg border border-white/10 bg-white/[0.06]"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <Icon size={16} color={active ? "#FFD700" : "currentColor"} />
                  <span>{label}</span>
                </button>
              );
            })}

            {/* XP strip on mobile right edge */}
            <div className="ml-auto shrink-0 sm:hidden">
              <ProgressStrip progress={progress} />
            </div>
          </div>
        </div>

      </div>
    </header>
  );
}
