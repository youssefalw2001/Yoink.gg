/**
 * YOINK.GG — Free-siege on-ramp glue (the funnel fix).
 *
 * THE PROBLEM THIS SOLVES: a siege fee is debited from the raider's own vault
 * corpus, so `canRaidStash` returns false whenever `state.you` is null. That
 * made opening a vault — a real capital commitment — mandatory before a new
 * visitor could take a single shot. The first frame of the Hunt board was a
 * wall of disabled buttons, and the free-siege engine that already existed
 * (`useFreeSiege`) had no UI consumer at all.
 *
 * This module is the missing seam: it supplies the HOUSE-OWNED training vault
 * that a free siege targets, and adapts a `claimFreeSiege` outcome into the same
 * `SiegeResolution` shape the paid flow already speaks, so `SiegeModal` needs no
 * knowledge of where a result came from.
 *
 * Pure, total, side-effect free — the quota/localStorage lives in the hook.
 */

import { TRAINING_VAULT_AMOUNT } from "@/hooks/useFreeRound";
import { DEFAULT_RISK_PROFILE } from "@/lib/siegeMath";
import type { SiegeResolution, SiegeResult, Vault } from "@/lib/walletWarsState";

/** Stable id/wallet for the house training vault (matches `claimFreeSiege`). */
export const TRAINING_VAULT_ID = "house-training-vault";
export const TRAINING_VAULT_WALLET = "House Training Vault";

/**
 * Build the synthetic house training vault a free siege targets.
 *
 * It is NEVER a real player's vault and never enters `state.stashes`, so it
 * cannot be sieged for profit, cannot appear on the board, and cannot be
 * cracked by the ambient bot tick. `streak` is 0 so the fee/slice multiplier is
 * exactly 1 and the displayed economics are the plain published Pit numbers.
 */
export function makeTrainingVault(now: number): Vault {
  return {
    id: TRAINING_VAULT_ID,
    wallet: TRAINING_VAULT_WALLET,
    isYou: false,
    amount: TRAINING_VAULT_AMOUNT,
    banked: 0,
    survived: 0,
    cracked: 0,
    streak: 0,
    openedAt: now,
    shieldUntil: 0,
    seq: 0,
    compound: false,
    feesEarned: 0,
    bountyPool: 0,
    bountyExpiry: 0,
    riskProfile: DEFAULT_RISK_PROFILE,
  };
}

/**
 * Adapt a free-siege claim into the paid flow's `SiegeResolution`.
 *
 * `claimFreeSiege` returns `result: null` when the daily quota is spent; that
 * becomes a typed `free_quota_exhausted` rejection carrying the minutes until
 * the UTC reset, so the modal can say something true instead of failing silently.
 */
export function freeSiegeResolution(
  result: SiegeResult | null,
  resetMins: number,
): SiegeResolution {
  if (!result) {
    return { ok: false, reason: { kind: "free_quota_exhausted", resetMins } };
  }
  return { ok: true, result };
}
