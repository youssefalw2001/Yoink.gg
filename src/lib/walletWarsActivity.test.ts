/**
 * Unit tests for the activity/idle detection + opportunity value ranking.
 *
 * Feature: wallet-wars-two-sided-redesign
 *
 * These are visibility/sort + simulation-cadence helpers ONLY. The tests assert
 * the score responds to situational signals as designed and that idle detection
 * is deterministic — never that they change odds/EV (they can't: no economy
 * value is produced here).
 */

import { describe, it, expect } from "vitest";
import {
  HUNT_IDLE_SIGNAL_MS,
  GUARANTEED_ACTIVITY_MS,
  idleMsFor,
  lastActivityFromShield,
  isIdleTarget,
  guaranteedActivityTargets,
  upsideMultiple,
  opportunityScore,
  type OpportunitySignals,
} from "./walletWarsActivity";

const BASE: OpportunitySignals = {
  crackChance: 0.1,
  sliceWon: 1,
  feeRisked: 0.1,
  sizeSol: 5,
  bountyPool: 0,
  streak: 0,
  idleMs: 0,
  shielded: false,
};

describe("idle detection", () => {
  it("idleMs is the clamped elapsed time", () => {
    expect(idleMsFor(1_000, 5_000)).toBe(4_000);
    expect(idleMsFor(5_000, 1_000)).toBe(0); // never negative
  });

  it("flags a Hunt idle target past the 30-min signal", () => {
    const now = 100 * 60_000;
    expect(isIdleTarget(now - (HUNT_IDLE_SIGNAL_MS - 1), now)).toBe(false);
    expect(isIdleTarget(now - HUNT_IDLE_SIGNAL_MS, now)).toBe(true);
  });

  it("derives last activity from the shield stamp, falling back to openedAt", () => {
    const shieldMs = 6_000;
    // Sieged: shieldUntil = lastSiege + shieldMs → recovers lastSiege.
    expect(lastActivityFromShield(10_000, 1_000, shieldMs)).toBe(4_000);
    // Never sieged (shieldUntil 0) → openedAt.
    expect(lastActivityFromShield(0, 2_500, shieldMs)).toBe(2_500);
  });
});

describe("guaranteed-activity targets", () => {
  const now = 200 * 60_000;
  const vaults = [
    { id: "a", openedAt: 0 },
    { id: "b", openedAt: 0 },
    { id: "c", openedAt: 0 },
  ];

  it("returns vaults idle past the 60-min threshold, oldest-idle first, capped", () => {
    const last = new Map<string, number>([
      ["a", now - (GUARANTEED_ACTIVITY_MS + 10 * 60_000)], // very idle
      ["b", now - (GUARANTEED_ACTIVITY_MS + 60_000)], // idle
      ["c", now - 60_000], // fresh
    ]);
    const targets = guaranteedActivityTargets(vaults, last, now, GUARANTEED_ACTIVITY_MS, 2);
    expect(targets).toEqual(["a", "b"]); // c excluded, oldest-idle first, capped at 2
  });

  it("falls back to openedAt when no activity is recorded", () => {
    const fresh = [{ id: "x", openedAt: now - 60_000 }];
    expect(guaranteedActivityTargets(fresh, new Map(), now).length).toBe(0);
    const old = [{ id: "y", openedAt: now - (GUARANTEED_ACTIVITY_MS + 1) }];
    expect(guaranteedActivityTargets(old, new Map(), now)).toEqual(["y"]);
  });
});

describe("opportunity value score", () => {
  it("upside multiple is slice ÷ fee (0 when fee is non-positive)", () => {
    expect(upsideMultiple(3, 0.3)).toBeCloseTo(10, 12);
    expect(upsideMultiple(3, 0)).toBe(0);
  });

  it("a live bounty raises the score", () => {
    const withBounty = opportunityScore({ ...BASE, bountyPool: 2 });
    expect(withBounty).toBeGreaterThan(opportunityScore(BASE));
  });

  it("an idle owner raises the score", () => {
    const idle = opportunityScore({ ...BASE, idleMs: HUNT_IDLE_SIGNAL_MS });
    expect(idle).toBeGreaterThan(opportunityScore(BASE));
  });

  it("a fatter upside multiple raises the score", () => {
    const fat = opportunityScore({ ...BASE, sliceWon: 3 }); // 30× vs 10×
    expect(fat).toBeGreaterThan(opportunityScore(BASE));
  });

  it("a shield heavily deprioritises the same opportunity", () => {
    const open = opportunityScore(BASE);
    const shielded = opportunityScore({ ...BASE, shielded: true });
    expect(shielded).toBeLessThan(open);
  });

  it("is finite for degenerate inputs", () => {
    expect(Number.isFinite(opportunityScore({ ...BASE, feeRisked: 0, sliceWon: 0 }))).toBe(true);
  });
});
