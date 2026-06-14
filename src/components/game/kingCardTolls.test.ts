/**
 * Lightweight KingCard Reign Toll chip test.
 *
 * Feature: bag-reign-toll
 *
 * Example-based (NOT a property test). Verifies the chip's presentation model:
 * it shows only when the local player has banked a toll this round, and that a
 * reduced-motion preference swaps the spring count-up for a static value. The
 * app has no DOM test runner, so this asserts the pure model that drives the
 * chip's render path in `KingCard.tsx`.
 */

import { describe, it, expect } from "vitest";
import { tollsChipModel } from "./kingCardTolls";

describe("KingCard Reign Toll chip", () => {
  it("renders the chip when roundTollsBanked > 0", () => {
    const m = tollsChipModel(0.014, false);
    expect(m.show).toBe(true);
    expect(m.label).toBe("Tolls banked · 0.014 SOL");
  });

  it("hides the chip when no toll has been banked yet", () => {
    expect(tollsChipModel(0, false).show).toBe(false);
  });

  it("animates the count-up by default (motion allowed)", () => {
    expect(tollsChipModel(0.05, false).animate).toBe(true);
  });

  it("swaps the count-up for a static value under reduced motion", () => {
    const m = tollsChipModel(0.05, true);
    expect(m.animate).toBe(false);
    expect(m.show).toBe(true); // still shows the chip, just without the animation
  });
});
