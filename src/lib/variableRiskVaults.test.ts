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
  // Published values from design.md's per-tier, per-profile EV table.
  const rows: Row[] = [
    // Pit (D = 0.0018)
    { tier: PIT_PARAMS, profile: "fortified", p: 0.072, f: 0.01273, evR: -0.002143, evD: 0.0018, evH: 0.000343 },
    { tier: PIT_PARAMS, profile: "standard", p: 0.120, f: 0.02000, evR: -0.002360, evD: 0.0018, evH: 0.000560 },
    { tier: PIT_PARAMS, profile: "exposed", p: 0.180, f: 0.02909, evR: -0.002631, evD: 0.0018, evH: 0.000831 },
    // Grind (D = 0.0011)
    { tier: GRIND_PARAMS, profile: "fortified", p: 0.060, f: 0.00947, evR: -0.002292, evD: 0.0011, evH: 0.001192 },
    { tier: GRIND_PARAMS, profile: "standard", p: 0.100, f: 0.01500, evR: -0.003040, evD: 0.0011, evH: 0.001940 },
    { tier: GRIND_PARAMS, profile: "exposed", p: 0.150, f: 0.02191, evR: -0.003975, evD: 0.0011, evH: 0.002875 },
    // Arena (D = 0.0000)
    { tier: ARENA_PARAMS, profile: "fortified", p: 0.048, f: 0.00600, evR: -0.001512, evD: 0.0000, evH: 0.001512 },
    { tier: ARENA_PARAMS, profile: "standard", p: 0.080, f: 0.01000, evR: -0.002520, evD: 0.0000, evH: 0.002520 },
    { tier: ARENA_PARAMS, profile: "exposed", p: 0.120, f: 0.01500, evR: -0.003780, evD: 0.0000, evH: 0.003780 },
    // Court (D = 0.0014)
    { tier: COURT_PARAMS, profile: "fortified", p: 0.036, f: 0.00546, evR: -0.002802, evD: 0.0014, evH: 0.001402 },
    { tier: COURT_PARAMS, profile: "standard", p: 0.060, f: 0.00800, evR: -0.003572, evD: 0.0014, evH: 0.002172 },
    // NOTE: design table prints f'=0.01177 for this cell, but that value is
    // inconsistent with the row's own published EVs. The EV-consistent f' is
    // (0.0014 + 0.09·0.09)/0.85 = 0.0111765, which reproduces EV_raider/-house
    // exactly. We assert the mathematically correct value.
    { tier: COURT_PARAMS, profile: "exposed", p: 0.090, f: 0.0111765, evR: -0.004534, evD: 0.0014, evH: 0.003134 },
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
