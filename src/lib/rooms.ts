/**
 * YOINK.GG — Rooms / Leagues + Rolling Instance System
 *
 * Three tiers. Players self-select into fair fights.
 * Each room auto-spawns new instances at SPAWN_THRESHOLD capacity
 * so there's always a fresh bag to enter regardless of how many
 * total players are online.
 *
 * Instance lifecycle:
 *   OPEN     → 0–50% capacity  (plenty of room)
 *   FILLING  → 50–80% capacity (getting busy)
 *   FULL     → 80%+ capacity   (triggers new instance spawn)
 *   DEAD     → 0 players for 60s (pruned automatically)
 */

export type RoomId = "pit" | "arena" | "court";

export interface Room {
  id:           RoomId;
  name:         string;
  tagline:      string;
  minBuyIn:     number;
  maxBuyIn:     number;
  maxPlayers:   number;
  startingBag:  number;
  baseCost:     number;
  costStep:     number;
  maxCost:      number;
  roundSeconds: number;
  accentColor:  string;
  accentRgba:   string;
  lockReason:   string | null;
  temporal: {
    enabled:       boolean;
    maxMultiplier: number;
    minMultiplier: number;
    sweetSpot:     number;
  };
}

export interface RoomInstance {
  /** Unique key: `${roomId}-${index}` e.g. "pit-0", "pit-1" */
  key:        string;
  roomId:     RoomId;
  /** Display index (1-based for humans: "The Pit #2") */
  index:      number;
  playerCount: number;
  bagAmount:  number;
  /** ms timestamp of last player activity — used for dead-instance pruning */
  lastActive: number;
  /** Round currently running in this instance */
  roundNumber: number;
  status:     "open" | "filling" | "full";
}

/** Fraction of maxPlayers at which a new instance is spawned */
export const SPAWN_THRESHOLD = 0.8;

/** Seconds of zero-player inactivity before an instance is pruned */
export const DEAD_INSTANCE_TTL_MS = 60_000;

export function getInstanceStatus(
  playerCount: number,
  maxPlayers: number,
): RoomInstance["status"] {
  const frac = playerCount / maxPlayers;
  if (frac >= SPAWN_THRESHOLD) return "full";
  if (frac >= 0.5) return "filling";
  return "open";
}

/**
 * Decide which instance a new player should join.
 * Rules:
 *   1. Prefer the instance with the most players that is NOT full
 *      (social proof — players prefer active rooms)
 *   2. If ALL instances are full, spawn a new one
 *   3. If no instances exist, create the first one
 */
export function selectInstanceForPlayer(
  instances: RoomInstance[],
  roomId: RoomId,
  _maxPlayers: number,
): { instance: RoomInstance | null; shouldSpawn: boolean } {
  const roomInstances = instances.filter((i) => i.roomId === roomId);

  if (roomInstances.length === 0) {
    return { instance: null, shouldSpawn: true };
  }

  // Find open/filling instances, sorted by player count descending (most active first)
  const available = roomInstances
    .filter((i) => i.status !== "full")
    .sort((a, b) => b.playerCount - a.playerCount);

  if (available.length > 0) {
    return { instance: available[0], shouldSpawn: false };
  }

  // All instances full — spawn a new one
  return { instance: null, shouldSpawn: true };
}

/**
 * Create a new instance for a room.
 * Index is derived from the current highest index + 1.
 */
export function createInstance(
  roomId: RoomId,
  existingInstances: RoomInstance[],
  startingBag: number,
): RoomInstance {
  const roomInstances = existingInstances.filter((i) => i.roomId === roomId);
  const maxIndex = roomInstances.reduce((m, i) => Math.max(m, i.index), 0);
  const newIndex = maxIndex + 1;
  return {
    key:         `${roomId}-${newIndex}`,
    roomId,
    index:       newIndex,
    playerCount: 0,
    bagAmount:   startingBag,
    lastActive:  Date.now(),
    roundNumber: 1,
    status:      "open",
  };
}

