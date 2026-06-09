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
  roundNumber: number;
  isRoundOver: boolean;
  winner: string | null;
  winnerIsYou: boolean;
  /** stats */
  biggestBag: number;
  totalDistributed: number;
  playerCount: number;
}

export const GAME_CONFIG = {
  ROUND_SECONDS: 30,
  TICK_MS: 100,
  YOINK_COST: 0.1,
  BAG_ADD: 0.085,
  RAKE: 0.01,
  JACKPOT: 0.005,
  STARTING_BAG: 2,
} as const;
