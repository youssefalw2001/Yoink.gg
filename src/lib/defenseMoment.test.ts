/**
 * Defender-moment tests.
 *
 * The design constraint being protected here is subtle: the fix for "the
 * defender gets no feedback" must NOT become "the defender gets a notification
 * every 16 seconds". The ambient tick attacks the player roughly that often, so
 * these tests pin the escalation policy — routine holds stay silent, close calls
 * are throttled, milestones always land — as tightly as they pin the arithmetic.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  streakProgress,
  defenseMilestone,
  defenseSignificance,
  shouldAnnounce,
  defenseNearMissCopy,
  defenseHeadline,
  CLOSE_CALL_TENSION,
  ANNOUNCE_COOLDOWN_MS,
  MULT_MILESTONES,
  type DefenseEvent,
} from "./defenseMoment";
import { STREAK_CFG, feeMultiplierForStreak } from "./siegeMath";
import { nearMissView } from "@/components/walletwars/nearMiss";

const P = 0.12; // Pit crack chance

/** Build a defence event; `roll` defaults to a comfortable miss. */
function ev(over: Partial<DefenseEvent> = {}): DefenseEvent {
  return {
    id: 1,
    outcome: "held",
    attacker: "0xbot",
    toll: 0.0196,
    lost: 0,
    roll: 0.9,          // far above p → routine
    pWin: P,
    streakAfter: 3,
    survivedAfter: 3,
    ts: 1_000_000,
    ...over,
  };
}

/** A roll that is a close call for a given p (just above the threshold). */
function closeRoll(p: number): number {
  // tension = 1 - (r-p)/p, so tension >= T  <=>  r <= p*(2-T)
  return p * (2 - CLOSE_CALL_TENSION) - 1e-6;
}

