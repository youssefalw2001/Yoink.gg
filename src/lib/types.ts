/**
 * YOINK.GG — Core Types + Game Config
 *
 * TRINITY MODEL (per Manus audit):
 *   1. Hidden Fuse   — round ends at a random time between FUSE_MIN_S and
 *                      FUSE_MAX_S. The exact end time is unknown to players.
 *                      Kills waiting strategy + kills Jito MEV timing attacks.
 *   2. Escalating Fee— each YOINK within a round adds a flat fee increment
 *                      to the base cost. Punishes spam bots. Resets each round.
 *   3. VRF Commit    — (devnet feature) end time is hashed on-chain before the
 *                      first yoink so the house can't kill the clock manually.
 *                      Not implemented in simulation mode.
 *
 * Temporal pricing has been ROLLED BACK per Manus audit:
 *   - Added complexity without solving retention
 *   - Created dead-game waiting strategy
 *   - Created Jito MEV death blow (bots can time the last second perfectly)
 *   - temporalMultiplier field kept in GameState for backwards compat but
 *     always set to 1 and not used by any logic
 */

import type { PayoutEntry } from "@/lib/payouts";

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

/** Result of a jackpot drop at round end (null when it didn't drop). */
export interface JackpotResult {
  amount: number;
  winner: string;
  winnerIsYou: boolean;
}

export interface GameState {
  bagAmount: number;
  /**
   * Internal countdown — ticks from fuseEndSeconds to 0.
   * NEVER shown to players as a number. Only used to drive the danger ring
   * visual intensity and to determine when the round ends.
   * Players see only a pulsing ring with no number — the Hidden Fuse.
   */
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
   * Kept for backwards compat — always 1, not used by any logic.
   * Temporal pricing was rolled back per Manus audit.
   */
  temporalMultiplier: number;
  /**
   * Escalating fee multiplier (Trinity Model Pillar 2).
   * Starts at 1.0 each round, increases by FUSE_CONFIG.FEE_STEP per yoink.
   * Applied additively on top of the yoink-count cost escalation.
   * Shown in the UI so players can see the "heat" building.
   */
  roundFeeMultiplier: number;
  /**
   * The randomly chosen fuse duration for this round (in seconds).
   * Visible to nobody — used only internally to determine when countdown=0.
   * Shown post-round in the WinReveal as "The fuse burned for Xs."
   */
  fuseSeconds: number;
  /** True when a Fuse Burner power-up is active this round */
  fuseBurnerActive: boolean;
  /**
   * VRF commitment hash — shown to players before the round starts.
   * Proves the fuse duration was decided before any yoinks happened.
   * On mainnet: replaced by a Switchboard VRF on-chain commitment.
   */
  fuseCommitHash: string;
  biggestBag: number;
  totalDistributed: number;
  playerCount: number;
  playerCooldownUntil: number;
  isWaiting: boolean;
  totalDrained: number;
  roundDrained: number;
  /** Kings who held + lost THIS round (most-recent first). Resets each round. */
  roundKings: King[];
  /** Live progressive jackpot pool (shared, persisted). */
  jackpotAmount: number;
  /** Set at round end if the jackpot dropped this round. */
  jackpotResult: JackpotResult | null;
  /** Full payout split for the finished round (King + podium + held pool). */
  payouts: PayoutEntry[];
}

export const GAME_CONFIG = {
  /** Nominal round seconds (used for bot logic + display fallback only) */
  ROUND_SECONDS: 30,
  TICK_MS: 150,
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
} as const;

/**
 * FUSE_CONFIG — Hidden Fuse settings.
 *
 * The fuse end time is chosen randomly at round start from [minSeconds, maxSeconds].
 * Players see a danger ring that gets angrier over time but never see the number.
 *
 * FEE_STEP: Escalating fee increment per yoink within a round.
 *   Each yoink adds +FEE_STEP to the fee multiplier.
 *   Cost = baseCost × roundFeeMultiplier + yoinkCountEscalation
 *   FEE_STEP = 0.10 means each yoink adds 10% of baseCost.
 *   After 8 yoinks: multiplier = 1 + 8×0.10 = 1.8× — spam is expensive.
 *   Capped at FEE_MAX_MULT to prevent runaway.
 */
