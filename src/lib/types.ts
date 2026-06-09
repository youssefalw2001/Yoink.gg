export interface King {
  /** wallet address (or "You") */
  wallet: string;
  /** seconds this king held the bag */
  heldFor: number;
  /** was this the player? */
  isYou: boolean;
  /** unique id for list keys */
  id: string;
}

export interface YoinkEvent {
  id: string;
  wallet: string;
  isYou: boolean;
  cost: number;       // SOL paid for this yoink
  bagAfter: number;   // bag size immediately after
  ts: number;         // Date.now()
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
  /** live feed of every yoink this round */
  yoinkHistory: YoinkEvent[];
  roundNumber: number;
  isRoundOver: boolean;
  winner: string | null;
  winnerIsYou: boolean;
  /** escalating cost — resets each round */
  yoinkCount: number;
  currentCost: number;
  /** stats */
  biggestBag: number;
  totalDistributed: number;
  playerCount: number;
  /** bot protection — player cooldown end timestamp (ms) */
  playerCooldownUntil: number;
  /** lobby: waiting for minimum players */
  isWaiting: boolean;
}

export const GAME_CONFIG = {
  ROUND_SECONDS: 30,
  TICK_MS: 100,
  BASE_COST: 0.1,
  /** cost multiplier per yoink within a round */
  COST_STEP: 0.025,
  /** hard ceiling on cost per yoink */
  MAX_COST: 0.5,
  BAG_SHARE: 0.85,   // 85% to bag
  RAKE: 0.10,        // 10% rake
  JACKPOT: 0.05,     // 5% jackpot reserve
  STARTING_BAG: 2,
  /** player cooldown after yoinking (ms) */
  PLAYER_COOLDOWN_MS: 3_000,
  /** minimum simulated active players before round starts */
  MIN_PLAYERS: 3,
  /** anti-snipe: random extra delay added to bot yoinks in last 5s (ms) */
  BOT_SNIPE_JITTER_MS: 800,
} as const;

/** Compute the cost of the nth yoink this round (0-indexed). */
export function yoinkCostAt(count: number): number {
  const raw = GAME_CONFIG.BASE_COST + count * GAME_CONFIG.COST_STEP;
  return +Math.min(raw, GAME_CONFIG.MAX_COST).toFixed(3);
}

/** How much of a yoink payment goes into the bag. */
export function bagAddFor(cost: number): number {
  return +(cost * GAME_CONFIG.BAG_SHARE).toFixed(6);
}
