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
  drainAmount: number;
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
  /**
   * The temporal multiplier currently applied to cost (for UI display only).
   * 1.0 = neutral (t=25s sweet spot). >1.0 = expensive early yoink.
   * <1.0 = cheap late snipe.
   */
  temporalMultiplier: number;
  biggestBag: number;
  totalDistributed: number;
  playerCount: number;
  playerCooldownUntil: number;
  isWaiting: boolean;
  totalDrained: number;
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

  BAG_BPS: 8_300,
  RAKE_BPS: 1_000,
  JACKPOT_BPS: 500,
  DRAIN_BPS: 200,

  DRAIN_TIERS: [
    { minBag: 0,  maxBag: 5,   bps: 100 },
    { minBag: 5,  maxBag: 20,  bps: 200 },
    { minBag: 20, maxBag: 999, bps: 300 },
  ] as const,

  /**
   * Temporal pricing curve — cost multiplier based on time remaining.
   *
   * Design intent:
   *   Early yoink (t≈30s) = expensive → you're buying a long runway, high EV
   *   Mid round  (t≈15s)  = neutral
   *   Late snipe (t≈5s)   = cheap   → high risk, you need to hold for only seconds
   *   Final snipe (t≈1s)  = cheapest → pure gamble, floored at MIN_TEMPORAL_MULT
   *
   * This creates natural player archetypes:
   *   Whale   → buys dominant position early, absorbs high cost
   *   Sniper  → waits for cheap window, high-risk play
   *   Grinder → mid-round opportunist
   *
   * Anti-exploitation: MIN_TEMPORAL_MULT floors the snipe cost so it's never
   * actually free. The 3s cooldown per wallet limits how many cheap snipes
   * any single wallet can land in the final seconds.
   */
  MAX_TEMPORAL_MULT: 3.0,   // multiplier at t=0s (round start, 30s remaining)
  MIN_TEMPORAL_MULT: 0.5,   // floor multiplier at t=29s (1s remaining)
  TEMPORAL_SWEET_SPOT: 25,  // seconds remaining where multiplier = 1.0 (neutral)
} as const;

/**
 * Pure function — temporal multiplier for a given countdown.
 *
 * Curve: piecewise linear
 *   countdown ≥ roundSeconds → MAX_TEMPORAL_MULT (3.0×)
 *   countdown = TEMPORAL_SWEET_SPOT (25s) → 1.0× (neutral)
 *   countdown ≤ 1s → MIN_TEMPORAL_MULT (0.5×)
 *
 * Between segments it's linear interpolation so the UI
 * can display a smooth cost animation as the clock ticks.
 */
export function getTemporalMultiplier(
  countdown: number,
  roundSeconds: number,
): number {
  const max   = GAME_CONFIG.MAX_TEMPORAL_MULT;
  const min   = GAME_CONFIG.MIN_TEMPORAL_MULT;
  const sweet = GAME_CONFIG.TEMPORAL_SWEET_SPOT;

  // Clamp countdown to valid range
  const t = Math.max(0, Math.min(roundSeconds, countdown));

  if (t >= sweet) {
    // Early phase: interpolate from max (at roundSeconds) down to 1.0 (at sweet)
    const frac = (t - sweet) / (roundSeconds - sweet);
    return +(1.0 + frac * (max - 1.0)).toFixed(4);
  } else {
    // Late phase: interpolate from 1.0 (at sweet) down to min (at 0)
    const frac = t / sweet;
    return +(min + frac * (1.0 - min)).toFixed(4);
  }
}

/**
 * Full cost for a yoink: combines yoink-count escalation WITH temporal
 * pricing. Both pressures stack multiplicatively.
 *
 * @param baseCost   - room's base cost (e.g. 0.1 SOL)
 * @param costStep   - room's per-yoink increment (e.g. 0.025 SOL)
 * @param maxCost    - room's cost cap (e.g. 0.5 SOL)
 * @param yoinkCount - number of yoinks already taken this round
 * @param countdown  - seconds remaining on the clock
 * @param roundSeconds - total seconds in the round
 */
export function getTemporalCost(
  baseCost: number,
  costStep: number,
  maxCost: number,
  yoinkCount: number,
  countdown: number,
  roundSeconds: number,
): number {
  // Step 1: yoink-count escalation (same as before)
  const countCost = baseCost + yoinkCount * costStep;

  // Step 2: apply temporal multiplier
  const mult = getTemporalMultiplier(countdown, roundSeconds);
  const raw  = countCost * mult;

  // Step 3: cap at maxCost, floor at baseCost * MIN_TEMPORAL_MULT
  const floor = +(baseCost * GAME_CONFIG.MIN_TEMPORAL_MULT).toFixed(3);
  return +Math.max(floor, Math.min(raw, maxCost)).toFixed(3);
}

/** SOL that flows into the bag from a payment of `cost`. */
export function bagAddFor(cost: number): number {
  return +(cost * (GAME_CONFIG.BAG_BPS / 10_000)).toFixed(6);
}

/** SOL drained FROM the bag on each yoink, based on current bag size. */
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