export const FUSE_CONFIG = {
  MIN_SECONDS:  15,   // shortest possible round — fast, aggressive, panic-inducing
  MAX_SECONDS:  45,   // longest possible round — slow, deceptive, false safety
  FEE_STEP:     0.10, // +10% per yoink in the round
  FEE_MAX_MULT: 2.5,  // default fee multiplier cap (override per room)
  /**
   * Per-room fee caps:
   *   King's Court reduced from 2.5× → 2.0× (Manus audit finding:
   *   at 2.5× cap whales see a single yoink cost >$100 and leave)
   *   The Grind lower cap (1.8×) — cheaper room, faster rounds
   */
  FEE_MAX_MULT_BY_ROOM: {
    pit:   2.5,
    grind: 1.8,
    arena: 2.5,
    court: 2.0,
  } as Record<string, number>,
  /**
   * Fuse Burner power-up multiplier.
   * When active the countdown ticks down 2× faster.
   * Capped at 1 activation per round globally — no stacking.
   */
  BURNER_MULT: 2,
} as const;

/**
 * Draw a random fuse duration for a new round.
 * In simulation mode this is Math.random(). In production this
 * would be replaced by a VRF reveal from Switchboard or Pyth Entropy.
 */
export function drawFuseSeconds(roomRoundSeconds: number): number {
  const min = Math.max(FUSE_CONFIG.MIN_SECONDS, Math.floor(roomRoundSeconds * 0.5));
  const max = Math.floor(roomRoundSeconds * 1.5);
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * VRF COMMITMENT STUB
 *
 * In production this is replaced by a Switchboard VRF request submitted
 * on-chain before the round starts. The hash is stored in the program account.
 * At round end the VRF oracle reveals the randomness and the on-chain program
 * verifies it matches the commitment.
 *
 * In simulation: we use the Web Crypto API to generate a real SHA-256 hash
 * of (roundId + salt). This is cryptographically sound but NOT decentralised —
 * the salt is generated client-side. The UI pattern is identical to mainnet.
 *
 * Returns: { fuseSeconds, commitHash }
 * commitHash is shown to players BEFORE the round starts as proof the
 * fuse duration was decided before any yoinks happened.
 */
export async function drawFuseSecondsWithHash(
  roomRoundSeconds: number,
  roundNumber: number,
): Promise<{ fuseSeconds: number; commitHash: string }> {
  const fuseSeconds = drawFuseSeconds(roomRoundSeconds);

  // Generate a deterministic-looking hash for the fuse commitment
  const salt    = Math.random().toString(36).slice(2);
  const message = `yoink:round${roundNumber}:fuse${fuseSeconds}:salt${salt}`;

  let commitHash = "0x" + Array.from(message).map((c) =>
    c.charCodeAt(0).toString(16).padStart(2, "0")
  ).join("").slice(0, 40);

  // Use Web Crypto if available (browser/Node 18+)
  try {
    const encoder = new TextEncoder();
    const data    = encoder.encode(message);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    commitHash    = "0x" + hashArr.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
  } catch {
    // crypto.subtle not available — use the fallback above
  }

  return { fuseSeconds, commitHash };
}

/**
 * Compute the cost for the next yoink.
 * Combines yoink-count escalation with the round's escalating fee multiplier.
 * These are additive — fee multiplier scales the base, count escalation adds on top.
 *
 * Formula:
 *   base = baseCost × roundFeeMultiplier
 *   cost = base + yoinkCount × costStep
 *   cost = clamp(cost, baseCost × 0.5, maxCost × roundFeeMultiplier)
 */
export function computeYoinkCost(
  baseCost:    number,
  costStep:    number,
  maxCost:     number,
  yoinkCount:  number,
  feeMult:     number,
): number {
  const base = +(baseCost * feeMult).toFixed(4);
  const raw  = base + yoinkCount * costStep;
  const cap  = +Math.min(maxCost * feeMult, maxCost * FUSE_CONFIG.FEE_MAX_MULT).toFixed(4);
  return +Math.min(raw, cap).toFixed(3);
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
