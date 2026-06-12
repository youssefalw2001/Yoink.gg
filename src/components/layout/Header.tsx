import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, ChevronLeft } from "lucide-react";
import { WalletButton } from "@/components/ui/WalletButton";
import { ProgressStrip } from "@/components/ui/XPBar";
import { VoidEyeIcon, YoinkWordmark } from "@/components/ui/YoinkLogo";
import { AnimatedNavIcon } from "@/components/ui/AnimatedBrandIcon";
import { setVolume, getVolume } from "@/lib/sounds";
import { cn, truncateAddress } from "@/lib/utils";
import { NETWORK_LABEL } from "@/lib/solana";
import { PurgeAvatar } from "@/components/walletwars/PurgeAvatar";
import type { PlayerProgress } from "@/lib/progression";
import type { Room } from "@/lib/rooms";
import { useState } from "react";

export type Page = "game" | "walletwars" | "leaderboard" | "shop";

interface HeaderProps {
  page: Page;
  onNavigate: (page: Page) => void;
  progress: PlayerProgress;
  /** The room the player is currently in — null = room select is showing */
  currentRoom?: Room | null;
  /** Called when the player clicks the room badge to go back to room select */
  onLeaveRoom?: () => void;
  /** Whether the local player is currently the King — enables disconnect guard */
  isKing?: boolean;
  /** e.g. "The Pit #2" when player is in a non-primary instance */
  instanceLabel?: string | null;
  /** Connected wallet address — used as the avatar seed + fallback name */
  publicKey?: string | null;
  /** Opens the profile modal */
  onOpenProfile?: () => void;
}

// Nav uses animated brand icons — draw on mount, re-draw on active change
const NAV = [
  { id: "walletwars"  as const, label: "Wallet Wars",   icon: "crownDagger" as const },
  { id: "game"        as const, label: "The Bag",      icon: "bag"         as const },
  { id: "leaderboard" as const, label: "Hall of Kings", icon: "throne"      as const },
  { id: "shop"        as const, label: "Armory",        icon: "rake"        as const },
];

// Nav items use brand icons instead of generic lucide icons
export function Header({ page, onNavigate, progress, currentRoom, onLeaveRoom, instanceLabel, publicKey, onOpenProfile }: HeaderProps) {
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
            <VoidEyeIcon size={32} variant="gold" pulse />
            <YoinkWordmark size="md" />
          </button>

          {/* Network badge — honest about devnet + simulated stakes */}
          <span
            className="hidden shrink-0 items-center gap-1.5 rounded-full border border-emerald/25 bg-emerald/[0.08] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-emerald sm:flex"
            title="Real wallet connection on Devnet. Gameplay stakes are simulated."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald" aria-hidden />
            {NETWORK_LABEL} · Sim stakes
          </span>

          {/* Room badge — shown while a room is active */}
          <AnimatePresence>
            {currentRoom && page === "game" && (
              <motion.button
                key="room-badge"
                type="button"
                onClick={onLeaveRoom}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                whileTap={{ scale: 0.95 }}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.18em] transition-opacity duration-150 hover:opacity-80"
                style={{
                  background: `${currentRoom.accentRgba}0.12)`,
                  border:     `1px solid ${currentRoom.accentRgba}0.3)`,
                  color:      currentRoom.accentColor,
                }}
                aria-label={`Leave ${currentRoom.name}`}
              >
                <ChevronLeft className="h-3 w-3" aria-hidden />
                {instanceLabel ?? currentRoom.name}
              </motion.button>
            )}
          </AnimatePresence>

          {/* desktop nav */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map(({ id, label, icon }) => {
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
                  <AnimatedNavIcon name={icon} size={16} active={active} />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* spacer pushes right cluster to the right */}
          <div className="flex-1" />

          {/* right cluster */}
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden sm:block">
              <ProgressStrip progress={progress} />
            </div>

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

            {/* Identity / profile */}
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-1 pl-1 pr-2.5 transition-colors duration-200 hover:bg-white/[0.08]"
              aria-label="Open profile"
            >
              <PurgeAvatar
                seed={publicKey ?? progress.displayName ?? "You"}
                size={26}
                variant={progress.avatarVariant}
                color={progress.avatarColor}
              />
              <span className="hidden max-w-[100px] truncate font-mono text-xs font-bold text-white sm:block">
                {progress.displayName || (publicKey ? truncateAddress(publicKey, 4, 4) : "Profile")}
              </span>
            </button>
          </div>
        </div>

        {/* ── bottom nav strip — mobile only; desktop uses the top-bar nav ── */}
        <div className="border-t border-white/[0.05] bg-[rgba(8,8,15,0.6)] md:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-1.5 no-scrollbar sm:px-6">
            {NAV.map(({ id, label, icon }) => {
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
                  <AnimatedNavIcon name={icon} size={16} active={active} />
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
