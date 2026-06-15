/**
 * Unit tests for the two-sided role model + Siege-Runner progression.
 *
 * Feature: wallet-wars-two-sided-redesign
 *
 * Progression is recognition/unlock gating only — these tests assert it is
 * monotonic, bounded, and never touches any SOL-moving number.
 */

import { describe, it, expect } from "vitest";
import {
  tabForRole,
  roleForTab,
  isWarRole,
  runnerXp,
  runnerWinRate,
  runnerLevelForXp,
  runnerLevel,
  runnerHasReached,
  recordSiege,
  RUNNER_LEVELS,
  RUNNER_XP_PER_ATTEMPT,
  RUNNER_XP_PER_CRACK,
  EMPTY_RUNNER_STATS,
} from "./walletWarsRole";

describe("role ⇄ tab mapping", () => {
  it("maps roles to their tab and back", () => {
    expect(tabForRole("lord")).toBe("build");
    expect(tabForRole("runner")).toBe("hunt");
    expect(roleForTab("build")).toBe("lord");
    expect(roleForTab("hunt")).toBe("runner");
  });

  it("validates roles", () => {
    expect(isWarRole("lord")).toBe(true);
    expect(isWarRole("runner")).toBe(true);
    expect(isWarRole("whale")).toBe(false);
    expect(isWarRole(null)).toBe(false);
    expect(isWarRole(undefined)).toBe(false);
  });
});

describe("runner XP", () => {
  it("is attempts·perAttempt + cracks·perCrack", () => {
    expect(runnerXp({ attempts: 0, cracks: 0, solWon: 0 })).toBe(0);
    expect(runnerXp({ attempts: 3, cracks: 1, solWon: 9 })).toBe(
      3 * RUNNER_XP_PER_ATTEMPT + 1 * RUNNER_XP_PER_CRACK,
    );
  });

  it("guards negative / non-finite inputs", () => {
    expect(runnerXp({ attempts: -5, cracks: Number.NaN, solWon: 0 })).toBe(0);
  });
});

describe("runner win rate", () => {
  it("is 0 with no attempts and bounded to [0,1]", () => {
    expect(runnerWinRate(EMPTY_RUNNER_STATS)).toBe(0);
    expect(runnerWinRate({ attempts: 4, cracks: 1, solWon: 3 })).toBeCloseTo(0.25, 12);
    expect(runnerWinRate({ attempts: 2, cracks: 5, solWon: 3 })).toBe(1); // clamped
  });
});

describe("runner level bands", () => {
  it("starts at level 1 with no XP", () => {
    const info = runnerLevelForXp(0);
    expect(info.level).toBe(1);
    expect(info.isMax).toBe(false);
    expect(info.next?.level).toBe(2);
    expect(info.xpToNext).toBe(RUNNER_LEVELS[1].xpFloor);
  });

  it("is non-decreasing in XP and never exceeds the top rung", () => {
    let prev = 0;
    for (let xp = 0; xp <= 4000; xp += 25) {
      const lvl = runnerLevelForXp(xp).level;
      expect(lvl).toBeGreaterThanOrEqual(prev);
      expect(lvl).toBeLessThanOrEqual(RUNNER_LEVELS.length);
      prev = lvl;
    }
  });

  it("caps at level 5 (max) with full progress and no next", () => {
    const info = runnerLevelForXp(999_999);
    expect(info.level).toBe(5);
    expect(info.isMax).toBe(true);
    expect(info.next).toBeNull();
    expect(info.xpToNext).toBe(0);
    expect(info.pctToNext).toBe(1);
  });

  it("reports partial progress inside a band", () => {
    // Halfway between L1 (0) and L2 (150).
    const info = runnerLevelForXp(75);
    expect(info.level).toBe(1);
    expect(info.xpIntoLevel).toBe(75);
    expect(info.xpForNextLevel).toBe(150);
    expect(info.pctToNext).toBeCloseTo(0.5, 12);
    expect(info.xpToNext).toBe(75);
  });

  it("exposes the five published unlock rungs in order", () => {
    expect(RUNNER_LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    const floors = RUNNER_LEVELS.map((l) => l.xpFloor);
    const sorted = [...floors].sort((a, b) => a - b);
    expect(floors).toEqual(sorted); // strictly increasing thresholds
  });
});

describe("recordSiege transition", () => {
  it("increments attempts always, cracks + solWon only on a win", () => {
    let s = EMPTY_RUNNER_STATS;
    s = recordSiege(s, "loss", 0);
    expect(s).toEqual({ attempts: 1, cracks: 0, solWon: 0 });
    s = recordSiege(s, "win", 2.5);
    expect(s).toEqual({ attempts: 2, cracks: 1, solWon: 2.5 });
  });

  it("level + reached helpers agree", () => {
    const stats = { attempts: 10, cracks: 2, solWon: 12 }; // 10*20 + 2*100 = 400 XP → L2
    expect(runnerLevel(stats).level).toBe(2);
    expect(runnerHasReached(stats, 2)).toBe(true);
    expect(runnerHasReached(stats, 3)).toBe(false);
  });
});
