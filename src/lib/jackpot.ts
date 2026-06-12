/**
 * YOINK.GG — Progressive Jackpot
 *
 * Funded by the 5% jackpot reserve already carved off every yoink
 * (GAME_CONFIG.JACKPOT_BPS) — so it costs the house nothing new; it just
 * turns a line-item that was already reserved into a live, climbing prize.
 *
 * Behaviour:
 *   - A single shared pool that persists across rooms AND reloads (localStorage)
 *     so the number is always "going up" — the core dopamine hook.
 *   - Drops at round end with a chance that SCALES with its size, so a fat
 *     jackpot is increasingly likely to pop (suspense + guaranteed eventual hit).
 *   - On a drop it pays a random ACTIVE participant (weighted by yoinks),
 *     not necessarily the king — surprise winners who never held the bag.
 *
 * In production this is an on-chain account; the drop roll uses the same VRF
 * as the fuse. Here it's a faithful client-side simulation.
 */

const STORAGE_KEY = "yoink_jackpot_v1";

/** Seed so a fresh session still shows a juicy, believable number. */
const SEED_MIN = 18;
const SEED_MAX = 64;

/** After a drop the pool reseeds to a small base so it climbs again. */
const RESEED_MIN = 2;
const RESEED_MAX = 6;

const DROP = {
  /** Base chance per round before any size scaling. */
  BASE_CHANCE: 0.015,
  /** Added chance per SOL in the pool. */
  CHANCE_PER_SOL: 0.0015,
  /** Hard cap so it never becomes a sure thing. */
  MAX_CHANCE: 0.22,
  /** Below this the pool can't drop — keeps payouts meaningful. */
  MIN_POOL: 5,
} as const;

const rand = (min: number, max: number) => +(min + Math.random() * (max - min)).toFixed(3);

export function loadJackpot(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch { /* private mode / disabled storage */ }
  const seed = rand(SEED_MIN, SEED_MAX);
  saveJackpot(seed);
  return seed;
}

export function saveJackpot(amount: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, amount.toFixed(6));
  } catch { /* ignore */ }
}

/** Probability the jackpot drops this round, given its current size. */
export function dropChance(pool: number): number {
  if (pool < DROP.MIN_POOL) return 0;
  return Math.min(
    DROP.BASE_CHANCE + pool * DROP.CHANCE_PER_SOL,
    DROP.MAX_CHANCE,
  );
}

/** Roll whether the jackpot drops this round. */
export function rollJackpotDrop(pool: number): boolean {
  return Math.random() < dropChance(pool);
}

/** Value the pool reseeds to after it pays out. */
export function reseedJackpot(): number {
  return rand(RESEED_MIN, RESEED_MAX);
}

export interface JackpotParticipant {
  wallet: string;
  isYou: boolean;
  weight: number;
}

export interface JackpotWinner {
  wallet: string;
  isYou: boolean;
}

/**
 * Pick a jackpot winner weighted by activity (yoink count).
 * Returns null if there are no participants.
 */
export function pickJackpotWinner(participants: JackpotParticipant[]): JackpotWinner | null {
  const pool = participants.filter((p) => p.weight > 0);
  if (pool.length === 0) return null;

  const total = pool.reduce((s, p) => s + p.weight, 0);
  let roll = Math.random() * total;
  for (const p of pool) {
    roll -= p.weight;
    if (roll <= 0) return { wallet: p.wallet, isYou: p.isYou };
  }
  const last = pool[pool.length - 1];
  return { wallet: last.wallet, isYou: last.isYou };
}
