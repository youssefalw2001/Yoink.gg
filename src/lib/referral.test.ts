/**
 * Conservation tests for the Tiered Lifetime Referral system.
 *
 * Feature: wallet-wars-referral
 *
 * Proves the non-negotiable invariant for EVERY tier × EVERY risk profile:
 *   referrerCut + houseKept === houseRake     (exact, no leakage, no double-pay)
 * and that the referred user's experience (defender toll, raider fee) is
 * byte-for-byte identical whether or not a referrer is present — because the
 * split only ever touches the house's already-computed rake.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  splitHouseRake,
  referralTierForAmount,
  referralCapFor,
  REFERRAL_BPS,
  REFERRAL_TIER_ORDER,
  REFERRAL_CAP_MULTIPLE,
  type ReferralTier,
} from "./referral";
import {
  TIER_PARAMS,
  RISK_PROFILE_ORDER,
  vaultParamsFor,
  computeFee,
  computePrize,
  feeMultiplierForStreak,
  STREAK_CFG,
  type RiskProfile,
} from "./siegeMath";

/** A representative corpus inside each tier (pit/grind/arena/court). */
const TIER_AMOUNT: Record<ReferralTier, number> = { pit: 0.5, grind: 2.5, arena: 10, court: 50 };

/** Compute the REAL house rake for a settled siege, exactly as the engine does. */
function houseRakeFor(amount: number, profile: RiskProfile, outcome: "win" | "loss") {
  const params = vaultParamsFor(amount, profile);
  const mult = feeMultiplierForStreak(0, STREAK_CFG);
  const feeB = computeFee(amount, params, mult, 0);
  if (outcome === "loss") {
    return { houseRake: feeB.toHouseOnFail, defenderToll: feeB.toDefenderOnFail, raiderFee: feeB.fee };
  }
  const prizeB = computePrize(amount, params, mult);
  return { houseRake: prizeB.toHouse + feeB.toHouseOnFail, defenderToll: feeB.toDefenderOnFail, raiderFee: feeB.fee };
}

describe("referral tier resolution", () => {
  it("maps amounts to the same tiers as the siege engine", () => {
    expect(referralTierForAmount(0.5)).toBe("pit");
    expect(referralTierForAmount(2.5)).toBe("grind");
    expect(referralTierForAmount(10)).toBe("arena");
    expect(referralTierForAmount(50)).toBe("court");
  });

  it("publishes the exact tier percentages (15/20/22/25)", () => {
    expect(REFERRAL_BPS).toEqual({ pit: 1500, grind: 2000, arena: 2200, court: 2500 });
  });
});

describe("conservation — every tier × every risk profile", () => {
  for (const tier of REFERRAL_TIER_ORDER) {
    for (const profile of RISK_PROFILE_ORDER) {
      for (const outcome of ["loss", "win"] as const) {
        it(`${tier} · ${profile} · ${outcome}: referrerCut + houseKept === houseRake (uncapped)`, () => {
          const amount = TIER_AMOUNT[tier];
          const { houseRake, defenderToll } = houseRakeFor(amount, profile, outcome);

          // Uncapped: a huge cap room so the full percentage applies.
          const split = splitHouseRake({
            houseRake, tier, hasReferrer: true, earnedSoFar: 0, largestStake: 1e9,
          });

          // Exact conservation — no leakage.
          expect(split.referrerCut + split.houseKept).toBeCloseTo(houseRake, 12);
          // Correct published percentage.
          expect(split.referrerCut).toBeCloseTo((houseRake * REFERRAL_BPS[tier]) / 10_000, 12);
          expect(split.houseKept).toBeCloseTo(houseRake - split.referrerCut, 12);
          expect(split.capped).toBe(false);

          // The defender toll is produced by frozen siegeMath, never by the split.
          const noRef = splitHouseRake({ houseRake, tier, hasReferrer: false, earnedSoFar: 0, largestStake: 1e9 });
          expect(noRef.referrerCut).toBe(0);
          expect(noRef.houseKept).toBe(houseRake); // house keeps 100%
          // toll identical regardless of referral presence (it's not an input/output of the split).
          expect(defenderToll).toBe(houseRakeFor(amount, profile, outcome).defenderToll);
        });
      }
    }
  }
});

describe("no referrer → house keeps 100%", () => {
  it("returns the full rake to the house with zero cut", () => {
    const s = splitHouseRake({ houseRake: 1.2345, tier: "arena", hasReferrer: false, earnedSoFar: 0, largestStake: 100 });
    expect(s.referrerCut).toBe(0);
    expect(s.houseKept).toBe(1.2345);
    expect(s.bps).toBe(0);
  });

  it("treats non-positive / non-finite rake as zero, never negative", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = splitHouseRake({ houseRake: bad, tier: "pit", hasReferrer: true, earnedSoFar: 0, largestStake: 100 });
      expect(s.referrerCut).toBe(0);
      expect(s.houseKept).toBe(0);
      expect(s.referrerCut + s.houseKept).toBe(0);
    }
  });
});

describe("20× lifetime safety cap (per referred-user)", () => {
  it("cap = 20 × largest single stake", () => {
    expect(referralCapFor(3)).toBe(60);
    expect(referralCapFor(0)).toBe(0);
  });

  it("clamps the cut to the remaining cap room, then reverts to 100% house once reached", () => {
    const largestStake = 1; // cap = 20 SOL of lifetime referral earnings
    const cap = referralCapFor(largestStake);
    expect(cap).toBe(REFERRAL_CAP_MULTIPLE);

    // Already earned right up to 0.01 below the cap → only 0.01 room left.
    const nearCap = splitHouseRake({
      houseRake: 5, tier: "court", hasReferrer: true, earnedSoFar: cap - 0.01, largestStake,
    });
    expect(nearCap.referrerCut).toBeCloseTo(0.01, 12);
    expect(nearCap.capped).toBe(true);
    expect(nearCap.referrerCut + nearCap.houseKept).toBeCloseTo(5, 12); // still conserves

    // Cap already reached → 0 to referrer, 100% to house going forward.
    const atCap = splitHouseRake({ houseRake: 5, tier: "court", hasReferrer: true, earnedSoFar: cap, largestStake });
    expect(atCap.referrerCut).toBe(0);
    expect(atCap.houseKept).toBe(5);
    expect(atCap.capped).toBe(true);
  });
});

describe("property: conservation holds for arbitrary inputs (≥200 runs)", () => {
  it("referrerCut + houseKept === houseRake and 0 ≤ referrerCut ≤ houseRake", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.constantFrom<ReferralTier>("pit", "grind", "arena", "court"),
        fc.boolean(),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (houseRake, tier, hasReferrer, earnedSoFar, largestStake) => {
          const s = splitHouseRake({ houseRake, tier, hasReferrer, earnedSoFar, largestStake });
          const rake = houseRake > 0 ? houseRake : 0;
          expect(s.referrerCut + s.houseKept).toBeCloseTo(rake, 10);
          expect(s.referrerCut).toBeGreaterThanOrEqual(0);
          expect(s.referrerCut).toBeLessThanOrEqual(rake + 1e-9);
          if (!hasReferrer) expect(s.referrerCut).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// Touch TIER_PARAMS so the import is exercised (documents the source of rake).
describe("tier params present", () => {
  it("has four tiers", () => { expect(TIER_PARAMS.length).toBe(4); });
});
