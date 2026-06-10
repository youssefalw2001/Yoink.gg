/**
 * RoomSelectScreen — pick your league before entering the arena.
 *
 * Three room cards: The Pit · The Arena · King's Court
 * Each shows buy-in range, live player count, starting bag, and cost range.
 * Framer Motion stagger entrance. SpotlightCard hover effect.
 * GPU rules: transform + opacity only, no animated box-shadow/blur.
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, TrendingUp, Zap, ArrowRight, Lock } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { AnimatedLogo } from "@/components/ui/AnimatedLogo";
import { ROOMS, ROOM_ORDER, ROOM_PLAYER_RANGES, type RoomId } from "@/lib/rooms";
import { cn } from "@/lib/utils";

interface RoomSelectScreenProps {
  onSelect: (roomId: RoomId) => void;
}

/** Simulates live player counts that drift over time */
function useLivePlayerCounts(): Record<RoomId, number> {
  const [counts, setCounts] = useState<Record<RoomId, number>>({
    pit:   28,
    arena: 11,
    court: 4,
  });

  useEffect(() => {
    const id = setInterval(() => {
      setCounts((prev) => {
        const next = { ...prev } as Record<RoomId, number>;
        for (const roomId of ROOM_ORDER) {
          const [min, max] = ROOM_PLAYER_RANGES[roomId];
          const delta = Math.random() > 0.5 ? 1 : -1;
          next[roomId] = Math.min(max, Math.max(min, prev[roomId] + delta));
        }
        return next;
      });
    }, 2200);
    return () => clearInterval(id);
  }, []);

  return counts;
}

const ROOM_DESCRIPTIONS: Record<RoomId, string[]> = {
  pit: [
    "No buy-in floor — everyone welcome",
    "Up to 50 players per match",
    "Fast, cheap, chaotic",
    "Best for new players",
  ],
  arena: [
    "0.1–1 SOL wallet range",
    "Up to 20 players per match",
    "Balanced cost escalation",
    "The default competitive tier",
  ],
  court: [
    "1+ SOL wallets only",
    "Up to 10 players per match",
    "High cost, high reward",
    "Whale wars — no weak hands",
  ],
};

interface RoomCardProps {
  roomId: RoomId;
  liveCount: number;
  onSelect: (id: RoomId) => void;
  index: number;
}

