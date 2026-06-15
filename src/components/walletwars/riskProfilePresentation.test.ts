/**
 * Unit tests for the Variable-Risk Vaults pure presentation models.
 *
 * Feature: variable-risk-vaults
 *
 * Covers the selector defaults/previews, the VaultCard badge + vaultParamsFor-
 * derived values, and reduced-motion suppression — without a DOM runner, by
 * testing the extracted pure models the components consume.
 */

import { describe, it, expect } from "vitest";

import {
  PROFILE_ACCENT,
  profileBadgeLabel,
  profilePreview,
  profilePreviews,
  vaultEconomics,
  animateUnlessReduced,
} from "./riskProfilePresentation";
import {
  DEFAULT_RISK_PROFILE,
  RISK_PROFILE_ORDER,
  vaultParamsFor,
  computeFee,
  computePrize,
  feeMultiplierForStreak,
  STREAK_CFG,
} from "@/lib/siegeMath";

describe("profile badge + accents", () => {
  it("badge label is the uppercased profile label", () => {
    expect(profileBadgeLabel("fortified")).toBe("FORTIFIED");
    expect(profileBadgeLabel("standard")).toBe("STANDARD");
    expect(profileBadgeLabel("exposed")).toBe("EXPOSED");
  });

  it("each profile has a distinct accent", () => {
    const accents = new Set(Object.values(PROFILE_ACCENT));
    expect(accents.size).toBe(3);
  });
});

describe("selector previews", () => {
  it("returns all three profiles in low→high render order, default is Standard", () => {
    const previews = profilePreviews(0.5);
    expect(previews.map((p) => p.profile)).toEqual(RISK_PROFILE_ORDER);
    expect(RISK_PROFILE_ORDER).toEqual(["fortified", "standard", "exposed"]);
    expect(DEFAULT_RISK_PROFILE).toBe("standard");
  });

  it("previews p' and f' for the entered stake via vaultParamsFor", () => {
    const amount = 0.5; // The Pit
    for (const profile of RISK_PROFILE_ORDER) {
      const p = profilePreview(amount, profile);
      const params = vaultParamsFor(amount, profile);
      expect(p.crackChance).toBe(params.winChance);
      expect(p.crackPct).toBe(`${(params.winChance * 100).toFixed(0)}%`);
      expect(p.feeRate).toBe(params.feeRate);
      expect(p.feeSol).toBeCloseTo(params.feeRate * amount, 12);
      expect(p.blurb.length).toBeGreaterThan(0);
    }
  });

  it("Pit previews match the published crack-odds spread (7% / 12% / 18%)", () => {
    const previews = profilePreviews(0.5);
    expect(previews[0].crackPct).toBe("7%"); // fortified 0.072
    expect(previews[1].crackPct).toBe("12%"); // standard 0.12
    expect(previews[2].crackPct).toBe("18%"); // exposed 0.18
  });
});

describe("VaultCard economics model", () => {
  it("derives size, p', fee, and slice from vaultParamsFor + streak mult", () => {
    const vault = { amount: 12, riskProfile: "exposed" as const, streak: 4 };
    const econ = vaultEconomics(vault);
    const params = vaultParamsFor(vault.amount, vault.riskProfile);
    const mult = feeMultiplierForStreak(vault.streak, STREAK_CFG);

    expect(econ.sizeSol).toBe(12);
    expect(econ.crackChance).toBe(params.winChance);
    expect(econ.crackPct).toBe(`${(params.winChance * 100).toFixed(0)}%`);
    expect(econ.feeRisked).toBeCloseTo(computeFee(12, params, mult, 0).fee, 12);
    expect(econ.sliceWon).toBeCloseTo(computePrize(12, params, mult).toRaider, 12);
    expect(econ.badge).toBe("EXPOSED");
    expect(econ.accent).toBe(PROFILE_ACCENT.exposed);
  });

  it("a Standard vault's economics equal today's base-tier economics", () => {
    const vault = { amount: 3, riskProfile: "standard" as const, streak: 0 };
    const econ = vaultEconomics(vault);
    const params = vaultParamsFor(3, "standard");
    expect(econ.feeRisked).toBeCloseTo(computeFee(3, params, 1, 0).fee, 12);
    expect(econ.crackChance).toBe(params.winChance);
  });
});

describe("reduced-motion suppression", () => {
  it("returns the animation props when motion is allowed", () => {
    const props = { scale: [1, 1.1, 1] };
    expect(animateUnlessReduced(false, props)).toBe(props);
  });

  it("suppresses (undefined) the animation props under reduced motion", () => {
    expect(animateUnlessReduced(true, { opacity: [0.6, 1, 0.6] })).toBeUndefined();
  });
});
