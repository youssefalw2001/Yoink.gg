/**
 * Tests for the pure Siege money-math module.
 *
 * Feature: wallet-wars-siege-economy
 *
 * Contains the worked-example unit tests (design Worked Examples A & B) and the
 * numbered correctness-property tests from the design's "Correctness Properties"
 * section. Each property test runs a minimum of 100 iterations.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  PIT_PARAMS,
  COURT_PARAMS,
  TIER_PARAMS,
  STREAK_CFG,
  type TierParams,
  tierParamsFor,
  feeMultiplierForStreak,
  computeFee,
  computePrize,
  settleFailure,
  settleSuccess,
  evRaider,
  evDefender,
  evHouse,
} from "./siegeMath";
import { WAR_CONFIG, tierIndexForAmount } from "./walletWarsState";

const M_MAX = 1 + STREAK_CFG.step * STREAK_CFG.cap; // 2.0
const TAX_CAP = WAR_CONFIG.REPEAT_TAX_CAP; // 1.2

/** Relative-tolerance closeness check (absolute error scales with magnitude). */
function closeTo(actual: number, expected: number, scale = 1): boolean {
  return Math.abs(actual - expected) <= 1e-6 * Math.max(1, Math.abs(scale), Math.abs(expected));
}

// ── Generators ────────────────────────────────────────────────────────────────

const corpusArb = fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true });
const streakArb = fc.nat({ max: 200 });
const taxMultArb = fc.double({ min: 0, max: TAX_CAP, noNaN: true, noDefaultInfinity: true });
const tierArb = fc.constantFrom(...TIER_PARAMS);

// ── 1.5 Worked-example unit tests ─────────────────────────────────────────────

describe("worked examples (exact published rows)", () => {
  it("Worked Example A — 20 SOL whale vault (King's Court)", () => {
    const V = 20;
    const mult = 1;
    const fee = computeFee(V, COURT_PARAMS, mult, 0);
    const prize = computePrize(V, COURT_PARAMS, mult);

    expect(fee.baseFee).toBeCloseTo(0.16, 9); // attempt fee F = 0.008·20
    expect(fee.fee).toBeCloseTo(0.16, 9);
    expect(fee.repeatTax).toBeCloseTo(0, 9);
    expect(fee.toDefenderOnFail).toBeCloseTo(0.136, 9); // (1−0.15)·0.16
    expect(fee.toHouseOnFail).toBeCloseTo(0.024, 9); // 0.15·0.16

    expect(prize.gross).toBeCloseTo(1.8, 9); // 0.09·20
    expect(prize.toRaider).toBeCloseTo(1.476, 9); // ×(1−0.18)
    expect(prize.toHouse).toBeCloseTo(0.324, 9); // ×0.18

    // EV per attempt as a fraction of V, and scaled to 20 SOL.
    expect(evRaider(COURT_PARAMS)).toBeCloseTo(-0.003572, 9);
    expect(evRaider(COURT_PARAMS) * V).toBeCloseTo(-0.07144, 9);
    expect(evDefender(COURT_PARAMS) * V).toBeCloseTo(0.028, 9);
    expect(evHouse(COURT_PARAMS) * V).toBeCloseTo(0.04344, 9);
    // Raider edge as a percentage of the fee.
    expect(evRaider(COURT_PARAMS) / COURT_PARAMS.feeRate).toBeCloseTo(-0.4465, 9);
  });

  it("Worked Example B — 1 SOL vault (Pit on-ramp)", () => {
    const V = 1;
    const mult = 1;
    const fee = computeFee(V, PIT_PARAMS, mult, 0);
    const prize = computePrize(V, PIT_PARAMS, mult);

    expect(fee.baseFee).toBeCloseTo(0.02, 9); // 0.02·1
    expect(fee.fee).toBeCloseTo(0.02, 9);
    expect(fee.toDefenderOnFail).toBeCloseTo(0.0198, 9); // (1−0.01)·0.02
    expect(fee.toHouseOnFail).toBeCloseTo(0.0002, 9); // 0.01·0.02

    expect(prize.gross).toBeCloseTo(0.15, 9); // 0.15·1
    expect(prize.toRaider).toBeCloseTo(0.147, 9); // ×(1−0.02)
    expect(prize.toHouse).toBeCloseTo(0.003, 9); // ×0.02

    expect(evRaider(PIT_PARAMS)).toBeCloseTo(-0.00236, 9);
    expect(evDefender(PIT_PARAMS)).toBeCloseTo(0.0018, 9);
    expect(evHouse(PIT_PARAMS)).toBeCloseTo(0.00056, 9);
    expect(evRaider(PIT_PARAMS) / PIT_PARAMS.feeRate).toBeCloseTo(-0.118, 9);
  });

  it("tierParamsFor resolves via the engine's tierIndexForAmount boundaries", () => {
    expect(tierParamsFor(0.25).id).toBe("pit");
    expect(tierParamsFor(1).id).toBe("grind"); // boundary: 1 → grind
    expect(tierParamsFor(5).id).toBe("arena");
    expect(tierParamsFor(20).id).toBe("court"); // boundary: 20 → court
    expect(tierParamsFor(0).id).toBe(TIER_PARAMS[0].id);
  });
});

