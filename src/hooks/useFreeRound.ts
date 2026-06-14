/**
 * YOINK.GG — Free Round / Free-Siege Schedule Engine (Layer 3)
 *
 * ── Free Round (legacy "The Bag" cadence) ──────────────────────────────────
 * A "Free Round" is a 10-minute window that opens every 2 hours on a
 * deterministic wall-clock schedule — no server required. Anyone entering The
 * Pit during an active free round gets their first YOINK at zero cost.
 *
 *   Schedule: free round starts at minute 0 of every even UTC hour
 *     (00:00, 02:00, ... 22:00 UTC); active window: 10 minutes from the start.
 *
 * ── Free Siege (Wallet Wars beginner on-ramp · Task 6) ─────────────────────
 * `useFreeSiege` repurposes this hook for the "Siege the Vault" economy: a
 * claim WAIVES the attempt fee and sieges a HOUSE-OWNED training vault (never a
 * real player's vault). Any win is paid from a capped house promo pool. A daily
 * quota (3 / UTC day) is tracked in `localStorage` ("yoink_ww_free_v1"),
 * decremented on claim, refused at zero, and reset on the UTC day boundary. The
 * existing 2-hour `computeFreeRound` cadence is reused as a "free siege happy
 * hour" window. (Full siege UI is Task 7; this hook only owns the quota + claim.)
 *
 * The legacy `useFreeRound` / `computeFreeRound` / `FreeRoundState` exports are
 * preserved unchanged so existing consumers (`App`, `RoomSelectScreen`,
 * `LiveTicker`) keep compiling.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { rollFromSeed, type SiegeResult } from "@/lib/walletWarsState";
import { tierParamsFor, computePrize } from "@/lib/siegeMath";

const CYCLE_MS    = 2 * 60 * 60 * 1_000;  // 2 hours between free rounds
const DURATION_MS = 10 * 60 * 1_000;      // each free round lasts 10 minutes
const WARN_MS     = 30 * 60 * 1_000;      // show "upcoming" badge within 30 min

export interface FreeRoundState {
  /** True while a free round is currently running */
  isActive: boolean;
  /** Minutes remaining while active (0 when inactive) */
  minutesLeft: number;
  /** Minutes until the NEXT free round starts (0 while active) */
  minutesUntilNext: number;
  /** True when a free round starts within WARN_MS — show upcoming badge */
  isUpcoming: boolean;
  /** House-seeded bag amount for free rounds */
  bagSeed: number;
}

export function useFreeRound(): FreeRoundState {
  const [now, setNow] = useState(() => Date.now());

  // Refresh every 30 s — cheap, keeps countdown text accurate
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return computeFreeRound(now);
}

/** Pure computation — exported so components can call it without a hook. */
export function computeFreeRound(now: number): FreeRoundState {
  const cyclePos        = now % CYCLE_MS;                    // ms into current cycle
  const isActive        = cyclePos < DURATION_MS;
  const minutesLeft     = isActive
    ? Math.ceil((DURATION_MS - cyclePos) / 60_000)
    : 0;
  const msUntilNext     = isActive ? 0 : CYCLE_MS - cyclePos;
  const minutesUntilNext = isActive ? 0 : Math.ceil(msUntilNext / 60_000);
  const isUpcoming      = !isActive && msUntilNext <= WARN_MS;

  return { isActive, minutesLeft, minutesUntilNext, isUpcoming, bagSeed: 0.3 };
}

// ── Free-Siege beginner on-ramp (Task 6) ───────────────────────────────────────

/** localStorage key for the daily free-siege quota. */
export const FREE_SIEGE_KEY = "yoink_ww_free_v1";
/** Free sieges granted per UTC day. */
export const FREE_SIEGE_DAILY = 3;
/** Capped house promo pool (SOL) funding free-siege wins each UTC day. */
export const FREE_PROMO_POOL_CAP = 1.0;
/** Pit-class house training vault corpus a free siege always targets. */
export const TRAINING_VAULT_AMOUNT = 0.5;

const DAY_MS = 24 * 60 * 60 * 1_000;

/** Persisted daily quota record. */
export interface FreeSiegeQuota {
  /** UTC day index (whole days since epoch) the quota belongs to. */
  day: number;
  /** Remaining free sieges for `day`. */
  left: number;
  /** Remaining capped house promo pool (SOL) for `day`. */
  pool: number;
}

/** Reactive snapshot returned by the hook. */
export interface FreeSiegeState {
  /** Free sieges remaining today. */
  dailyLeft: number;
  /** True during the "free siege happy hour" (reuses the free-round cadence). */
  windowActive: boolean;
  /** Minutes until the quota resets at the next UTC day boundary. */
  nextResetMins: number;
}

/** Whole UTC days since the epoch — the day-boundary key for quota resets. */
export function utcDayIndex(now: number): number {
  return Math.floor(now / DAY_MS);
}

/** Minutes until the next UTC midnight (when the quota resets). */
export function minutesUntilUtcReset(now: number): number {
  return Math.ceil((DAY_MS - (now % DAY_MS)) / 60_000);
}

