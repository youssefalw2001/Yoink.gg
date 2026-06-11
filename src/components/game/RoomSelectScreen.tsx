/**
 * YOINK.GG — RoomSelectScreen (Rolling Instances)
 *
 * Each room card now shows:
 *   - Live instance count ("2 active tables")
 *   - Per-instance chips: index, player count, status badge, live bag
 *   - Recommended instance highlighted (most players, not full)
 *   - Total live players across all instances of this room
 *
 * Player always enters the recommended instance automatically.
 * They can expand to see all instances and pick a specific one.
 *
 * GPU rules: transform + opacity only, will-change on perpetual anims.
 * Lucide icons only. Zero emojis.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, TrendingUp, Zap, ArrowRight, Lock,
  ChevronDown, Flame, Circle, AlertTriangle,
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

interface RoomSelectScreenProps {
  onSelect: (roomId: RoomId, instanceKey: string) => void;
}

// ── Instance status chip ───────────────────────────────────────────────────────
function StatusChip({ status, color }: { status: RoomInstance["status"]; color: string }) {
  const label = status === "open" ? "Open" : status === "filling" ? "Filling" : "Full";
  const opacity = status === "full" ? 0.5 : 1;
  return (
    <span
      className="flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em]"
      style={{
        background: `${color}14`,
        border: `1px solid ${color}30`,
        color,
        opacity,
      }}
    >
      <Circle className="h-1.5 w-1.5 fill-current" aria-hidden />
      {label}
    </span>
  );
}

// ── Single instance row ────────────────────────────────────────────────────────
function InstanceRow({
  inst,
  room,
  isRecommended,
  onJoin,
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
      {/* Instance label */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="font-mono text-[11px] font-bold shrink-0"
          style={{ color: isRecommended ? room.accentColor : "#8892a4" }}
        >
          Table #{inst.index}
        </span>
        {isRecommended && (
          <span
            className="rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.15em] shrink-0"
            style={{ background: `${room.accentRgba}0.15)`, color: room.accentColor }}
          >
            Recommended
          </span>
        )}
      </div>

      {/* Players + status */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3 text-dim" aria-hidden />
          <span className="font-mono text-[11px] tabular-nums text-slate">
            {inst.playerCount}/{room.maxPlayers}
          </span>
        </div>

        {/* Fill bar */}
        <div className="w-14 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${fillPct * 100}%`,
              background: isFull
                ? "#FF2200"
                : fillPct > 0.5
                  ? "#FFD700"
                  : room.accentColor,
            }}
          />
        </div>

        <StatusChip status={inst.status} color={room.accentColor} />

        {/* Join button */}
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
  roomId,
  instances,
  onSelect,
  index: cardIndex,
  walletBalance,
}: {
  roomId: RoomId;
  instances: RoomInstance[];
  onSelect: (roomId: RoomId, instanceKey: string) => void;
  index: number;
  walletBalance: number;
}) {
  const room       = ROOMS[roomId];
  const locked     = room.lockReason !== null;
  const warning    = getWalletWarning(walletBalance, room);
  const [expanded, setExpanded] = useState(false);

  // Find recommended instance (most players but not full)
  const available    = instances.filter((i) => i.status !== "full");
  const recommended  = available.sort((a, b) => b.playerCount - a.playerCount)[0]
    ?? instances[0];
  const totalPlayers = instances.reduce((s, i) => s + i.playerCount, 0);
  const allFull      = instances.every((i) => i.status === "full");
  const liveInstances = instances.length;

  function handleJoin(key: string) {
    onSelect(roomId, key);
  }

  function handleQuickJoin() {
    if (!recommended || locked) return;
    onSelect(roomId, recommended.key);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 + cardIndex * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      <SpotlightCard
        spotlightColor={`${room.accentRgba}0.14)`}
        radius={280}
        className={cn(
          "premium-card w-full rounded-[24px]",
          locked && "opacity-60",
        )}
      >
        {/* Accent bar */}
        <div
          className="h-[2px] w-full rounded-t-[24px]"
          style={{ background: `linear-gradient(90deg, transparent, ${room.accentColor}, transparent)` }}
        />

        <div className="flex flex-col gap-5 px-6 py-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span
                className="w-fit rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.25em]"
                style={{
                  background: `${room.accentRgba}0.12)`,
                  border: `1px solid ${room.accentRgba}0.3)`,
                  color: room.accentColor,
                }}
              >
                {roomId === "pit" ? "Entry" : roomId === "arena" ? "Standard" : "Elite"}
              </span>
              <h2 className="font-display text-2xl font-black leading-tight tracking-tight"
                style={{ color: room.accentColor }}>
                {room.name}
              </h2>
              <p className="font-mono text-xs text-slate">{room.tagline}</p>
            </div>

            {/* Live players + instances */}
            <div className="flex flex-col items-end gap-1.5">
              <div
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
                style={{
                  background: `${room.accentRgba}0.08)`,
                  border: `1px solid ${room.accentRgba}0.2)`,
                }}
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
              <span className="font-mono text-[9px] text-dim">
                {liveInstances} table{liveInstances !== 1 ? "s" : ""} running
              </span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <TrendingUp className="h-3.5 w-3.5" aria-hidden />, label: "Starting Bag", value: `${room.startingBag} SOL` },
              { icon: <Zap className="h-3.5 w-3.5" aria-hidden />, label: "Base Cost", value: `${room.baseCost} SOL` },
              { icon: <Users className="h-3.5 w-3.5" aria-hidden />, label: "Per Table", value: `${room.maxPlayers}` },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col gap-1 rounded-xl px-3 py-2.5"
                style={{
                  background: `${room.accentRgba}0.05)`,
                  border: `1px solid ${room.accentRgba}0.1)`,
                }}
              >
                <span style={{ color: room.accentColor, opacity: 0.7 }}>{stat.icon}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">{stat.label}</span>
                <span className="font-mono text-sm font-bold tabular-nums" style={{ color: room.accentColor }}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>

          {/* Instance list (expandable) */}
          {!locked && (
            <>
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="flex items-center justify-between text-left"
                aria-expanded={expanded}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
                  Active tables ({liveInstances})
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
                        {instances
                          .sort((a, b) => a.index - b.index)
                          .map((inst) => (
                            <InstanceRow
                              key={inst.key}
                              inst={inst}
                              room={room}
                              isRecommended={inst.key === recommended?.key}
                              onJoin={handleJoin}
                            />
                          ))}
                      </AnimatePresence>

                      {/* Auto-spawn notice when all full */}
                      <AnimatePresence>
                        {allFull && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2 rounded-xl px-3 py-2"
                            style={{
                              background: "rgba(255,34,0,0.06)",
                              border: "1px solid rgba(255,34,0,0.15)",
                            }}
                          >
                            <Flame className="h-3.5 w-3.5 shrink-0 text-blood" aria-hidden />
                            <p className="font-mono text-[10px] text-blood/80">
                              All tables full — a new one is being prepared
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Wallet balance warning — soft, never blocks */}
          <AnimatePresence>
            {!locked && warning && (
              <motion.div
                key={warning.level}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 2 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
                style={{
                  background: `${warningColor(warning.level)}10`,
                  border:     `1px solid ${warningColor(warning.level)}30`,
                }}
              >
                <AlertTriangle
                  className="h-3.5 w-3.5 shrink-0 mt-0.5"
                  style={{ color: warningColor(warning.level) }}
                  aria-hidden
                />
                <div className="flex flex-col gap-0.5">
                  <span
                    className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: warningColor(warning.level) }}
                  >
                    {warning.message}
                  </span>
                  <span className="font-mono text-[10px] text-slate leading-relaxed">
                    {warning.detail}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA */}
          {locked ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 py-3.5">
              <Lock className="h-4 w-4 text-slate" aria-hidden />
              <span className="font-mono text-sm text-slate">{room.lockReason}</span>
            </div>
          ) : (
            <motion.button
              type="button"
              onClick={handleQuickJoin}
              disabled={allFull}
              whileTap={allFull ? {} : { scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-display text-sm font-bold uppercase tracking-[0.15em] transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: room.accentColor,
                color: roomId === "court" ? "#fff" : "#08080f",
                willChange: "transform",
              }}
            >
              {allFull ? (
                "Tables Full — Spawning New…"
              ) : (
                <>
                  Enter {room.name}
                  {warning?.level === "danger"
                    ? <AlertTriangle className="h-4 w-4" aria-hidden />
                    : <ArrowRight className="h-4 w-4" aria-hidden />
                  }
                </>
              )}
            </motion.button>
          )}
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function RoomSelectScreen({ onSelect }: RoomSelectScreenProps) {
  const { getInstancesForRoom, totalPlayers } = useRoomInstances();
  const { walletBalance } = useWallet();

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

        {/* Total live players */}
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

      {/* Room cards */}
      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
        {ROOM_ORDER.map((roomId, i) => (
          <RoomCard
            key={roomId}
            roomId={roomId}
            instances={getInstancesForRoom(roomId)}
            onSelect={onSelect}
            index={i}
            walletBalance={walletBalance}
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
