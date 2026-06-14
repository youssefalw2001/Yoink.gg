/**
 * YOINK.GG — "The Bag" · Reign Toll engine settlement step (pure).
 *
 * The single place where a dethroning yoink's fee is turned into the toll
 * accrual the engine applies to React state. It is a thin, pure, total wrapper
 * over `bagMath` so that both `useGameState.applyYoink` and the integration
 * tests exercise the *exact same* accrual logic (mirrors how the Siege engine
 * split `resolveSiege`/`resolveBounty` out of the React hook for testability).
 *
 * No time, randomness, storage, or DOM access here.
 */

import { bagSplitParamsFor, splitYoinkFee, settleYoink, type YoinkDeltas } from "@/lib/bagMath";

export interface ReignTollInput {
  /** The yoink fee charged (`currentCost`). A free yoink is `cost === 0`. */
  cost: number;
  /** The room id; resolved to tier params (Arena fallback for unknown ids). */
  roomId: string;
  /** Whether the King being dethroned is the local player (`prev.kingIsYou`). */
  dethronedIsYou: boolean;
  /** Tolls the dethroned wallet had already banked THIS round (cumulative). */
  priorWalletTolls: number;
  /** The local player's `roundTollsBanked` before this yoink. */
  priorRoundTollsBanked: number;
}

export interface ReignTollResult {
  /** Toll credited to the outgoing King (== `split.toToll`; 0 for free yoinks). */
  toll: number;
  /** SOL added to the bag from this fee (the rebalanced bag share). */
  toBag: number;
  /** The dethroned King's accumulated round tolls (prior + this yoink's toll). */
  fallenTollsBanked: number;
  /** The local player's updated `roundTollsBanked` (unchanged unless they were dethroned). */
  roundTollsBanked: number;
  /** Toll recorded on the `YoinkEvent` for the feed (== `toll`). */
  tollPaid: number;
  /** Per-actor zero-sum deltas for this settled yoink (audit / future on-chain). */
  deltas: YoinkDeltas;
}

/**
 * Compute the Reign Toll accrual for one dethroning yoink. Pure + total.
 *
 * - The outgoing King banks `split.toToll`, kept regardless of the fuse outcome.
 * - Only `split.toBag` is added to the bag (the drain mechanic is applied by the
 *   engine, unchanged).
 * - A free yoink (`cost === 0`, or any negative/non-finite cost) banks nothing:
 *   `splitYoinkFee` already forces `toToll === 0` and `toBag === 0`.
 * - The local player's `roundTollsBanked` only grows when they were the King
 *   being dethroned.
 */
export function accrueReignToll(input: ReignTollInput): ReignTollResult {
  const params = bagSplitParamsFor(input.roomId);
  const split = splitYoinkFee(input.cost, params);
  const toll = split.toToll;

  return {
    toll,
    toBag: split.toBag,
    fallenTollsBanked: +(input.priorWalletTolls + toll).toFixed(6),
    roundTollsBanked: input.dethronedIsYou
      ? +(input.priorRoundTollsBanked + toll).toFixed(6)
      : input.priorRoundTollsBanked,
    tollPaid: toll,
    deltas: settleYoink(input.cost, params),
  };
}
