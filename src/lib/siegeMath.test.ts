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
  resolveVaultParams,
  RISK_PROFILE_ORDER,
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

    expect(fee.baseFee).toBeCloseTo(0.16, 9); // attempt fee F = 0.008·20 (price unchanged in v2)
    expect(fee.fee).toBeCloseTo(0.16, 9);
    expect(fee.repeatTax).toBeCloseTo(0, 9);
    expect(fee.toDefenderOnFail).toBeCloseTo(0.15824, 9); // (1−0.011)·0.16
    expect(fee.toHouseOnFail).toBeCloseTo(0.00176, 9); // 0.011·0.16

    expect(prize.gross).toBeCloseTo(2.2, 9); // 0.11·20
    expect(prize.toRaider).toBeCloseTo(2.09, 9); // ×(1−0.05)
    expect(prize.toHouse).toBeCloseTo(0.11, 9); // ×0.05

    // EV per attempt as a fraction of V, and scaled to 20 SOL.
    expect(evRaider(COURT_PARAMS)).toBeCloseTo(-0.000685, 9);
    expect(evRaider(COURT_PARAMS) * V).toBeCloseTo(-0.0137, 9);
    expect(evDefender(COURT_PARAMS) * V).toBeCloseTo(0.00424, 9);
    expect(evHouse(COURT_PARAMS) * V).toBeCloseTo(0.00946, 9);
    // Raider hold as a fraction of the amount actually risked (the fee).
    // v1 was −0.4465 (44.7%); the v2 rebalance brings this to a grindable 8.6%.
    expect(evRaider(COURT_PARAMS) / COURT_PARAMS.feeRate).toBeCloseTo(-0.085625, 9);
  });

  it("Worked Example B — 1 SOL vault (Pit on-ramp)", () => {
    const V = 1;
    const mult = 1;
    const fee = computeFee(V, PIT_PARAMS, mult, 0);
    const prize = computePrize(V, PIT_PARAMS, mult);

    expect(fee.baseFee).toBeCloseTo(0.02, 9); // 0.02·1
    expect(fee.fee).toBeCloseTo(0.02, 9);
    expect(fee.toDefenderOnFail).toBeCloseTo(0.01962, 9); // (1−0.019)·0.02
    expect(fee.toHouseOnFail).toBeCloseTo(0.00038, 9); // 0.019·0.02

    expect(prize.gross).toBeCloseTo(0.155, 9); // 0.155·1
    expect(prize.toRaider).toBeCloseTo(0.14725, 9); // ×(1−0.05)
    expect(prize.toHouse).toBeCloseTo(0.00775, 9); // ×0.05

    expect(evRaider(PIT_PARAMS)).toBeCloseTo(-0.00233, 9);
    expect(evDefender(PIT_PARAMS)).toBeCloseTo(0.00102, 9);
    expect(evHouse(PIT_PARAMS)).toBeCloseTo(0.00131, 9);
    expect(evRaider(PIT_PARAMS) / PIT_PARAMS.feeRate).toBeCloseTo(-0.1165, 9);
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

// ── Economy balance guard — "sane hold" regression (v2 rebalance) ─────────────

/**
 * A raider risks the FEE, not the corpus, so the number that describes the deal
 * actually on offer is the hold on amount risked: `−evRaider / f`.
 *
 * These bounds are a deliberate product commitment, not an implementation
 * detail. v1 shipped a 44.7% King's Court hold and a 0% Arena defender return;
 * both are trivially derivable by any motivated player and both are churn
 * engines. This block exists so that regression cannot happen silently — if a
 * future tuning pass pushes the hold back into predatory territory, CI fails
 * and someone has to justify it in a diff.
 *
 * Reference points: slot machines hold 3–8% of turnover; poker rake and
 * sportsbook margins sit near 5%.
 */
describe("Economy balance: hold on amount risked stays defensible", () => {
  /** Hold = fraction of each wager the raider surrenders in expectation. */
  const holdOnWager = (p: TierParams) => -evRaider(p) / p.feeRate;
  /** House rake = the operator's share of each wager (the real "edge"). */
  const houseRake = (p: TierParams) => evHouse(p) / p.feeRate;

  it("every tier holds between 4% and 13% of the amount risked", () => {
    for (const params of TIER_PARAMS) {
      const hold = holdOnWager(params);
      expect(hold, `${params.id} hold`).toBeGreaterThan(0.04);
      expect(hold, `${params.id} hold`).toBeLessThan(0.13);
    }
  });

  it("hold is non-increasing as stakes climb (high rollers never get a worse deal)", () => {
    // Penny slots hold ~10–15%; high-limit tables ~1%. The ladder must not
    // invert that — the whale tier cannot be the most expensive one to play.
    for (let i = 1; i < TIER_PARAMS.length; i++) {
      const prev = holdOnWager(TIER_PARAMS[i - 1]);
      const curr = holdOnWager(TIER_PARAMS[i]);
      expect(curr, `${TIER_PARAMS[i].id} vs ${TIER_PARAMS[i - 1].id}`).toBeLessThanOrEqual(
        prev + 1e-12,
      );
    }
  });

  it("house rake per wager stays in a 3%–9% band across every tier", () => {
    for (const params of TIER_PARAMS) {
      const rake = houseRake(params);
      expect(rake, `${params.id} rake`).toBeGreaterThan(0.03);
      expect(rake, `${params.id} rake`).toBeLessThan(0.09);
    }
  });

  it("EVERY tier pays defenders a strictly positive return (no free-variance tiers)", () => {
    // v1's Arena had evDefender === 0 exactly: defenders absorbed real variance
    // for literally nothing. Property 8 only requires ≥ 0, which permitted it.
    // This tightens the contract to > 0 so it cannot recur.
    for (const params of TIER_PARAMS) {
      expect(evDefender(params), `${params.id} defender EV`).toBeGreaterThan(0);
      // And it must be a *material* share of the wager, not a rounding artefact.
      expect(evDefender(params) / params.feeRate, `${params.id} defender share`).toBeGreaterThan(
        0.01,
      );
    }
  });

  it("hold decomposes exactly into house rake + defender share", () => {
    // Zero-sum sanity at the EV level: everything the raider loses is received
    // by exactly one of the house or the defender.
    fc.assert(
      fc.property(tierArb, (params) => {
        return closeTo(holdOnWager(params), houseRake(params) + evDefender(params) / params.feeRate);
      }),
      { numRuns: 100 },
    );
  });

  it("no risk profile can push the hold outside 4%–16% on any tier", () => {
    // Variable-Risk Vaults hold defender EV constant while re-pricing p and f,
    // which moves the raider-facing hold. Fortified (κ=0.6) is the worst case:
    // lower odds at a defender-EV-preserving fee costs the raider relatively
    // more. Bound it so the feature can never become a predatory back door.
    for (const base of TIER_PARAMS) {
      for (const profile of RISK_PROFILE_ORDER) {
        const resolved = resolveVaultParams(base, profile);
        const hold = holdOnWager(resolved);
        expect(hold, `${base.id}/${profile} hold`).toBeGreaterThan(0.04);
        expect(hold, `${base.id}/${profile} hold`).toBeLessThan(0.16);
        // Sign invariants must survive profile resolution too.
        expect(evRaider(resolved), `${base.id}/${profile} raider EV`).toBeLessThan(0);
        expect(evDefender(resolved), `${base.id}/${profile} defender EV`).toBeGreaterThan(0);
        expect(evHouse(resolved), `${base.id}/${profile} house EV`).toBeGreaterThan(0);
      }
    }
  });

  it("max streak multiplier keeps the prize slice inside the corpus", () => {
    // s·m_max ≤ 1, else computePrize clamps and the published slice becomes a
    // lie at high streaks.
    for (const params of TIER_PARAMS) {
      expect(params.sliceRate * M_MAX, `${params.id} slice at m_max`).toBeLessThanOrEqual(1);
    }
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
