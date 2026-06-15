/**
 * Engine-level property tests for Variable-Risk Vaults — the immutable
 * `riskProfile` threaded through `walletWarsState.ts`.
 *
 * Feature: variable-risk-vaults
 *
 * Covers Properties 5 (zero-sum conservation), 6 (provable fairness with the
 * published per-vault odds), 7 (profile immutability), and 10 (migration /
 * normalisation default to Standard). Each property runs ≥ 100 iterations.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  resolveSiege,
  rollFromSeed,
  verifySiege,
  migrateV3ToV4,
  loadWarFromStorage,
  type WarState,
  type Vault,
  type StorageLike,
} from "./walletWarsState";
import {
  type RiskProfile,
  vaultParamsFor,
  tierParamsFor,
  DEFAULT_RISK_PROFILE,
} from "./siegeMath";

// ── Generators / fixtures ──────────────────────────────────────────────────────

const profileArb = fc.constantFrom<RiskProfile>("fortified", "standard", "exposed");

/** Amount + tier-aligned generator: a base corpus and the tier minimum below it. */
const TIER_RANGES: ReadonlyArray<[number, number]> = [
  [0.1, 0.99], // pit
  [1, 4.9], // grind
  [5, 19.9], // arena
  [20, 60], // court
];
const tierAmountArb = fc
  .integer({ min: 0, max: 3 })
  .chain((ti) =>
    fc.double({ min: TIER_RANGES[ti][0], max: TIER_RANGES[ti][1], noNaN: true, noDefaultInfinity: true }),
  );

function makeVault(over: Partial<Vault>): Vault {
  return {
    id: "v", wallet: "0xbot", isYou: false, amount: 10, banked: 0, survived: 0,
    cracked: 0, streak: 0, openedAt: 0, shieldUntil: 0, seq: 0, compound: true,
    bountyPool: 0, bountyExpiry: 0, riskProfile: "standard", ...over,
  };
}

function bareState(you: Vault | null, stashes: Vault[]): WarState {
  return { stashes, you, feed: [], totalBanked: 1000, biggestHeist: 0, raidCooldownUntil: 0 };
}

/** Four-way conservation residual for a single settled siege (raider = you). */
function conservationResidual(before: WarState, after: WarState, targetId: string): number {
  const tBefore = before.stashes.find((v) => v.id === targetId)!;
  const tAfter = after.stashes.find((v) => v.id === targetId)!;
  const dRaider = after.you!.amount - before.you!.amount;
  const dDefenderBanked = tAfter.banked - tBefore.banked;
  const dCorpus = tAfter.amount - tBefore.amount;
  const dHouse = after.totalBanked - before.totalBanked;
  return dRaider + dDefenderBanked + dCorpus + dHouse;
}

// ── Property 5: zero-sum conservation across every profile ─────────────────────

