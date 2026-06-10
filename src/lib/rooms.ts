/**
 * YOINK.GG — Rooms / Leagues System
 *
 * Three tiers. Players self-select into fair fights.
 * Each room runs its own independent game loop via useGameState(roomId).
 */

export type RoomId = "pit" | "arena" | "court";

export interface Room {
  id:          RoomId;
  name:        string;
  tagline:     string;
  minBuyIn:    number;
  maxBuyIn:    number;
  maxPlayers:  number;
  startingBag: number;
  baseCost:    number;
  costStep:    number;
  maxCost:     number;
  roundSeconds: number;
  accentColor: string;
  accentRgba:  string;
  lockReason:  string | null;

  /**
   * Temporal pricing configuration per room.
   *
   * enabled       — whether temporal pricing is active in this room.
   *                 The Pit keeps it off so beginners aren't confused.
   *                 The Arena and King's Court enable it for strategic depth.
   *
   * maxMultiplier — ceiling multiplier applied at round start (t=roundSeconds).
   *                 King's Court is higher (3.5×) to widen the strategic spread
   *                 since whales playing for 10 SOL bags have more skin in early
   *                 positioning. The Pit stays at 1.0 (flat, off).
   *
   * minMultiplier — floor applied in the final second. Prevents the cost from
   *                 collapsing to near-zero which would be bot-farmable.
   *
   * sweetSpot     — seconds remaining where multiplier = 1.0 (neutral cost).
   *                 Yoinks at exactly sweetSpot seconds pay exactly the
   *                 yoink-count-escalated price with no temporal adjustment.
   */
  temporal: {
    enabled:       boolean;
    maxMultiplier: number;
    minMultiplier: number;
    sweetSpot:     number;  // seconds remaining = neutral (1.0×)
  };
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
    // Temporal pricing OFF in The Pit.
    // New players shouldn't encounter a dynamic cost curve
    // until they understand the core game loop.
    temporal: {
      enabled:       false,
      maxMultiplier: 1.0,
      minMultiplier: 1.0,
      sweetSpot:     15,
    },
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
    // Standard temporal spread: 3× at open, 0.5× in final second.
    // Sweet spot at 25s remaining = neutral cost.
    temporal: {
      enabled:       true,
      maxMultiplier: 3.0,
      minMultiplier: 0.5,
      sweetSpot:     25,
    },
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
    // Wider spread in King's Court: 3.5× at open, 0.4× floor.
    // Whales playing for 10+ SOL bags have more reason to lock in
    // dominant positions early. The higher max makes early entry
    // even more strategically loaded.
    temporal: {
      enabled:       true,
      maxMultiplier: 3.5,
      minMultiplier: 0.4,
      sweetSpot:     22,
    },
  },
} as const;

export const ROOM_ORDER: RoomId[] = ["pit", "arena", "court"];

export const ROOM_PLAYER_RANGES: Record<RoomId, [number, number]> = {
  pit:   [18, 48],
  arena: [6, 18],
  court: [2, 8],
};
