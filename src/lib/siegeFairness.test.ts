/**
 * Provable-fairness property tests (Task 5.1).
 *
 * Feature: wallet-wars-siege-economy, Property 6
 *
 * Property 6 (Verifiability): for any siege result, `outcome === "win"` iff
 * `rollFromSeed(seed) < pWin`, and `verifySiege(seed, pWin, outcome)` agrees.
 *
 * Validates: Requirements 22.2, 22.5
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  rollFromSeed,
  verifySiege,
  resolveSiege,
  type WarState,
  type Vault,
} from "./walletWarsState";

const RUNS = 200; // ≥ 100 runs per the design's property-test minimum

function makeVault(over: Partial<Vault>): Vault {
  return {
    id: "v", wallet: "0xbot", isYou: false, amount: 10, banked: 0, survived: 0,
    cracked: 0, streak: 0, openedAt: 0, shieldUntil: 0, seq: 0, compound: true,
    bountyPool: 0, bountyExpiry: 0, ...over,
  };
}

describe("Property 6 — provable fairness round-trip", () => {
  it("verifySiege agrees with the seed/pWin comparison and rejects the wrong outcome", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (seed, pWin) => {
          const won = rollFromSeed(seed) < pWin;
          const claimed = won ? "win" : "loss";
          const opposite = won ? "loss" : "win";
          // The recomputed outcome must validate, and the opposite must not.
          expect(verifySiege(seed, pWin, claimed)).toBe(true);
          expect(verifySiege(seed, pWin, opposite)).toBe(false);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("every engine SiegeResult is self-verifiable from its seed/roll/pWin", () => {
    fc.assert(
      fc.property(
        // Same-tier raider+target across the full ladder; the raider always
        // affords the (≤2% of corpus) fee, so a settlement is produced.
        fc.float({ min: Math.fround(0.1), max: 5000, noNaN: true }),
        fc.string({ minLength: 1, maxLength: 32 }),
        (amount, seed) => {
          const you = makeVault({ id: "you", wallet: "You", isYou: true, amount });
          const target = makeVault({ id: "tgt", wallet: "0xdef", amount });
          const state: WarState = {
            stashes: [target], you, feed: [], totalBanked: 0, biggestHeist: 0, raidCooldownUntil: 0,
          };

          const { resolution } = resolveSiege(state, "tgt", { at: 1_000, seed, taxMult: 0 });
          expect(resolution.ok).toBe(true);
          if (!resolution.ok) return;
          const r = resolution.result;

          // outcome === "win"  ⇔  roll < pWin
          expect(r.outcome === "win").toBe(r.roll < r.pWin);
          expect(r.roll).toBe(rollFromSeed(r.seed));
          // The published seed/pWin recompute the claimed outcome.
          expect(verifySiege(r.seed, r.pWin, r.outcome)).toBe(true);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