export const ROOMS: Record<RoomId, Room> = {
  pit: {
    id:           "pit",
    name:         "The Pit",
    tagline:      "Chaos. Anyone in. Last wolf wins.",
    minBuyIn:     0,
    maxBuyIn:     0.1,
    maxPlayers:   50,
    startingBag:  0.5,
    baseCost:     0.01,
    costStep:     0.005,
    maxCost:      0.1,
    roundSeconds: 30,
    accentColor:  "#00E676",
    accentRgba:   "rgba(0,230,118,",
    lockReason:   null,
    temporal: { enabled: false, maxMultiplier: 1, minMultiplier: 1, sweetSpot: 15 },
  },
  arena: {
    id:           "arena",
    name:         "The Arena",
    tagline:      "Mid stakes. Real competition.",
    minBuyIn:     0.1,
    maxBuyIn:     1,
    maxPlayers:   20,
    startingBag:  3,
    baseCost:     0.1,
    costStep:     0.025,
    maxCost:      0.5,
    roundSeconds: 30,
    accentColor:  "#FFD700",
    accentRgba:   "rgba(255,215,0,",
    lockReason:   null,
    temporal: { enabled: false, maxMultiplier: 1, minMultiplier: 1, sweetSpot: 25 },
  },
  court: {
    id:           "court",
    name:         "King's Court",
    tagline:      "High stakes. Whales only. No mercy.",
    minBuyIn:     1,
    maxBuyIn:     Infinity,
    maxPlayers:   10,
    startingBag:  10,
    baseCost:     0.5,
    costStep:     0.1,
    maxCost:      2,
    roundSeconds: 30,
    accentColor:  "#7000FF",
    accentRgba:   "rgba(112,0,255,",
    lockReason:   null,
    temporal: { enabled: false, maxMultiplier: 1, minMultiplier: 1, sweetSpot: 22 },
  },
} as const;

export const ROOM_ORDER: RoomId[] = ["pit", "arena", "court"];

export const ROOM_PLAYER_RANGES: Record<RoomId, [number, number]> = {
  pit:   [18, 48],
  arena: [6, 18],
  court: [2, 8],
};


// ─── Wallet Balance Gate ───────────────────────────────────────────────────────

export type WalletWarningLevel = "safe" | "tight" | "risky" | "danger";

export interface WalletWarning {
  level:   WalletWarningLevel;
  message: string;
  detail:  string;
}

/**
 * Returns a warning (or null if safe) based on the player's wallet balance
 * relative to the room they're trying to enter.
 *
 * Thresholds — "comfortable sessions" = 10 base-cost yoinks:
 *   safe:   balance >= 10 × baseCost  (can play 10+ rounds freely)
 *   tight:  balance >= 5 × baseCost   (can play 5 rounds — feel the squeeze)
 *   risky:  balance >= 1 × baseCost   (can afford entry but not much more)
 *   danger: balance < 1 × baseCost    (can't even afford one yoink)
 *
 * No hard blocks — players can always enter. This is a warning only.
 */
export function getWalletWarning(
  walletBalance: number,
  room: Room,
): WalletWarning | null {
  const base = room.baseCost;

  if (walletBalance < base) {
    return {
      level:   "danger",
      message: `Need ${base} SOL to play`,
      detail:  `Your wallet has ${walletBalance.toFixed(3)} SOL — not enough for one YOINK in ${room.name}.`,
    };
  }

  if (walletBalance < base * 3) {
    return {
      level:   "risky",
      message: `Low balance — risky`,
      detail:  `${walletBalance.toFixed(3)} SOL covers ${Math.floor(walletBalance / base)} yoink${Math.floor(walletBalance / base) !== 1 ? "s" : ""}. One bad round and you're out.`,
    };
  }

  if (walletBalance < base * 8) {
    return {
      level:   "tight",
      message: `Tight wallet`,
      detail:  `${walletBalance.toFixed(3)} SOL is enough to play but won't last long. ${room.name} recommends ${(base * 8).toFixed(2)}+ SOL.`,
    };
  }

  return null; // safe — no warning needed
}

/** Warning level colour for UI */
export function warningColor(level: WalletWarningLevel): string {
  switch (level) {
    case "danger": return "#FF2200";
    case "risky":  return "#FF6600";
    case "tight":  return "#FFD700";
    default:       return "#00E676";
  }
}
