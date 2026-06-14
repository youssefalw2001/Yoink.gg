/**
 * Free-siege beginner on-ramp tests (Task 6.1).
 *
 * Feature: wallet-wars-siege-economy
 *
 * Asserts the daily-quota mechanics of the repurposed `useFreeRound → useFreeSiege`
 * hook, exercised through its pure core (`claimFreeSiege` / `rolloverQuota`):
 *   - a claim decrements the daily quota (Req 14.4)
 *   - the quota resets on the UTC day boundary (Req 14.5)
 *   - a zero quota refuses the claim with `result: null` (Req 14.6)
 *   - a free siege waives the fee and targets a house training vault (Req 14.2)
 */

import { describe, it, expect } from "vitest";
import {
  claimFreeSiege,
  rolloverQuota,
  utcDayIndex,
  FREE_SIEGE_DAILY,
  FREE_PROMO_POOL_CAP,
  type FreeSiegeQuota,
} from "./useFreeRound";

const DAY_MS = 24 * 60 * 60 * 1_000;
// A representative within-day timestamp (noon UTC on some day).
const DAY_N = 20_000;
const NOON = DAY_N * DAY_MS + DAY_MS / 2;

describe("rolloverQuota (Req 14.5 — UTC day reset)", () => {
  it("grants a full quota when there is no prior record", () => {
    const q = rolloverQuota(null, NOON);
    expect(q.day).toBe(utcDayIndex(NOON));
    expect(q.left).toBe(FREE_SIEGE_DAILY);
    expect(q.pool).toBe(FREE_PROMO_POOL_CAP);
  });

  it("resets a spent quota once the UTC day rolls over", () => {
    const spent: FreeSiegeQuota = { day: DAY_N, left: 0, pool: 0 };
    // Same day → unchanged (identity preserved).
    expect(rolloverQuota(spent, NOON)).toBe(spent);
    // Next UTC day → refilled.
    const next = rolloverQuota(spent, NOON + DAY_MS);
    expect(next.day).toBe(DAY_N + 1);
    expect(next.left).toBe(FREE_SIEGE_DAILY);
    expect(next.pool).toBe(FREE_PROMO_POOL_CAP);
  });
});

describe("claimFreeSiege (Req 14.2, 14.4, 14.6)", () => {
  it("decrements the daily quota on each claim and waives the fee", () => {
    let q = rolloverQuota(null, NOON);
    for (let i = 0; i < FREE_SIEGE_DAILY; i++) {
      const claim = claimFreeSiege(q, NOON, `free-${i}`);
      expect(claim.result).not.toBeNull();
      // Fee waived, no loss, house-owned training target (14.2).
      expect(claim.result!.fee).toBe(0);
      expect(claim.result!.lost).toBe(0);
      expect(claim.result!.targetId).toBe("house-training-vault");
      // Quota decremented by exactly one (14.4).
      expect(claim.quota.left).toBe(q.left - 1);
      q = claim.quota;
    }
    expect(q.left).toBe(0);
  });

  it("refuses the claim once the quota is exhausted (Req 14.6)", () => {
    const empty: FreeSiegeQuota = { day: utcDayIndex(NOON), left: 0, pool: FREE_PROMO_POOL_CAP };
    const claim = claimFreeSiege(empty, NOON, "free-x");
    expect(claim.result).toBeNull();
    expect(claim.quota.left).toBe(0); // stays at zero, no underflow
  });

  it("self-resets a stale-day quota then allows the claim", () => {
    const stale: FreeSiegeQuota = { day: DAY_N - 5, left: 0, pool: 0 };
    const claim = claimFreeSiege(stale, NOON, "free-y");
    expect(claim.result).not.toBeNull();
    expect(claim.quota.day).toBe(utcDayIndex(NOON));
    expect(claim.quota.left).toBe(FREE_SIEGE_DAILY - 1);
  });

  it("pays a win only from the capped promo pool", () => {
    // Find a seed that wins against the Pit training vault, with a tiny pool.
    const tiny: FreeSiegeQuota = { day: utcDayIndex(NOON), left: 3, pool: 0.001 };
    let winClaim = null as ReturnType<typeof claimFreeSiege> | null;
    for (let i = 0; i < 100_000 && !winClaim; i++) {
      const c = claimFreeSiege(tiny, NOON, `w-${i}`);
      if (c.result && c.result.outcome === "win") winClaim = c;
    }
    expect(winClaim).not.toBeNull();
    // Payout is clamped to the remaining pool, which then drains to >= 0.
    expect(winClaim!.result!.seized).toBeLessThanOrEqual(0.001 + 1e-12);
    expect(winClaim!.quota.pool).toBeGreaterThanOrEqual(0);
  });
});
