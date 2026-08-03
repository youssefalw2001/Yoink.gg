/**
 * Tests for Variable-Risk Vaults — the pure profile model + EV-preserving param
 * resolver in `siegeMath.ts`.
 *
 * Feature: variable-risk-vaults
 *
 * Contains the numbered correctness-property tests (Properties 1–4, 8, 9) that
 * operate directly on the pure math, plus the 12-combo EV-table unit test from
 * the design. Each property test runs a minimum of 100 iterations (fast-check).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  TIER_PARAMS,
  type TierParams,
  type RiskProfile,
  RISK_PROFILES,
  RISK_PROFILE_ORDER,
  DEFAULT_RISK_PROFILE,
  isRiskProfile,
  resolveVaultParams,
  vaultParamsFor,
  evRaider,
  evDefender,
  evHouse,
  PIT_PARAMS,
  GRIND_PARAMS,
  ARENA_PARAMS,
  COURT_PARAMS,
} from "./siegeMath";

// ── Generators ────────────────────────────────────────────────────────────────

const profileArb = fc.constantFrom<RiskProfile>("fortified", "standard", "exposed");
const tierArb = fc.constantFrom(...TIER_PARAMS);

/**
 * Arbitrary WELL-FORMED TierParams: 0 < p < 1, f ≥ 0, 0 ≤ s ≤ 1, rakes in [0,1).
 * Constrained so `p·κ` stays in range for the EV-preservation property (the
 * clamp case is exercised separately in Property 9).
 */
const wellFormedBaseArb: fc.Arbitrary<TierParams> = fc.record({
  id: fc.constantFrom<TierParams["id"]>("pit", "grind", "arena", "court"),
  winChance: fc.double({ min: 0.001, max: 0.6, noNaN: true, noDefaultInfinity: true }),
  feeRate: fc.double({ min: 0.0001, max: 0.5, noNaN: true, noDefaultInfinity: true }),
  sliceRate: fc.double({ min: 0.001, max: 0.9, noNaN: true, noDefaultInfinity: true }),
  houseFeeCut: fc.double({ min: 0, max: 0.5, noNaN: true, noDefaultInfinity: true }),
  housePrizeRake: fc.double({ min: 0, max: 0.5, noNaN: true, noDefaultInfinity: true }),
});

const amountArb = fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true });

// ── Predicate / model sanity ──────────────────────────────────────────────────

describe("risk-profile model", () => {
  it("isRiskProfile accepts exactly the three profiles", () => {
    expect(isRiskProfile("fortified")).toBe(true);
    expect(isRiskProfile("standard")).toBe(true);
    expect(isRiskProfile("exposed")).toBe(true);
    for (const bad of ["", "Fortified", "std", null, undefined, 1, {}, "EXPOSED"]) {
      expect(isRiskProfile(bad)).toBe(false);
    }
  });

  it("κ values and invariants are exactly as published", () => {
    expect(RISK_PROFILES.fortified.oddsFactor).toBe(0.6);
    expect(RISK_PROFILES.standard.oddsFactor).toBe(1.0);
    expect(RISK_PROFILES.exposed.oddsFactor).toBe(1.5);
    expect(RISK_PROFILE_ORDER).toEqual(["fortified", "standard", "exposed"]);
    expect(DEFAULT_RISK_PROFILE).toBe("standard");
  });
});

// ── Property 1: Standard profile is the identity (migration safety) ────────────

describe("Feature: variable-risk-vaults, Property 1: Standard profile is the identity", () => {
  it("resolveVaultParams(base, 'standard') deep-equals base for all well-formed base", () => {
    fc.assert(
      fc.property(wellFormedBaseArb, (base) => {
        expect(resolveVaultParams(base, "standard")).toEqual(base);
      }),
      { numRuns: 200 },
    );
  });
});

// ── Property 2: Defender EV is preserved across profiles ───────────────────────

describe("Feature: variable-risk-vaults, Property 2: Defender EV preserved across profiles", () => {
  it("evDefender(resolveVaultParams(base, profile)) ≈ evDefender(base) within 1e-9 (no clamp)", () => {
    fc.assert(
      fc.property(wellFormedBaseArb, profileArb, (base, profile) => {
        const kappa = RISK_PROFILES[profile].oddsFactor;
        const pRaw = base.winChance * kappa;
        // Only assert where no odds clamp is applied (Requirement 5.1 / Property 2).
        fc.pre(pRaw > 1e-9 && pRaw < 1 - 1e-9);
        const resolved = resolveVaultParams(base, profile);
        expect(Math.abs(evDefender(resolved) - evDefender(base))).toBeLessThanOrEqual(1e-9);
      }),
      { numRuns: 300 },
    );
  });
});

