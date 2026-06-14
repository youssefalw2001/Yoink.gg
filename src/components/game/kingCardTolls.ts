/**
 * Pure presentation model for the KingCard Reign Toll chip.
 *
 * Extracted from `KingCard.tsx` so the chip's behaviour (visibility, label, and
 * whether the count-up animates vs. swaps to a static value under reduced
 * motion) is unit-testable without a DOM — the app has no DOM test runner and
 * vitest runs in a plain Node environment.
 */

import { formatSol } from "@/lib/utils";

export interface TollsChipModel {
  /** The chip is only shown once the local player has banked a toll this round. */
  show: boolean;
  /** The gold chip label, e.g. "Tolls banked · 0.014 SOL". */
  label: string;
  /** When false (reduced motion) the value is rendered static — no count-up. */
  animate: boolean;
}

export function tollsChipModel(roundTollsBanked: number, reducedMotion: boolean): TollsChipModel {
  return {
    show: roundTollsBanked > 0,
    label: `Tolls banked · ${formatSol(roundTollsBanked, 3)} SOL`,
    animate: !reducedMotion,
  };
}