describe("Feature: variable-risk-vaults, Property 5: Zero-sum conservation", () => {
  it("raider + defender + house + corpus === 0 across profiles/tiers/streak/roll/tax", () => {
    fc.assert(
      fc.property(
        tierAmountArb,
        profileArb,
        profileArb,
        fc.nat({ max: 200 }),
        fc.string({ minLength: 1, maxLength: 24 }),
        fc.double({ min: 0, max: 1.2, noNaN: true, noDefaultInfinity: true }),
        fc.boolean(),
        (amount, defProfile, raidProfile, streak, seed, taxMult, compound) => {
          // Raider shares the defender's corpus so the fee is always affordable
          // and the pair stays in the same weight class.
          const you = makeVault({ id: "you", wallet: "You", isYou: true, amount, compound, riskProfile: raidProfile });
          const target = makeVault({ id: "tgt", wallet: "0xdef", amount, streak, compound, riskProfile: defProfile });
          const s0 = bareState(you, [target]);
          const r = resolveSiege(s0, "tgt", { at: 1_000, seed, taxMult });
          expect(r.resolution.ok).toBe(true);
          expect(Math.abs(conservationResidual(s0, r.state, "tgt"))).toBeLessThan(1e-9);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ── Property 6: provable fairness with the published per-vault odds ────────────

describe("Feature: variable-risk-vaults, Property 6: Provable fairness", () => {
  it("outcome is win ⇔ roll < p_vault, p_vault == vaultParamsFor(amount, profile).winChance", () => {
    fc.assert(
      fc.property(
        tierAmountArb,
        profileArb,
        fc.string({ minLength: 1, maxLength: 24 }),
        (amount, defProfile, seed) => {
          const you = makeVault({ id: "you", wallet: "You", isYou: true, amount });
          const target = makeVault({ id: "tgt", wallet: "0xdef", amount, riskProfile: defProfile });
          const s0 = bareState(you, [target]);
          const r = resolveSiege(s0, "tgt", { at: 1_000, seed, taxMult: 0 });
          expect(r.resolution.ok).toBe(true);
          if (!r.resolution.ok) return;
          const result = r.resolution.result;

          const pVault = vaultParamsFor(amount, defProfile).winChance;
          // The published pWin is exactly the vault's profile-resolved odds.
          expect(result.pWin).toBe(pVault);
          // win ⇔ roll < p_vault, against the revealed seed.
          const roll = rollFromSeed(seed);
          expect(result.roll).toBe(roll);
          expect(result.outcome === "win").toBe(roll < pVault);
          // The verifier agrees with the published outcome.
          expect(verifySiege(result.seed, result.pWin, result.outcome)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ── Property 7: risk profile is immutable across the vault lifetime ────────────

describe("Feature: variable-risk-vaults, Property 7: Risk profile immutable", () => {
  it("a sequence of sieges/settlements/compounding never changes either profile", () => {
    fc.assert(
      fc.property(
        tierAmountArb,
        profileArb,
        profileArb,
        fc.array(fc.string({ minLength: 1, maxLength: 16 }), { minLength: 1, maxLength: 8 }),
        fc.boolean(),
        (amount, defProfile, raidProfile, seeds, compound) => {
          let state = bareState(
            makeVault({ id: "you", wallet: "You", isYou: true, amount, compound, riskProfile: raidProfile }),
            [makeVault({ id: "tgt", wallet: "0xdef", amount, compound, riskProfile: defProfile })],
          );
          let at = 1_000;
          for (const seed of seeds) {
            at += 10_000; // clear the raid cooldown + shield each step
            const r = resolveSiege(state, "tgt", { at, seed, taxMult: 0 });
            if (r.resolution.ok) state = r.state;
            // Whether or not the step settled, neither profile may drift.
            expect(state.you!.riskProfile).toBe(raidProfile);
            const tgt = state.stashes.find((v) => v.id === "tgt")!;
            expect(tgt.riskProfile).toBe(defProfile);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ── Property 10: migration & normalisation default to Standard ─────────────────

describe("Feature: variable-risk-vaults, Property 10: Migration defaults to Standard", () => {
  it("v3 migration yields 'standard' when no valid profile is present, else preserves it", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }),
        // Mix of invalid sentinels and the three valid profiles.
        fc.constantFrom<unknown>(undefined, null, "", "bogus", 42, "fortified", "standard", "exposed"),
        (amount, rawProfile) => {
          const v3 = { you: { id: "old", wallet: "You", amount, banked: 1, riskProfile: rawProfile } };
          const out = migrateV3ToV4(v3, 5_000);
          const valid = rawProfile === "fortified" || rawProfile === "standard" || rawProfile === "exposed";
          expect(out.you!.riskProfile).toBe(valid ? rawProfile : "standard");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("a v4 record missing riskProfile normalises to Standard with identical economics", () => {
    const persisted = JSON.stringify({
      you: { id: "u1", wallet: "You", isYou: true, amount: 0.5, banked: 0.2, compound: true },
      totalBanked: 100,
      biggestHeist: 5,
    });
    const storage: StorageLike = {
      getItem: (k) => (k === "yoink_walletwars_v4" ? persisted : null),
      setItem: () => {},
    };
    const loaded = loadWarFromStorage(storage, 9_000);
    expect(loaded).not.toBeNull();
    expect(loaded!.you!.riskProfile).toBe(DEFAULT_RISK_PROFILE);
    // Economics are identical to today: Standard params deep-equal the base tier.
    expect(vaultParamsFor(loaded!.you!.amount, loaded!.you!.riskProfile)).toEqual(
      tierParamsFor(loaded!.you!.amount),
    );
  });

  it("a malformed (non-RiskProfile) v4 value normalises to Standard", () => {
    const persisted = JSON.stringify({
      you: { id: "u2", wallet: "You", isYou: true, amount: 3, banked: 0, riskProfile: "garbage" },
      totalBanked: 50,
      biggestHeist: 1,
    });
    const storage: StorageLike = {
      getItem: (k) => (k === "yoink_walletwars_v4" ? persisted : null),
      setItem: () => {},
    };
    const loaded = loadWarFromStorage(storage, 9_000);
    expect(loaded!.you!.riskProfile).toBe("standard");
  });
});
