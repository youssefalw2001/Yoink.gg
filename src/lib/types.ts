export interface King {
  wallet: string;
  heldFor: number;
  isYou: boolean;
  id: string;
}

export interface YoinkEvent {
  id: string;
  wallet: string;
  isYou: boolean;
  cost: number;
  bagAfter: number;
  drainAmount: number;   // SOL drained from bag on this yoink
  ts: number;
}

export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  solWon: number;
  dateWon: string;
  round: number;
  isYou: boolean;
}

export interface GameState {
  bagAmount: number;
  countdown: number;
  currentKing: string;
  kingIsYou: boolean;
  kingHeldFor: number;
  recentKings: King[];
  yoinkHistory: YoinkEvent[];
  roundNumber: number;
  isRoundOver: boolean;
  winner: string | null;
  winnerIsYou: boolean;
  yoinkCount: number;
  currentCost: number;
  biggestBag: number;
  totalDistributed: number;
  playerCount: number;
  playerCooldownUntil: number;
  isWaiting: boolean;
  /** running total of drain collected BY THE HOUSE this session */
  totalDrained: number;
  /** drain that bled off the bag in the current round */
  roundDrained: number;
}

export const GAME_CONFIG = {
  ROUND_SECONDS: 30,
  TICK_MS: 100,
  BASE_COST: 0.1,
  COST_STEP: 0.025,
  MAX_COST: 0.5,
  STARTING_BAG: 2,
  PLAYER_COOLDOWN_MS: 3_000,
  MIN_PLAYERS: 3,
  BOT_SNIPE_JITTER_MS: 800,

  // ── Payment split (must sum to 10_000 bps) ──────────────────────────────
  // Original: 8500 bag / 1000 rake / 500 jackpot
  // New:      8300 bag / 1000 rake / 500 jackpot / 200 drain
  BAG_BPS: 8_300,       // 83 % → bag
  RAKE_BPS: 1_000,      // 10 % → treasury rake
  JACKPOT_BPS: 500,     //  5 % → jackpot reserve
  DRAIN_BPS: 200,       //  2 % → house drain (straight to you, from every YOINK)

  // ── Escalating drain tiers — based on current bag size ──────────────────
  // The bigger the bag, the harder the drain bleeds.
  DRAIN_TIERS: [
    { minBag: 0,  maxBag: 5,   bps: 100 },  // bag < 5 SOL   → 1% drain/yoink
    { minBag: 5,  maxBag: 20,  bps: 200 },  // 5–20 SOL      → 2% drain/yoink
    { minBag: 20, maxBag: 999, bps: 300 },  // > 20 SOL      → 3% drain/yoink
  ] as const,
} as const;

/** Cost of the nth yoink this round (0-indexed count). */
export function yoinkCostAt(count: number): number {
  const raw = GAME_CONFIG.BASE_COST + count * GAME_CONFIG.COST_STEP;
  return +Math.min(raw, GAME_CONFIG.MAX_COST).toFixed(3);
}

/** SOL that flows into the bag from a payment of `cost`. */
export function bagAddFor(cost: number): number {
  return +(cost * (GAME_CONFIG.BAG_BPS / 10_000)).toFixed(6);
}

/** SOL drained FROM the bag on each yoink, based on current bag size.
 *  This is separate from the payment split — it bleeds the existing bag. */
export function drainFor(bagAmount: number): number {
  const tier = GAME_CONFIG.DRAIN_TIERS.find(
    (t) => bagAmount >= t.minBag && bagAmount < t.maxBag,
  ) ?? GAME_CONFIG.DRAIN_TIERS[GAME_CONFIG.DRAIN_TIERS.length - 1];
  return +(bagAmount * (tier.bps / 10_000)).toFixed(6);
}

/** Current drain % label for the UI (e.g. "2%"). */
export function drainPctLabel(bagAmount: number): string {
  const tier = GAME_CONFIG.DRAIN_TIERS.find(
    (t) => bagAmount >= t.minBag && bagAmount < t.maxBag,
  ) ?? GAME_CONFIG.DRAIN_TIERS[GAME_CONFIG.DRAIN_TIERS.length - 1];
  return `${tier.bps / 100}%`;
}
