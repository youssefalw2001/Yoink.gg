/**
 * YOINK.GG — RoomSelectScreen (Rolling Instances)
 *
 * Free Yoink System — three layers shown here:
 *
 *   LAYER 1 — First Shot Free (gold hero banner, new wallets only)
 *     One lifetime free yoink in The Pit. No gate, zero friction.
 *     Shows only when isFirstTimePlayer is true.
 *
 *   LAYER 2 — Daily Pit Pass (emerald badge on Pit card, Rank 2+ only)
 *     Once per day, Rank 2+ players get a free first YOINK in The Pit.
 *     Shows as a quiet badge — doesn't interrupt the room-select flow.
 *
 *   LAYER 3 — Free Round Events (blood/gold pulse, Pit card only)
 *     Deterministic 10-minute free windows every 2 hours UTC.
 *     When active: Pit CTA becomes "Enter Free Round".
 *     When upcoming (< 30 min): countdown badge on Pit card.
 *
 * GPU rules: transform + opacity only, will-change on perpetual anims.
 * Lucide icons only. Zero emojis.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, TrendingUp, Zap, ArrowRight, Lock,
  ChevronDown, Flame, Circle, AlertTriangle, Gift, Clock,
  Sparkles,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { AnimatedLogo } from "@/components/ui/AnimatedLogo";
import {
  ROOMS, ROOM_ORDER,
  getWalletWarning, warningColor,
  type RoomId, type RoomInstance,
} from "@/lib/rooms";
import { useRoomInstances } from "@/hooks/useRoomInstances";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import type { FreeRoundState } from "@/hooks/useFreeRound";

interface RoomSelectScreenProps {
  onSelect: (roomId: RoomId, instanceKey: string) => void;
  // Layer 1
  isFirstTimePlayer: boolean;
  onClaimFirstShot: () => void;
  // Layer 2
  canClaimDailyPitPass: boolean;
  onClaimDailyPitPass: (instanceKey: string) => void;
  // Layer 3
  freeRound: FreeRoundState;
  onEnterFreeRound: (instanceKey: string) => void;
  // Daily voucher
  canClaimLoginVoucher?: boolean;
  onClaimLoginVoucher?: () => void;
}

// ── Instance status chip ───────────────────────────────────────────────────────
function StatusChip({ status, color }: { status: RoomInstance["status"]; color: string }) {
  const label = status === "open" ? "Open" : status === "filling" ? "Filling" : "Full";
  return (
    <span
      className="flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em]"
      style={{
        background: `${color}14`,
        border: `1px solid ${color}30`,
        color,
        opacity: status === "full" ? 0.5 : 1,
      }}
    >
      <Circle className="h-1.5 w-1.5 fill-current" aria-hidden />
      {label}
    </span>
  );
}

// ── Single instance row ────────────────────────────────────────────────────────
function InstanceRow({
  inst, room, isRecommended, onJoin,
}: {
  inst: RoomInstance;
  room: typeof ROOMS[RoomId];
  isRecommended: boolean;
  onJoin: (key: string) => void;
}) {
  const fillPct = inst.playerCount / room.maxPlayers;
  const isFull  = inst.status === "full";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150",
        isRecommended ? "outline outline-1" : "opacity-80 hover:opacity-100",
      )}
      style={{
        background:   isRecommended ? `${room.accentRgba}0.07)` : "rgba(255,255,255,0.02)",
        outlineColor: isRecommended ? `${room.accentRgba}0.4)` : "transparent",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[11px] font-bold shrink-0" style={{ color: isRecommended ? room.accentColor : "#8892a4" }}>
          Table #{inst.index}
        </span>
        {isRecommended && (
          <span className="rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.15em] shrink-0"
            style={{ background: `${room.accentRgba}0.15)`, color: room.accentColor }}>
            Recommended
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3 text-dim" aria-hidden />
          <span className="font-mono text-[11px] tabular-nums text-slate">{inst.playerCount}/{room.maxPlayers}</span>
        </div>
        <div className="w-14 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${fillPct * 100}%`, background: isFull ? "#FF2200" : fillPct > 0.5 ? "#FFD700" : room.accentColor }} />
        </div>
        <StatusChip status={inst.status} color={room.accentColor} />
        <motion.button
          type="button"
          onClick={() => onJoin(inst.key)}
          disabled={isFull}
          whileTap={isFull ? {} : { scale: 0.95 }}
          transition={{ duration: 0.1 }}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] disabled:cursor-not-allowed disabled:opacity-30"
          style={{
            background: isFull ? "rgba(255,255,255,0.04)" : `${room.accentRgba}0.14)`,
            border: `1px solid ${room.accentRgba}${isFull ? "0.1)" : "0.3)"}`,
            color: isFull ? "#3a3f4f" : room.accentColor,
            willChange: "transform",
          }}
        >
          {isFull ? "Full" : "Join"}
          {!isFull && <ArrowRight className="h-3 w-3" aria-hidden />}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Room card ─────────────────────────────────────────────────────────────────
function RoomCard({
  roomId, instances, onSelect, index: cardIndex, walletBalance,
  showFreeRound, freeRoundMinutesLeft, freeRoundUpcoming, freeRoundMinutesUntil,
  showDailyPass,
  onFreeRoundEntry, onDailyPassEntry,
}: {
  roomId: RoomId;
  instances: RoomInstance[];
  onSelect: (roomId: RoomId, instanceKey: string) => void;
  index: number;
  walletBalance: number;
  showFreeRound?: boolean;
  freeRoundMinutesLeft?: number;
  freeRoundUpcoming?: boolean;
  freeRoundMinutesUntil?: number;
  showDailyPass?: boolean;
  onFreeRoundEntry?: (key: string) => void;
  onDailyPassEntry?: (key: string) => void;
}) {
  const room     = ROOMS[roomId];
  const locked   = room.lockReason !== null;
  const warning  = getWalletWarning(walletBalance, room);
  const [expanded, setExpanded] = useState(false);
  const [hovered,  setHovered]  = useState(false);

  const available    = instances.filter((i) => i.status !== "full");
  const recommended  = available.sort((a, b) => b.playerCount - a.playerCount)[0] ?? instances[0];
  const totalPlayers = instances.reduce((s, i) => s + i.playerCount, 0);
  const allFull      = instances.every((i) => i.status === "full");
  const liveBag      = instances.reduce((m, i) => Math.max(m, i.bagAmount), room.startingBag);

  function handleJoin(key: string) { onSelect(roomId, key); }
  function handleQuickJoin() {
    if (!recommended || locked) return;
    if (showFreeRound && onFreeRoundEntry) { onFreeRoundEntry(recommended.key); return; }
    if (showDailyPass && onDailyPassEntry) { onDailyPassEntry(recommended.key); return; }
    onSelect(roomId, recommended.key);
  }

  const tierLabels: Record<RoomId, string> = {
    pit: "Entry", grind: "Mid-Tier", arena: "Standard", court: "Elite",
  };
  const atmosphereColor: Record<RoomId, string> = {
    pit: "rgba(0,230,118,", grind: "rgba(255,153,0,",
    arena: "rgba(255,215,0,", court: "rgba(112,0,255,",
  };

  // CTA label logic
  const ctaLabel = () => {
    if (allFull) return "Tables Full — Spawning New…";
    if (showFreeRound) return `Enter Free Round · ${freeRoundMinutesLeft}m left`;
    if (showDailyPass) return "Enter Free Today";
    return `Enter ${room.name}`;
  };
  const ctaIcon = () => {
    if (allFull) return null;
    if (showFreeRound) return <Sparkles className="h-4 w-4" aria-hidden />;
    if (showDailyPass) return <Gift className="h-4 w-4" aria-hidden />;
    return warning?.level === "danger"
      ? <AlertTriangle className="h-4 w-4" aria-hidden />
      : <ArrowRight className="h-4 w-4" aria-hidden />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 32, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.08 + cardIndex * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <SpotlightCard
        spotlightColor={showFreeRound ? "rgba(255,34,0,0.22)" : `${room.accentRgba}0.18)`}
        radius={320}
        className={cn(
          "premium-card w-full rounded-[28px] transition-transform duration-300",
          hovered && !locked && "scale-[1.012]",
          locked && "opacity-60",
        )}
      >
        {/* Accent bar */}
        <div
          className="h-[3px] w-full rounded-t-[28px]"
          style={{
            background: showFreeRound
              ? "linear-gradient(90deg, transparent, #FF2200, #FFD700, #FF2200, transparent)"
              : `linear-gradient(90deg, transparent, ${room.accentColor}, ${room.accentColor}, transparent)`,
            opacity: hovered ? 1 : 0.7,
            transition: "opacity 0.3s",
          }}
        />

        {/* Atmospheric glow */}
        <div className="pointer-events-none absolute inset-0 rounded-[28px] overflow-hidden" aria-hidden>
          <div className="absolute"
            style={{
              top: "-30%", left: "-20%", width: "80%", height: "80%",
              background: `radial-gradient(ellipse, ${atmosphereColor[roomId]}0.12) 0%, transparent 70%)`,
              willChange: "transform",
              animation: hovered ? "aurora-breathe 8s ease-in-out infinite" : "none",
            }}
          />
        </div>

        <div className="relative flex flex-col gap-5 px-6 py-6">

          {/* Top row: tier badge + live badge + free round / daily pass badges */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className="rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.25em]"
              style={{
                background: `${room.accentRgba}0.14)`,
                border: `1px solid ${room.accentRgba}0.35)`,
                color: room.accentColor,
              }}
            >
              {tierLabels[roomId]}
            </span>
            <div className="flex flex-wrap items-center gap-2">

              {/* Layer 3 — Free Round LIVE badge */}
              {showFreeRound && (
                <motion.span
                  animate={{ opacity: [1, 0.55, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.15em]"
                  style={{ background: "rgba(255,34,0,0.15)", border: "1px solid rgba(255,34,0,0.45)", color: "#FF2200", willChange: "opacity" }}
                >
                  <Flame className="h-2.5 w-2.5" aria-hidden />
                  Free Round · {freeRoundMinutesLeft}m
                </motion.span>
              )}

              {/* Layer 3 — Free Round UPCOMING badge */}
              {!showFreeRound && freeRoundUpcoming && (
                <span
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.15em]"
                  style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.25)", color: "#FFD700" }}
                >
                  <Clock className="h-2.5 w-2.5" aria-hidden />
                  Free in {freeRoundMinutesUntil}m
                </span>
              )}

              {/* Layer 2 — Daily Pass badge */}
              {showDailyPass && !showFreeRound && (
                <span
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.15em]"
                  style={{ background: "rgba(0,230,118,0.10)", border: "1px solid rgba(0,230,118,0.35)", color: "#00E676" }}
                >
                  <Gift className="h-2.5 w-2.5" aria-hidden />
                  Daily Pass
                </span>
              )}

              {/* Live players */}
              <div
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{ background: `${room.accentRgba}0.08)`, border: `1px solid ${room.accentRgba}0.2)` }}
              >
                <motion.span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: room.accentColor }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
                <span className="font-mono text-xs font-bold tabular-nums" style={{ color: room.accentColor }}>
                  {totalPlayers}
                </span>
                <Users className="h-3 w-3 text-slate" aria-hidden />
              </div>
            </div>
          </div>

          {/* Room name + tagline */}
          <div className="flex flex-col gap-1.5">
            <motion.h2
              className="font-display text-3xl font-black leading-none tracking-tight"
              style={{ color: room.accentColor }}
              animate={hovered ? { scale: 1.02 } : { scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              {room.name}
            </motion.h2>
            <p className="font-mono text-xs text-slate">{room.tagline}</p>
          </div>

          {/* Live bag */}
          <div
            className="flex items-center justify-between rounded-2xl px-4 py-3"
            style={{ background: `${room.accentRgba}0.08)`, border: `1px solid ${room.accentRgba}0.18)` }}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">Live Bag</span>
              <motion.span
                key={liveBag.toFixed(2)}
                initial={{ scale: 1.06 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3 }}
                className="font-display text-2xl font-black tabular-nums"
                style={{ color: room.accentColor, willChange: "transform" }}
              >
                {liveBag.toFixed(2)}
              </motion.span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">SOL</span>
              <span className="font-mono text-[10px] text-slate">{instances.length} table{instances.length !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <TrendingUp className="h-3.5 w-3.5" aria-hidden />, label: "Entry",    value: room.baseCost === 0 ? "Free" : `${room.baseCost} SOL` },
              { icon: <Zap className="h-3.5 w-3.5" aria-hidden />,        label: "Base Cost", value: `${room.baseCost} SOL` },
              { icon: <Users className="h-3.5 w-3.5" aria-hidden />,      label: "Per Table", value: `${room.maxPlayers}` },
            ].map((s) => (
              <div key={s.label} className="flex flex-col gap-1 rounded-xl px-3 py-2.5"
                style={{ background: `${room.accentRgba}0.05)`, border: `1px solid ${room.accentRgba}0.1)` }}>
                <span style={{ color: room.accentColor, opacity: 0.65 }}>{s.icon}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">{s.label}</span>
                <span className="font-mono text-sm font-bold tabular-nums" style={{ color: room.accentColor }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Instance list */}
          {!locked && (
            <>
              <button type="button" onClick={() => setExpanded((e) => !e)}
                className="flex items-center justify-between text-left" aria-expanded={expanded}>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
                  Active tables ({instances.length})
                </span>
                <ChevronDown
                  className="h-3.5 w-3.5 text-dim transition-transform duration-200"
                  style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", willChange: "transform" }}
                  aria-hidden
                />
              </button>
              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-1.5 pt-1">
                      <AnimatePresence initial={false}>
                        {instances.sort((a, b) => a.index - b.index).map((inst) => (
                          <InstanceRow key={inst.key} inst={inst} room={room}
                            isRecommended={inst.key === recommended?.key} onJoin={handleJoin} />
                        ))}
                      </AnimatePresence>
                      <AnimatePresence>
                        {allFull && (
                          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="flex items-center gap-2 rounded-xl px-3 py-2"
                            style={{ background: "rgba(255,34,0,0.06)", border: "1px solid rgba(255,34,0,0.15)" }}>
                            <Flame className="h-3.5 w-3.5 shrink-0 text-blood" aria-hidden />
                            <p className="font-mono text-[10px] text-blood/80">All tables full — a new one is being prepared</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Wallet warning */}
          <AnimatePresence>
            {!locked && warning && (
              <motion.div
                key={warning.level}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 2 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
                style={{ background: `${warningColor(warning.level)}10`, border: `1px solid ${warningColor(warning.level)}30` }}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: warningColor(warning.level) }} aria-hidden />
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: warningColor(warning.level) }}>
                    {warning.message}
                  </span>
                  <span className="font-mono text-[10px] text-slate leading-relaxed">{warning.detail}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA */}
          {locked ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 py-4">
              <Lock className="h-4 w-4 text-slate" aria-hidden />
              <span className="font-mono text-sm text-slate">{room.lockReason}</span>
            </div>
          ) : (
            <motion.button
              type="button"
              onClick={handleQuickJoin}
              disabled={allFull}
              whileHover={!allFull ? { scale: 1.03 } : undefined}
              whileTap={allFull ? {} : { scale: 0.97 }}
              transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 font-display text-sm font-black uppercase tracking-[0.15em] transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: showFreeRound
                  ? "linear-gradient(90deg, #FF2200, #FF6600)"
                  : showDailyPass
                    ? "#00E676"
                    : room.accentColor,
                color: (showFreeRound || showDailyPass || roomId !== "court") ? "#08080f" : "#fff",
                willChange: "transform",
              }}
            >
              {ctaIcon()}
              {ctaLabel()}
            </motion.button>
          )}
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function RoomSelectScreen({
  onSelect,
  isFirstTimePlayer,
  onClaimFirstShot,
  canClaimDailyPitPass,
  onClaimDailyPitPass,
  freeRound,
  onEnterFreeRound,
  canClaimLoginVoucher = false,
  onClaimLoginVoucher,
}: RoomSelectScreenProps) {
  const { getInstancesForRoom, totalPlayers } = useRoomInstances();
  const { walletBalance } = useWallet();

  // Best available Pit instance — used by Layer 1 claim button
  const pitInstances    = getInstancesForRoom("pit");
  const bestPitInstance = pitInstances.find((i) => i.status !== "full") ?? pitInstances[0];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-4 py-12 sm:px-6">

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-4 text-center"
      >
        <AnimatedLogo size={80} />
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            <span className="text-white">Choose Your </span>
            <span className="gold-text-gradient">Arena</span>
          </h1>
          <p className="font-mono text-sm text-slate">
            Three leagues. Multiple tables per league. Always a fresh bag.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">
          <motion.span
            className="h-2 w-2 rounded-full bg-emerald"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="font-mono text-xs text-slate">
            <span className="font-bold text-white">{totalPlayers}</span>{" "}
            players across all arenas
          </span>
        </div>
      </motion.div>

      {/* Divider */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="h-px w-full max-w-md origin-center"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,215,0,0.3), rgba(112,0,255,0.3), transparent)" }}
      />

      {/* ── LAYER 3 — Free Round LIVE alert (shown above Layer 1 if both active) ── */}
      <AnimatePresence>
        {freeRound.isActive && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full"
          >
            <div
              className="flex w-full flex-col items-center gap-3 rounded-2xl px-5 py-4 text-center sm:flex-row sm:text-left"
              style={{ background: "rgba(255,34,0,0.08)", border: "1px solid rgba(255,34,0,0.35)" }}
            >
              <motion.div
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                style={{ willChange: "transform" }}
              >
                <Flame className="h-6 w-6 shrink-0 text-blood" aria-hidden />
              </motion.div>
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="font-display text-sm font-black text-white">
                  Free Round Live — The Pit
                </span>
                <span className="font-mono text-[11px] text-blood/80">
                  First YOINK is free for everyone · {freeRound.minutesLeft} minute{freeRound.minutesLeft !== 1 ? "s" : ""} remaining · House bag: {freeRound.bagSeed} SOL
                </span>
              </div>
              <motion.button
                type="button"
                onClick={() => bestPitInstance && onEnterFreeRound(bestPitInstance.key)}
                disabled={!bestPitInstance}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.12 }}
                className="shrink-0 rounded-xl border border-blood/40 bg-blood/15 px-4 py-2.5 font-display text-xs font-black uppercase tracking-[0.12em] text-blood transition-colors hover:bg-blood/22 disabled:opacity-40"
                style={{ willChange: "transform" }}
              >
                Enter Free Round
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LAYER 1 — First Shot Free hero banner ── */}
      <AnimatePresence>
        {isFirstTimePlayer && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-full"
          >
            <div
              className="relative overflow-hidden rounded-2xl"
              style={{ background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.3)" }}
            >
              {/* Subtle shimmer stripe */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: "linear-gradient(105deg, transparent 40%, rgba(255,215,0,0.07) 50%, transparent 60%)" }}
                aria-hidden
              />
              <div className="relative flex flex-col items-center gap-4 px-6 py-5 text-center sm:flex-row sm:text-left">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "rgba(255,215,0,0.12)", border: "1px solid rgba(255,215,0,0.3)" }}
                >
                  <Sparkles className="h-6 w-6 text-gold" aria-hidden />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <span className="font-display text-base font-black text-white">
                    Your first YOINK is on us
                  </span>
                  <span className="font-mono text-[11px] text-slate">
                    Try The Pit at zero cost. Real game, real bag. If you win — it's yours.
                  </span>
                </div>
                <motion.button
                  type="button"
                  onClick={onClaimFirstShot}
                  disabled={!bestPitInstance}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
                  className="shrink-0 rounded-xl border border-gold/40 bg-gold/15 px-5 py-3 font-display text-xs font-black uppercase tracking-[0.12em] text-gold transition-colors hover:bg-gold/22 disabled:opacity-40"
                  style={{ willChange: "transform" }}
                >
                  Claim First Shot
                  <ArrowRight className="ml-1.5 inline h-3 w-3" aria-hidden />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Daily Voucher banner (separate from free yoink system) ── */}
      <AnimatePresence>
        {canClaimLoginVoucher && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4"
            style={{ background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.2)" }}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-sm font-black text-white">Daily Voucher</span>
              <span className="font-mono text-[11px] text-slate">+50 XP · discounted Fuse Burner (0.01 SOL)</span>
            </div>
            <motion.button
              type="button"
              onClick={onClaimLoginVoucher}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="shrink-0 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5 font-display text-xs font-black uppercase tracking-[0.12em] text-gold transition-colors hover:bg-gold/15"
              style={{ willChange: "transform" }}
            >
              Claim Voucher
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Room cards */}
      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
        {ROOM_ORDER.map((id, i) => (
          <RoomCard
            key={id}
            roomId={id}
            instances={getInstancesForRoom(id)}
            onSelect={onSelect}
            index={i}
            walletBalance={walletBalance}
            // Pit-only free round props
            showFreeRound={id === "pit" && freeRound.isActive}
            freeRoundMinutesLeft={id === "pit" ? freeRound.minutesLeft : 0}
            freeRoundUpcoming={id === "pit" && freeRound.isUpcoming}
            freeRoundMinutesUntil={id === "pit" ? freeRound.minutesUntilNext : 0}
            showDailyPass={id === "pit" && canClaimDailyPitPass && !freeRound.isActive}
            onFreeRoundEntry={id === "pit" ? onEnterFreeRound : undefined}
            onDailyPassEntry={id === "pit" ? onClaimDailyPitPass : undefined}
          />
        ))}
      </div>

      {/* Footer note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="font-mono text-[11px] text-dim text-center"
      >
        New tables spawn automatically when one fills up · Switch tables between rounds
      </motion.p>
    </div>
  );
}