// ── 1.6 Property 1 — Conservation / zero-sum ──────────────────────────────────

describe("Property 1: Conservation (zero-sum)", () => {
  it("every settlement conserves SOL and fee/prize splits are exact", () => {
    // Feature: wallet-wars-siege-economy, Property 1
    fc.assert(
      fc.property(corpusArb, tierArb, streakArb, taxMultArb, (V, params, streak, taxMult) => {
        const mult = feeMultiplierForStreak(streak, STREAK_CFG);
        const fee = computeFee(V, params, mult, taxMult);
        const prize = computePrize(V, params, mult);

        const fail = settleFailure(fee);
        const win = settleSuccess(fee, prize);

        const failSum = fail.raider + fail.defender + fail.house + fail.corpus;
        const winSum = win.raider + win.defender + win.house + win.corpus;

        return (
          closeTo(failSum, 0, V) &&
          closeTo(winSum, 0, V) &&
          closeTo(fee.toDefenderOnFail + fee.toHouseOnFail, fee.fee, V) &&
          closeTo(prize.toRaider + prize.toHouse, prize.gross, V)
        );
      }),
      { numRuns: 200 },
    );
  });
});

// ── 1.7 Property 8 — EV sign invariants per tier ──────────────────────────────

describe("Property 8: Sign guarantees", () => {
  it("raider < 0, defender ≥ 0, house > 0 for all four tiers", () => {
    // Feature: wallet-wars-siege-economy, Property 8
    fc.assert(
      fc.property(tierArb, (params) => {
        return evRaider(params) < 0 && evDefender(params) >= 0 && evHouse(params) > 0;
      }),
      { numRuns: 100 },
    );
    // Exhaustive belt-and-braces across the published sets.
    for (const params of TIER_PARAMS) {
      expect(evRaider(params)).toBeLessThan(0);
      expect(evDefender(params)).toBeGreaterThanOrEqual(0);
      expect(evHouse(params)).toBeGreaterThan(0);
    }
  });
});

// ── 1.8 Property 2 — Bounded raider downside ──────────────────────────────────

describe("Property 2: Bounded downside", () => {
  it("raider loss equals the fee and is bounded by f·V·m_max·(1+cap)", () => {
    // Feature: wallet-wars-siege-economy, Property 2
    fc.assert(
      fc.property(corpusArb, tierArb, streakArb, taxMultArb, (V, params, streak, taxMult) => {
        const mult = feeMultiplierForStreak(streak, STREAK_CFG);
        const fee = computeFee(V, params, mult, taxMult);
        const fail = settleFailure(fee);

        const lossEqualsFee = closeTo(-fail.raider, fee.fee, V);
        const bound = params.feeRate * V * M_MAX * (1 + TAX_CAP);
        const bounded = fee.fee <= bound + 1e-6 * Math.max(1, bound);
        return lossEqualsFee && bounded;
      }),
      { numRuns: 200 },
    );
  });
});