/**
 * Roll a (possibly stale or missing) quota forward to the current UTC day.
 * A new day — or no prior record — yields a full quota and a refilled promo
 * pool (Requirement 14.5). Pure & total.
 */
export function rolloverQuota(q: FreeSiegeQuota | null, now: number): FreeSiegeQuota {
  const day = utcDayIndex(now);
  if (!q || q.day !== day) {
    return { day, left: FREE_SIEGE_DAILY, pool: FREE_PROMO_POOL_CAP };
  }
  return q;
}

/** Result of attempting a free-siege claim. */
export interface FreeSiegeClaim {
  /** The quota after the claim (unchanged but rolled-over on a refusal). */
  quota: FreeSiegeQuota;
  /** The settled siege result, or `null` when the claim was refused (quota 0). */
  result: SiegeResult | null;
}

/**
 * Claim a free siege against a HOUSE-OWNED training vault (Requirement 14.2):
 * the fee is waived (`fee = 0`, nothing lost on a miss) and any win is paid from
 * the capped house promo pool (14.3). Decrements the daily quota (14.4); refuses
 * with `result: null` when no quota remains (14.6). The quota is rolled over to
 * the current UTC day first so a stale record self-resets. Pure & deterministic
 * given `seed`.
 */
export function claimFreeSiege(
  q: FreeSiegeQuota | null,
  now: number,
  seed: string,
): FreeSiegeClaim {
  const rolled = rolloverQuota(q, now);
  if (rolled.left <= 0) {
    return { quota: rolled, result: null }; // 14.6 — refuse when quota is zero
  }

  const params = tierParamsFor(TRAINING_VAULT_AMOUNT); // Pit-class training vault
  const roll = rollFromSeed(seed);
  const won = roll < params.winChance;
  const prize = computePrize(TRAINING_VAULT_AMOUNT, params, 1);
  // Win pays the raider-net slice, capped by the remaining promo pool.
  const payout = won ? Math.min(prize.toRaider, rolled.pool) : 0;

  const result: SiegeResult = {
    outcome: won ? "win" : "loss",
    pWin: params.winChance,
    fee: 0,            // 14.2 — attempt fee waived
    repeatTax: 0,
    seized: payout,    // 14.3 — paid from the capped house promo pool
    prizeGross: won ? prize.gross : 0,
    lost: 0,           // a free siege never costs the player anything
    streakAtSiege: 1,
    targetWallet: "House Training Vault",
    targetId: "house-training-vault",
    yourVaultAfter: 0, // free play — not tied to the player's real corpus
    roll,
    seed,
  };

  const quota: FreeSiegeQuota = {
    day: rolled.day,
    left: rolled.left - 1,                     // 14.4 — decrement on claim
    pool: Math.max(0, rolled.pool - payout),   // capped promo pool drains on a win
  };
  return { quota, result };
}

function freeSeed(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return Math.random().toString(16).slice(2).padEnd(32, "0");
}

function loadQuota(): FreeSiegeQuota | null {
  try {
    const raw = localStorage.getItem(FREE_SIEGE_KEY);
    if (raw) return JSON.parse(raw) as FreeSiegeQuota;
  } catch { /* storage unavailable / corrupt → fresh quota */ }
  return null;
}

function saveQuota(q: FreeSiegeQuota): void {
  try {
    localStorage.setItem(FREE_SIEGE_KEY, JSON.stringify(q));
  } catch { /* ignore — run in memory for the session */ }
}

/**
 * Free-siege beginner on-ramp hook (Requirement 14). Tracks the daily quota in
 * `localStorage`, resets it on the UTC day boundary, and exposes `claim()` which
 * sieges a house training vault with the fee waived (returns `null` once the
 * quota is exhausted). The "happy hour" window reuses the free-round cadence.
 */
export function useFreeSiege(): FreeSiegeState & { claim: () => SiegeResult | null } {
  const [now, setNow] = useState(() => Date.now());
  const [quota, setQuota] = useState<FreeSiegeQuota>(() => rolloverQuota(loadQuota(), Date.now()));
  const quotaRef = useRef(quota);
  quotaRef.current = quota;

  // Tick the clock so countdown text + the day-boundary reset stay current.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Reset the quota when the UTC day rolls over.
  useEffect(() => {
    const rolled = rolloverQuota(quotaRef.current, now);
    if (rolled !== quotaRef.current) {
      saveQuota(rolled);
      setQuota(rolled);
    }
  }, [now]);

  const claim = useCallback((): SiegeResult | null => {
    const claimed = claimFreeSiege(quotaRef.current, Date.now(), freeSeed());
    saveQuota(claimed.quota);
    setQuota(claimed.quota);
    return claimed.result;
  }, []);

  const windowState = computeFreeRound(now);
  return {
    dailyLeft: quota.left,
    windowActive: windowState.isActive,
    nextResetMins: minutesUntilUtcReset(now),
    claim,
  };
}
