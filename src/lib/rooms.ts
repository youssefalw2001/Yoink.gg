/**
 * YOINK.GG — Rooms / Leagues System
 *
 * Three tiers. Players self-select into fair fights.
 * Each room runs its own independent game loop via useGameState(roomId).
 */

export type RoomId = "pit" | "arena" | "court";

export interface Room {
  id:          RoomId;
  /** Display name */
  name:        string;
  /** One-liner shown on the card */
  tagline:     string;
  /** Min SOL buy-in to enter */
  minBuyIn:    number;
  /** Max SOL buy-in (Infinity = no cap) */
  maxBuyIn:    number;
  /** Max concurrent players */
  maxPlayers:  number;
  /** SOL the bag starts at each round */
  startingBag: number;
  /** Base YOINK cost in this room */
  baseCost:    number;
  /** Cost increment per yoink */
  costStep:    number;
  /** Max YOINK cost cap */
  maxCost:     number;
  /** Countdown seconds per round */
  roundSeconds: number;
  /** Colour accent used in the card UI */
  accentColor: string;
  /** Tailwind-safe rgba for glow / border */
  accentRgba:  string;
  /** Lock condition — null = always open */
  lockReason:  string | null;
}

export const ROOMS: Record<RoomId, Room> = {
  pit: {
    id:          "pit",
    name:        "The Pit",
    tagline:     "Chaos. Anyone in. Last wolf wins.",
    minBuyIn:    0,
    maxBuyIn:    0.1,
    maxPlayers:  50,
    startingBag: 0.5,
    baseCost:    0.01,
    costStep:    0.005,
    maxCost:     0.1,
    roundSeconds: 30,
    accentColor: "#00E676",
    accentRgba:  "rgba(0,230,118,",
    lockReason:  null,
  },
  arena: {
    id:          "arena",
    name:        "The Arena",
    tagline:     "Mid stakes. Real competition.",
    minBuyIn:    0.1,
    maxBuyIn:    1,
    maxPlayers:  20,
    startingBag: 3,
    baseCost:    0.1,
    costStep:    0.025,
    maxCost:     0.5,
    roundSeconds: 30,
    accentColor: "#FFD700",
    accentRgba:  "rgba(255,215,0,",
    lockReason:  null,
  },
  court: {
    id:          "court",
    name:        "King's Court",
    tagline:     "High stakes. Whales only. No mercy.",
    minBuyIn:    1,
    maxBuyIn:    Infinity,
    maxPlayers:  10,
    startingBag: 10,
    baseCost:    0.5,
    costStep:    0.1,
    maxCost:     2,
    roundSeconds: 30,
    accentColor: "#7000FF",
    accentRgba:  "rgba(112,0,255,",
    lockReason:  null,
  },
} as const;

export const ROOM_ORDER: RoomId[] = ["pit", "arena", "court"];

/** Simulated live player counts per room (updated by the hook). */
export const ROOM_PLAYER_RANGES: Record<RoomId, [number, number]> = {
  pit:   [18, 48],
  arena: [6, 18],
  court: [2, 8],
};