function RoomCard({ roomId, liveCount, onSelect, index }: RoomCardProps) {
  const room = ROOMS[roomId];
  const locked = room.lockReason !== null;
  const [hovered, setHovered] = useState(false);

  const maxBuyInLabel =
    room.maxBuyIn === Infinity ? "∞" : `${room.maxBuyIn} SOL`;
  const minBuyInLabel =
    room.minBuyIn === 0 ? "Free" : `${room.minBuyIn} SOL`;

  const tierLabel =
    roomId === "pit"
      ? "Entry"
      : roomId === "arena"
        ? "Standard"
        : "Elite";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: 0.1 + index * 0.1,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <SpotlightCard
        spotlightColor={`${room.accentRgba}0.14)`}
        radius={280}
        className={cn(
          "premium-card w-full rounded-[24px] transition-transform duration-200",
          hovered && !locked && "scale-[1.015]",
          locked && "opacity-60",
        )}
      >
        {/* top accent bar */}
        <div
          className="h-[2px] w-full rounded-t-[24px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${room.accentColor}, transparent)`,
            opacity: hovered ? 1 : 0.5,
            transition: "opacity 0.3s",
          }}
        />

        <div className="flex flex-col gap-5 px-6 py-6">
          {/* header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              {/* tier badge */}
              <span
                className="w-fit rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.25em]"
                style={{
                  background: `${room.accentRgba}0.12)`,
                  border:     `1px solid ${room.accentRgba}0.3)`,
                  color:      room.accentColor,
                }}
              >
                {tierLabel}
              </span>
              <h2
                className="font-display text-2xl font-black leading-tight tracking-tight"
                style={{ color: room.accentColor }}
              >
                {room.name}
              </h2>
              <p className="font-mono text-xs text-slate">{room.tagline}</p>
            </div>

            {/* live player pill */}
            <div
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{
                background: `${room.accentRgba}0.08)`,
                border:     `1px solid ${room.accentRgba}0.2)`,
              }}
            >
              <motion.span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: room.accentColor }}
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <span
                className="font-mono text-xs font-bold tabular-nums"
                style={{ color: room.accentColor }}
              >
                {liveCount}
              </span>
              <Users className="h-3 w-3 text-slate" aria-hidden />
            </div>
          </div>

          {/* stats grid */}
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                icon:  <TrendingUp className="h-3.5 w-3.5" aria-hidden />,
                label: "Starting Bag",
                value: `${room.startingBag} SOL`,
              },
              {
                icon:  <Zap className="h-3.5 w-3.5" aria-hidden />,
                label: "Base Cost",
                value: `${room.baseCost} SOL`,
              },
              {
                icon:  <Users className="h-3.5 w-3.5" aria-hidden />,
                label: "Max Players",
                value: `${room.maxPlayers}`,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col gap-1 rounded-xl px-3 py-2.5"
                style={{
                  background: `${room.accentRgba}0.05)`,
                  border:     `1px solid ${room.accentRgba}0.1)`,
                }}
              >
                <span className="text-slate" style={{ color: room.accentColor, opacity: 0.7 }}>
                  {stat.icon}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">
                  {stat.label}
                </span>
                <span
                  className="font-mono text-sm font-bold tabular-nums"
                  style={{ color: room.accentColor }}
                >
                  {stat.value}
                </span>
              </div>
            ))}
          </div>

          {/* buy-in range */}
          <div
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{
              background: `${room.accentRgba}0.04)`,
              border:     `1px solid ${room.accentRgba}0.12)`,
            }}
          >
            <span className="font-mono text-xs text-slate">Wallet range</span>
            <span className="font-mono text-sm font-bold" style={{ color: room.accentColor }}>
              {minBuyInLabel}
              {room.maxBuyIn !== Infinity && ` — ${maxBuyInLabel}`}
              {room.maxBuyIn === Infinity && ` +`}
            </span>
          </div>

          {/* feature bullets */}
          <ul className="flex flex-col gap-1.5">
            {ROOM_DESCRIPTIONS[roomId].map((line) => (
              <li key={line} className="flex items-center gap-2 font-mono text-xs text-slate">
                <span
                  className="h-1 w-1 rounded-full shrink-0"
                  style={{ background: room.accentColor, opacity: 0.6 }}
                />
                {line}
              </li>
            ))}
          </ul>

          {/* CTA */}
          {locked ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 py-3.5">
              <Lock className="h-4 w-4 text-slate" aria-hidden />
              <span className="font-mono text-sm text-slate">{room.lockReason}</span>
            </div>
          ) : (
            <motion.button
              type="button"
              onClick={() => onSelect(roomId)}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-display text-sm font-bold uppercase tracking-[0.15em] transition-opacity duration-200"
              style={{
                background:  room.accentColor,
                color:       roomId === "pit" ? "#08080f" : roomId === "arena" ? "#08080f" : "#fff",
                willChange: "transform",
              }}
            >
              Enter {room.name}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </motion.button>
          )}
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

export function RoomSelectScreen({ onSelect }: RoomSelectScreenProps) {
  const liveCounts = useLivePlayerCounts();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-4 py-12 sm:px-6">

      {/* hero */}
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
            Three leagues. Pick your weight class. Every room is a separate bag.
          </p>
        </div>

        {/* total live players chip */}
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">
          <motion.span
            className="h-2 w-2 rounded-full bg-emerald"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="font-mono text-xs text-slate">
            <span className="font-bold text-white">
              {Object.values(liveCounts).reduce((a, b) => a + b, 0)}
            </span>{" "}
            players across all arenas
          </span>
        </div>
      </motion.div>

      {/* divider */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="h-px w-full max-w-md origin-center"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,215,0,0.3), rgba(112,0,255,0.3), transparent)",
        }}
      />

      {/* room cards grid */}
      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
        {ROOM_ORDER.map((roomId, i) => (
          <RoomCard
            key={roomId}
            roomId={roomId}
            liveCount={liveCounts[roomId]}
            onSelect={onSelect}
            index={i}
          />
        ))}
      </div>

      {/* footer note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="font-mono text-[11px] text-dim"
      >
        Each arena runs an independent bag · Switch rooms at any time between rounds
      </motion.p>
    </div>
  );
}