// ── Property 3 & 4: Raider EV < 0 and House EV > 0 for every profile×tier ──────

describe("Feature: variable-risk-vaults, Property 3: Raider EV strictly negative", () => {
  it("evRaider(vaultParamsFor(amount, profile)) < 0 for all amount × profile", () => {
    fc.assert(
      fc.property(amountArb, profileArb, (amount, profile) => {
        expect(evRaider(vaultParamsFor(amount, profile))).toBeLessThan(0);
      }),
      { numRuns: 300 },
    );
  });
});

describe("Feature: variable-risk-vaults, Property 4: House EV strictly positive", () => {
  it("evHouse(vaultParamsFor(amount, profile)) > 0 for all amount × profile", () => {
    fc.assert(
      fc.property(amountArb, profileArb, (amount, profile) => {
        expect(evHouse(vaultParamsFor(amount, profile))).toBeGreaterThan(0);
      }),
      { numRuns: 300 },
    );
  });
});

// ── Property 8: Variance ordering Fortified < Standard < Exposed ───────────────

describe("Feature: variable-risk-vaults, Property 8: Variance ordering", () => {
  it("s²·p'(1−p') is strictly ordered Fortified < Standard < Exposed for every tier", () => {
    const variance = (p: TierParams): number => {
      const s = p.sliceRate;
      return s * s * p.winChance * (1 - p.winChance);
    };
    fc.assert(
      fc.property(tierArb, (base) => {
        const f = variance(resolveVaultParams(base, "fortified"));
        const s = variance(resolveVaultParams(base, "standard"));
        const e = variance(resolveVaultParams(base, "exposed"));
        expect(f).toBeLessThan(s);
        expect(s).toBeLessThan(e);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 9: Effective odds/fee are well-formed (incl. clamp) ───────────────

describe("Feature: variable-risk-vaults, Property 9: Effective odds are a valid probability", () => {
  it("0 < winChance < 1 and feeRate > 0 for all well-formed base × profile", () => {
    fc.assert(
      fc.property(wellFormedBaseArb, profileArb, (base, profile) => {
        // The design's resolver derivation assumes a well-formed *tier* base
        // whose defender EV D ≥ 0 ("non-negative by design"); f' > 0 follows
        // from D ≥ 0, p' > 0, s > 0, ρ_fee < 1. Restrict to that tier invariant.
        fc.pre(evDefender(base) >= 0);
        const r = resolveVaultParams(base, profile);
        expect(r.winChance).toBeGreaterThan(0);
        expect(r.winChance).toBeLessThan(1);
        expect(r.feeRate).toBeGreaterThan(0);
      }),
      { numRuns: 300 },
    );
  });

  it("clamps p' into (ε, 1−ε) when base.winChance·κ ≥ 1 (Exposed on high-odds base)", () => {
    // base.winChance = 0.8, κ_exposed = 1.5 ⇒ p·κ = 1.2 ≥ 1 → must clamp below 1.
    const base: TierParams = {
      id: "pit",
      winChance: 0.8,
      feeRate: 0.02,
      sliceRate: 0.15,
      houseFeeCut: 0.01,
      housePrizeRake: 0.02,
    };
    const r = resolveVaultParams(base, "exposed");
    expect(r.winChance).toBeGreaterThan(0);
    expect(r.winChance).toBeLessThan(1);
    expect(r.feeRate).toBeGreaterThan(0);
  });
});

// ── Unit: the 12-combo EV table (4 tiers × 3 profiles) ─────────────────────────

describe("12-combo EV table matches the design values within tolerance", () => {
  interface Row {
    tier: TierParams;
    profile: RiskProfile;
    p: number;
    f: number;
    evR: number;
    evD: number;
    evH: number;
  }
  /**
   * Per-tier × per-profile EV table, recomputed for the **v2 "sane hold"**
   * economy (see the balance note atop `siegeMath.ts`).
   *
   * Every row is derived analytically from the published base params, not
   * copied from a doc:
   *   D  = evDefender(base) = (1 − ρ_fee)·f − p·s      (held constant by design)
   *   p' = clamp(p·κ)                                   κ = 0.6 / 1.0 / 1.5
   *   f' = (D + p'·s) / (1 − ρ_fee)                     preserves D exactly
   *   evR' = p'·s·(1 − ρ_prize) − f'
   *   evH' = ρ_fee·f' + p'·ρ_prize·s
   *
   * Note that `evD` is now strictly positive in all four tiers — v1's Arena
   * row was exactly 0.0000, meaning defenders took variance for nothing.
   */
  const rows: Row[] = [
    // pit (D = 0.0010200)
    { tier: PIT_PARAMS, profile: "fortified", p: 0.07200, f: 0.0124159, evR: -0.0018139, evD: 0.0010200, evH: 0.0007939 },
    { tier: PIT_PARAMS, profile: "standard", p: 0.12000, f: 0.0200000, evR: -0.0023300, evD: 0.0010200, evH: 0.0013100 },
    { tier: PIT_PARAMS, profile: "exposed", p: 0.18000, f: 0.0294801, evR: -0.0029751, evD: 0.0010200, evH: 0.0019551 },
    // grind (D = 0.0005300)
    { tier: GRIND_PARAMS, profile: "fortified", p: 0.06000, f: 0.0092159, evR: -0.0011219, evD: 0.0005300, evH: 0.0005919 },
    { tier: GRIND_PARAMS, profile: "standard", p: 0.10000, f: 0.0150000, evR: -0.0015100, evD: 0.0005300, evH: 0.0009800 },
    { tier: GRIND_PARAMS, profile: "exposed", p: 0.15000, f: 0.0222301, evR: -0.0019951, evD: 0.0005300, evH: 0.0014651 },
    // arena (D = 0.0002300)
    { tier: ARENA_PARAMS, profile: "fortified", p: 0.04800, f: 0.0060936, evR: -0.0006216, evD: 0.0002300, evH: 0.0003916 },
    { tier: ARENA_PARAMS, profile: "standard", p: 0.08000, f: 0.0100000, evR: -0.0008800, evD: 0.0002300, evH: 0.0006500 },
    { tier: ARENA_PARAMS, profile: "exposed", p: 0.12000, f: 0.0148830, evR: -0.0012030, evD: 0.0002300, evH: 0.0009730 },
    // court (D = 0.0002120)
    { tier: COURT_PARAMS, profile: "fortified", p: 0.04200, f: 0.0048857, evR: -0.0004967, evD: 0.0002120, evH: 0.0002847 },
    { tier: COURT_PARAMS, profile: "standard", p: 0.07000, f: 0.0080000, evR: -0.0006850, evD: 0.0002120, evH: 0.0004730 },
    { tier: COURT_PARAMS, profile: "exposed", p: 0.10500, f: 0.0118928, evR: -0.0009203, evD: 0.0002120, evH: 0.0007083 },
  ];

  for (const row of rows) {
    it(`${row.tier.id} · ${row.profile} — p', f', EV match the published row`, () => {
      const r = resolveVaultParams(row.tier, row.profile);
      expect(r.winChance).toBeCloseTo(row.p, 5);
      expect(r.feeRate).toBeCloseTo(row.f, 5);
      expect(evRaider(r)).toBeCloseTo(row.evR, 5);
      expect(evDefender(r)).toBeCloseTo(row.evD, 5);
      expect(evHouse(r)).toBeCloseTo(row.evH, 5);
      // slice + rakes are carried through from the base tier.
      expect(r.sliceRate).toBe(row.tier.sliceRate);
      expect(r.houseFeeCut).toBe(row.tier.houseFeeCut);
      expect(r.housePrizeRake).toBe(row.tier.housePrizeRake);
    });
  }

  it("Standard rows equal today's TierParams exactly", () => {
    expect(resolveVaultParams(PIT_PARAMS, "standard")).toEqual(PIT_PARAMS);
    expect(resolveVaultParams(GRIND_PARAMS, "standard")).toEqual(GRIND_PARAMS);
    expect(resolveVaultParams(ARENA_PARAMS, "standard")).toEqual(ARENA_PARAMS);
    expect(resolveVaultParams(COURT_PARAMS, "standard")).toEqual(COURT_PARAMS);
  });
});