// ── 1.9 Property 3 — Slice ≤ corpus ───────────────────────────────────────────

describe("Property 3: Slice bound", () => {
  it("gross prize never exceeds the corpus for any V and streak", () => {
    // Feature: wallet-wars-siege-economy, Property 3
    fc.assert(
      fc.property(corpusArb, tierArb, streakArb, (V, params, streak) => {
        const mult = feeMultiplierForStreak(streak, STREAK_CFG);
        const prize = computePrize(V, params, mult);
        return prize.gross <= V + 1e-9 * Math.max(1, V) && prize.gross >= 0;
      }),
      { numRuns: 200 },
    );
  });
});

// ── 1.10 Properties 7 & 10 — Streak EV-ratio invariance + monotone multiplier ──

describe("Property 7: Streak EV-ratio invariance", () => {
  it("scaling f and s by m_k leaves evRaider/fee unchanged", () => {
    // Feature: wallet-wars-siege-economy, Property 7
    fc.assert(
      fc.property(tierArb, streakArb, (params, streak) => {
        const m = feeMultiplierForStreak(streak, STREAK_CFG);
        const baseRatio = evRaider(params) / params.feeRate;
        const scaled: TierParams = {
          ...params,
          feeRate: params.feeRate * m,
          sliceRate: params.sliceRate * m,
        };
        const scaledRatio = evRaider(scaled) / scaled.feeRate;
        return closeTo(scaledRatio, baseRatio);
      }),
      { numRuns: 200 },
    );
  });
});

describe("Property 10: Monotone, bounded multiplier", () => {
  it("feeMultiplierForStreak is non-decreasing and within [1, 1+step·cap]", () => {
    // Feature: wallet-wars-siege-economy, Property 10
    fc.assert(
      fc.property(streakArb, streakArb, (a, b) => {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const mLo = feeMultiplierForStreak(lo, STREAK_CFG);
        const mHi = feeMultiplierForStreak(hi, STREAK_CFG);
        const monotone = mHi >= mLo;
        const bounded = mLo >= 1 && mHi <= M_MAX + 1e-12;
        return monotone && bounded;
      }),
      { numRuns: 200 },
    );
  });
});

// ── 1.11 Property 5 — Collusion is −EV ────────────────────────────────────────

describe("Property 5: Collusion is strictly −EV", () => {
  it("summed internal EV equals −(ρ_fee·f + p·ρ_prize·s)·V < 0 per attempt", () => {
    // Feature: wallet-wars-siege-economy, Property 5
    fc.assert(
      fc.property(corpusArb, tierArb, (V, params) => {
        // A closed group contains both the raider and the defender; the house is
        // external. Their combined internal EV is therefore −evHouse.
        const internal = (evRaider(params) + evDefender(params)) * V;
        const expected = -evHouse(params) * V;
        return closeTo(internal, expected, V) && internal < 0;
      }),
      { numRuns: 200 },
    );
  });
});

// sanity: index mapping aligns params array with the engine
describe("tier index alignment", () => {
  it("TIER_PARAMS order matches tierIndexForAmount", () => {
    expect(TIER_PARAMS[tierIndexForAmount(0.25)].id).toBe("pit");
    expect(TIER_PARAMS[tierIndexForAmount(2)].id).toBe("grind");
    expect(TIER_PARAMS[tierIndexForAmount(10)].id).toBe("arena");
    expect(TIER_PARAMS[tierIndexForAmount(50)].id).toBe("court");
  });
});