describe("streakProgress", () => {
  it("mirrors the engine's multiplier exactly", () => {
    fc.assert(
      fc.property(fc.nat({ max: 200 }), (s) =>
        streakProgress(s).mult === feeMultiplierForStreak(s, STREAK_CFG)),
      { numRuns: 300 },
    );
  });

  it("caps at the engine cap and reports it", () => {
    const atCap = streakProgress(STREAK_CFG.cap);
    expect(atCap.atCap).toBe(true);
    expect(atCap.mult).toBeCloseTo(2.0, 9);
    expect(atCap.pctToCap).toBe(1);
    expect(atCap.nextMilestoneMult).toBeNull();
    expect(atCap.survivalsToNextMilestone).toBe(0);
    // Past the cap behaves identically — no runaway multiplier.
    expect(streakProgress(999).mult).toBeCloseTo(2.0, 9);
    expect(streakProgress(999).atCap).toBe(true);
  });

  it("offers the next headline tier rather than 'one more siege'", () => {
    // Each survival adds exactly 0.04, so "next multiplier" is always 1 away and
    // useless as a goal. The target must be a headline tier.
    const p0 = streakProgress(0);
    expect(p0.mult).toBe(1);
    expect(p0.nextMilestoneMult).toBe(1.25);
    // 1.25 needs streak 7 (1 + 0.04*7 = 1.28 >= 1.25; streak 6 gives 1.24).
    expect(p0.survivalsToNextMilestone).toBe(7);
  });

  it("advances the target as tiers are passed", () => {
    expect(streakProgress(7).nextMilestoneMult).toBe(1.5);
    expect(streakProgress(13).nextMilestoneMult).toBe(1.75);
    expect(streakProgress(19).nextMilestoneMult).toBe(2.0);
  });

  it("never reports a target already achieved", () => {
    fc.assert(
      fc.property(fc.nat({ max: 30 }), (s) => {
        const p = streakProgress(s);
        return p.nextMilestoneMult === null || p.nextMilestoneMult > p.mult + 1e-9;
      }),
      { numRuns: 200 },
    );
  });

  it("survivalsToNextMilestone actually reaches the target", () => {
    for (let s = 0; s < STREAK_CFG.cap; s++) {
      const p = streakProgress(s);
      if (p.nextMilestoneMult === null) continue;
      const reached = feeMultiplierForStreak(s + p.survivalsToNextMilestone, STREAK_CFG);
      expect(reached + 1e-9, `from streak ${s}`).toBeGreaterThanOrEqual(p.nextMilestoneMult);
      // …and not overshoot by a whole extra siege.
      const oneLess = feeMultiplierForStreak(s + p.survivalsToNextMilestone - 1, STREAK_CFG);
      expect(oneLess, `from streak ${s} (tightness)`).toBeLessThan(p.nextMilestoneMult);
    }
  });

  it("is defensive about junk input", () => {
    for (const bad of [-5, NaN, Infinity, -Infinity]) {
      const p = streakProgress(bad as number);
      expect(Number.isFinite(p.mult)).toBe(true);
      expect(p.mult).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("defenseMilestone", () => {
  it("calls out the first repelled siege", () => {
    expect(defenseMilestone(ev({ survivedAfter: 1, streakAfter: 1 }))).toBe("First siege repelled");
  });

  it("calls out survival counts", () => {
    expect(defenseMilestone(ev({ survivedAfter: 10, streakAfter: 10 }))).toBe("10 sieges repelled");
    // streak 50 is past the cap, so no tier is crossed and the count wins.
    expect(defenseMilestone(ev({ survivedAfter: 50, streakAfter: 50 }))).toBe("50 sieges repelled");
  });

  it("a multiplier tier outranks a coinciding survival count", () => {
    // streak 25 is BOTH the 25th survival and the cap. The cap is rarer and
    // changes what every future raider pays, so it must not be buried.
    expect(defenseMilestone(ev({ survivedAfter: 25, streakAfter: 25 })))
      .toBe("Max toll reached — x2.00");
    // A survival count with no tier crossing still reports the count.
    expect(defenseMilestone(ev({ survivedAfter: 5, streakAfter: 5 }))).toBe("5 sieges repelled");
  });

  it("survived and streak are independent triggers after a crack", () => {
    // A crack resets streak but not lifetime survived, so a later survival can
    // cross a tier at a low streak while survived is already high.
    expect(defenseMilestone(ev({ survivedAfter: 40, streakAfter: 7 })))
      .toBe("Toll multiplier x1.25");
  });

  it("stays quiet on an unremarkable count", () => {
    expect(defenseMilestone(ev({ survivedAfter: 3, streakAfter: 3 }))).toBeNull();
    expect(defenseMilestone(ev({ survivedAfter: 11, streakAfter: 11 }))).toBeNull();
  });

  it("fires exactly once when a multiplier tier is crossed", () => {
    // streak 7 crosses x1.25 (6 -> 1.24, 7 -> 1.28).
    expect(defenseMilestone(ev({ survivedAfter: 7, streakAfter: 7 }))).toBe("Toll multiplier x1.25");
    // Streak 8 is past it and must not re-announce.
    expect(defenseMilestone(ev({ survivedAfter: 8, streakAfter: 8 }))).toBeNull();
  });

  it("labels the cap specially", () => {
    const s = STREAK_CFG.cap;
    expect(defenseMilestone(ev({ survivedAfter: s, streakAfter: s }))).toBe("Max toll reached — x2.00");
  });

  it("treats being cracked as a milestone", () => {
    // The most consequential defender event; silence here would be the worst
    // omission of all.
    expect(defenseMilestone(ev({ outcome: "cracked", streakAfter: 0 })))
      .toBe("Vault cracked — streak reset");
  });

  it("announces each multiplier tier at most once across a full run", () => {
    const seen = new Map<string, number>();
    for (let s = 1; s <= STREAK_CFG.cap; s++) {
      const m = defenseMilestone(ev({ survivedAfter: s, streakAfter: s }));
      if (m && m.startsWith("Toll multiplier") || m?.startsWith("Max toll")) {
        seen.set(m!, (seen.get(m!) ?? 0) + 1);
      }
    }
    for (const [label, count] of seen) expect(count, label).toBe(1);
    // Every reachable tier got announced.
    expect(seen.size).toBe(MULT_MILESTONES.length);
  });
});

describe("defenseSignificance", () => {
  it("a comfortable hold is routine", () => {
    expect(defenseSignificance(ev({ roll: 0.9 }))).toBe("routine");
  });

  it("a near-threshold hold is a close call", () => {
    const e = ev({ roll: closeRoll(P), survivedAfter: 3, streakAfter: 3 });
    expect(nearMissView(e.roll, e.pWin).tension).toBeGreaterThanOrEqual(CLOSE_CALL_TENSION);
    expect(defenseSignificance(e)).toBe("closeCall");
  });

  it("a milestone outranks a close call", () => {
    const e = ev({ roll: closeRoll(P), survivedAfter: 10, streakAfter: 10 });
    expect(defenseSignificance(e)).toBe("milestone");
  });

  it("a crack is always a milestone regardless of roll", () => {
    expect(defenseSignificance(ev({ outcome: "cracked", roll: 0.001, streakAfter: 0 })))
      .toBe("milestone");
  });
});

describe("shouldAnnounce — the anti-spam policy", () => {
  it("never interrupts for a routine hold", () => {
    // This is the whole point: the tick attacks ~every 16s, so routine holds must
    // stay as silent numeric updates or the feedback trains itself to be ignored.
    expect(shouldAnnounce(ev({ roll: 0.9 }), 0)).toBe(false);
    expect(shouldAnnounce(ev({ roll: 0.5 }), 0)).toBe(false);
  });

  it("always interrupts for a milestone, even immediately after another", () => {
    const e = ev({ survivedAfter: 10, streakAfter: 10, ts: 1_000_000 });
    expect(shouldAnnounce(e, 999_999)).toBe(true); // 1ms after the last one
  });

  it("throttles close calls to the cooldown", () => {
    const e = ev({ roll: closeRoll(P), ts: 1_000_000 });
    expect(shouldAnnounce(e, 1_000_000 - ANNOUNCE_COOLDOWN_MS + 1)).toBe(false);
    expect(shouldAnnounce(e, 1_000_000 - ANNOUNCE_COOLDOWN_MS)).toBe(true);
    expect(shouldAnnounce(e, 0)).toBe(true);
  });

  it("a burst of close calls yields at most one announcement per cooldown", () => {
    let last = 0;
    let announced = 0;
    // 20 close calls, one every 3.5s (the tick period).
    for (let i = 0; i < 20; i++) {
      const e = ev({ roll: closeRoll(P), ts: i * 3_500 });
      if (shouldAnnounce(e, last)) { announced++; last = e.ts; }
    }
    const span = 19 * 3_500;
    expect(announced).toBeLessThanOrEqual(Math.ceil(span / ANNOUNCE_COOLDOWN_MS) + 1);
    expect(announced).toBeGreaterThan(0); // but it does not go silent either
  });
});

describe("defenseNearMissCopy", () => {
  it("reports how close the attacker came on a close call", () => {
    const e = ev({ roll: closeRoll(P) });
    const copy = defenseNearMissCopy(e);
    expect(copy).toMatch(/^They came within \d+% of cracking you$/);
  });

  it("stays silent on a comfortable hold", () => {
    expect(defenseNearMissCopy(ev({ roll: 0.95 }))).toBeNull();
  });

  it("stays silent when actually cracked (nothing was 'nearly' anything)", () => {
    expect(defenseNearMissCopy(ev({ outcome: "cracked", roll: 0.01 }))).toBeNull();
  });

  it("is numerically consistent with the raider's own near-miss view", () => {
    // Both sides of one settled siege must quote the same percentage — they are
    // the same (roll, p) read from opposite ends.
    fc.assert(
      fc.property(
        fc.double({ min: 0.005, max: 0.999, noNaN: true }),
        fc.double({ min: 0.01, max: 0.5, noNaN: true }),
        (roll, p) => {
          const e = ev({ roll, pWin: p });
          const copy = defenseNearMissCopy(e);
          if (copy === null) return true;
          return copy.includes(`${nearMissView(roll, p).awayPct}%`);
        },
      ),
      { numRuns: 400 },
    );
  });
});

describe("defenseHeadline", () => {
  it("prefers the milestone label", () => {
    expect(defenseHeadline(ev({ survivedAfter: 25, streakAfter: 25 }))).toBe("Max toll reached — x2.00");
  });

  it("falls back to a plain outcome", () => {
    expect(defenseHeadline(ev({ survivedAfter: 3, streakAfter: 3 }))).toBe("Vault held");
  });

  it("never returns an empty string", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 300 }),
        fc.constantFrom<"held" | "cracked">("held", "cracked"),
        (s, outcome) =>
          defenseHeadline(ev({ survivedAfter: s, streakAfter: s, outcome })).length > 0,
      ),
      { numRuns: 200 },
    );
  });
});
