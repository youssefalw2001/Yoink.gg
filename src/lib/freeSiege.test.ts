/**
 * Free-siege on-ramp glue tests.
 *
 * The quota mechanics are covered by `hooks/useFreeSiege.test.ts`. This file
 * covers the seam that lets a vault-less visitor play: the synthetic house
 * training vault, and the adaptation of a claim into the paid flow's typed
 * `SiegeResolution`.
 */

import { describe, it, expect } from "vitest";
import {
  makeTrainingVault,
  freeSiegeResolution,
  TRAINING_VAULT_ID,
  TRAINING_VAULT_WALLET,
} from "./freeSiege";
import { claimFreeSiege, rolloverQuota, TRAINING_VAULT_AMOUNT } from "@/hooks/useFreeRound";
import { feeMultiplierForStreak, STREAK_CFG, tierParamsFor } from "./siegeMath";
import type { SiegeResult } from "./walletWarsState";

const NOW = 1_700_000_000_000;

describe("makeTrainingVault", () => {
  it("matches the id/wallet that claimFreeSiege reports", () => {
    // If these drift, the win card and feed would attribute the crack to a
    // vault that does not exist.
    const v = makeTrainingVault(NOW);
    expect(v.id).toBe(TRAINING_VAULT_ID);
    expect(v.wallet).toBe(TRAINING_VAULT_WALLET);

    const claim = claimFreeSiege(rolloverQuota(null, NOW), NOW, "seed-1");
    expect(claim.result!.targetId).toBe(v.id);
    expect(claim.result!.targetWallet).toBe(v.wallet);
  });

  it("is a Pit-class house vault, never the player's own", () => {
    const v = makeTrainingVault(NOW);
    expect(v.amount).toBe(TRAINING_VAULT_AMOUNT);
    expect(v.isYou).toBe(false);
    expect(tierParamsFor(v.amount).id).toBe("pit");
  });

  it("has zero streak so the displayed economics are the plain published numbers", () => {
    // A non-zero streak would scale fee AND slice by m_k, so the modal would
    // advertise different numbers than claimFreeSiege actually settles with
    // (the claim always uses mult = 1).
    const v = makeTrainingVault(NOW);
    expect(v.streak).toBe(0);
    expect(feeMultiplierForStreak(v.streak, STREAK_CFG)).toBe(1);
  });

  it("is unshielded and carries no bounty, so the modal opens cleanly", () => {
    const v = makeTrainingVault(NOW);
    expect(v.shieldUntil).toBe(0);
    expect(v.bountyPool).toBe(0);
  });
});

describe("freeSiegeResolution", () => {
  it("wraps a settled result as an accepted resolution", () => {
    const claim = claimFreeSiege(rolloverQuota(null, NOW), NOW, "seed-2");
    const res = freeSiegeResolution(claim.result, 120);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result).toBe(claim.result);
  });

  it("turns an exhausted quota into a typed rejection carrying the reset time", () => {
    // claimFreeSiege returns result: null at zero quota; the UI must be able to
    // say something true rather than failing silently.
    const res = freeSiegeResolution(null, 93);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason.kind).toBe("free_quota_exhausted");
      if (res.reason.kind === "free_quota_exhausted") {
        expect(res.reason.resetMins).toBe(93);
      }
    }
  });

  it("a free result never costs the player anything", () => {
    // The core promise of the on-ramp: no wallet, no vault, nothing at risk.
    const claim = claimFreeSiege(rolloverQuota(null, NOW), NOW, "seed-3");
    const r = claim.result as SiegeResult;
    expect(r.fee).toBe(0);
    expect(r.lost).toBe(0);
    expect(r.repeatTax).toBe(0);
  });
});
