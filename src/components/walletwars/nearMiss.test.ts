/**
 * Unit tests for the near-miss presentation model.
 *
 * Feature: wallet-wars-two-sided-redesign
 *
 * The win check (roll < pWin) is the frozen provably-fair rule — these tests
 * assert this module only *describes* that comparison and computes closeness,
 * never decides the outcome.
 */

import { describe, it, expect } from "vitest";
import {
  nearMissView,
  neededCopy,
  rolledCopy,
  syntheticAttempts,
} from "./nearMiss";

describe("nearMissView", () => {
  it("matches the frozen roll < pWin crack rule", () => {
    expect(nearMissView(0.05, 0.08).cracked).toBe(true);
    expect(nearMissView(0.11, 0.08).cracked).toBe(false);
    expect(nearMissView(0.08, 0.08).cracked).toBe(false); // strict <
  });

  it("a crack has full tension and 0% away", () => {
    const v = nearMissView(0.02, 0.12);
    expect(v.cracked).toBe(true);
    expect(v.tension).toBe(1);
    expect(v.awayPct).toBe(0);
  });

  it("the worked example: needed 0.08, rolled 0.11", () => {
    const v = nearMissView(0.11, 0.08);
    expect(v.cracked).toBe(false);
    // gap relative to threshold = (0.11-0.08)/0.08 = 0.375 → 38%
    expect(v.awayPct).toBe(38);
    expect(neededCopy(v)).toBe("You needed 0.08 or lower");
    expect(rolledCopy(v)).toBe("You rolled 0.11");
  });

  it("tension rises as the (failed) roll approaches the threshold", () => {
    const close = nearMissView(0.085, 0.08); // just over
    const far = nearMissView(0.5, 0.08); // way over
    expect(close.tension).toBeGreaterThan(far.tension);
    expect(close.awayPct).toBeLessThan(far.awayPct);
  });

  it("both markers fit the auto-zoomed meter [0,1]", () => {
    const v = nearMissView(0.11, 0.08);
    for (const f of [v.rollFrac, v.thresholdFrac]) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
    // roll sits above the threshold marker on a loss.
    expect(v.rollFrac).toBeGreaterThan(v.thresholdFrac);
  });

  it("guards non-finite inputs", () => {
    const v = nearMissView(Number.NaN, Number.POSITIVE_INFINITY);
    expect(Number.isFinite(v.tension)).toBe(true);
    expect(Number.isFinite(v.awayPct)).toBe(true);
  });
});

describe("syntheticAttempts", () => {
  it("is deterministic from the seed and length-bounded", () => {
    const a = syntheticAttempts("vault-1", 0.1, 5);
    const b = syntheticAttempts("vault-1", 0.1, 5);
    expect(a.length).toBe(5);
    expect(a.map((x) => x.roll)).toEqual(b.map((x) => x.roll));
  });

  it("different vaults produce different histories", () => {
    const a = syntheticAttempts("vault-1", 0.1, 5);
    const c = syntheticAttempts("vault-2", 0.1, 5);
    expect(a.map((x) => x.roll)).not.toEqual(c.map((x) => x.roll));
  });

  it("every entry is described against the published pWin", () => {
    for (const rec of syntheticAttempts("v", 0.08, 5)) {
      expect(rec.threshold).toBe(0.08);
      expect(rec.cracked).toBe(rec.roll < 0.08);
    }
  });
});
