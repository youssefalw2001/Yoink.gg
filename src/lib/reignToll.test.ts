/**
 * Engine integration tests for Reign Toll settlement.
 *
 * Feature: bag-reign-toll
 *
 * These exercise `accrueReignToll` — the exact pure settlement step the engine
 * (`useGameState.applyYoink`) uses — over realistic sequences of dethrones, so
 * the assertions hold against real engine logic rather than a test-only fake.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { accrueReignToll } from "./reignToll";
import { bagSplitParamsFor } from "./bagMath";

/** Fees at ≤4 dp in [0, 5] SOL (the engine's rounded fee domain). */
const feeArb = fc.integer({ min: 0, max: 50_000 }).map((n) => n / 10_000);
/** A yoink: its fee and whether it dethroned the LOCAL player. */
const yoinkArb = fc.record({ fee: feeArb, dethronedIsYou: fc.boolean() });
const roomArb = fc.constantFrom("pit", "grind", "arena", "court");

/**
 * Fold a sequence of yoinks through the engine accrual, tracking the local
 * player's `roundTollsBanked` and the per-wallet cumulative tolls (keyed by a
 * synthetic wallet that alternates so cumulative bookkeeping is exercised).
 */
function runRound(yoinks: { fee: number; dethronedIsYou: boolean }[], roomId: string) {
  let roundTollsBanked = 0;
  let youCumulative = 0; // the local player's cumulative tolls across the round
  const tollPaidOnLocalDethrones: number[] = [];

  for (const y of yoinks) {
    const a = accrueReignToll({
      cost:                  y.fee,
      roomId,
      dethronedIsYou:        y.dethronedIsYou,
      priorWalletTolls:      y.dethronedIsYou ? youCumulative : 0,
      priorRoundTollsBanked: roundTollsBanked,
    });
    roundTollsBanked = a.roundTollsBanked;
    if (y.dethronedIsYou) {
      youCumulative = a.fallenTollsBanked;
      tollPaidOnLocalDethrones.push(a.tollPaid);
    }
  }
  return { roundTollsBanked, youCumulative, tollPaidOnLocalDethrones };
}

// ── Property 10 — Round toll accumulation conserved ───────────────────────────

describe("Property 10: Round toll accumulation is conserved", () => {
  it("roundTollsBanked === Σ tollPaid over the local player's dethrones", () => {
    // Feature: bag-reign-toll, Property 10
    fc.assert(
      fc.property(fc.array(yoinkArb, { maxLength: 60 }), roomArb, (yoinks, roomId) => {
        const { roundTollsBanked, tollPaidOnLocalDethrones } = runRound(yoinks, roomId);
        const expected = +tollPaidOnLocalDethrones.reduce((s, t) => s + t, 0).toFixed(6);
        return Math.abs(roundTollsBanked - expected) <= 1e-9;
      }),
      { numRuns: 200 },
    );
  });
});

// ── Zero-sum across a dethrone ────────────────────────────────────────────────

describe("zero-sum across a settled dethrone", () => {
  it("payer −fee, outgoing King +toll, bag +toBag, house/jackpot shares sum to 0", () => {
    const arena = bagSplitParamsFor("arena");
    const a = accrueReignToll({
      cost: 0.2,
      roomId: "arena",
      dethronedIsYou: true,
      priorWalletTolls: 0,
      priorRoundTollsBanked: 0,
    });
    const d = a.deltas;
    expect(d.payer).toBeCloseTo(-0.2, 9);
    expect(d.outgoingKing).toBeCloseTo(0.014, 9); // 7% toll
    expect(d.bag).toBeCloseTo(0.152, 9); // 76% bag
    expect(d.house).toBeCloseTo(0.024, 9); // rake 0.02 + drain 0.004
    expect(d.jackpot).toBeCloseTo(0.01, 9); // 5%
    expect(d.payer + d.outgoingKing + d.bag + d.house + d.jackpot).toBeCloseTo(0, 9);
    // The toll the local King banks equals the bag's rebalanced toll slice.
    expect(a.toll).toBeCloseTo(0.014, 9);
    expect(arena.tollBps).toBe(700);
  });
});

// ── Free yoink banks nothing end-to-end ───────────────────────────────────────

describe("free yoink (cost === 0) banks nothing", () => {
  it("toll, toBag, fallen tolls, and roundTollsBanked are all unaffected", () => {
    for (const roomId of ["pit", "grind", "arena", "court"]) {
      const a = accrueReignToll({
        cost: 0,
        roomId,
        dethronedIsYou: true,
        priorWalletTolls: 0.5,
        priorRoundTollsBanked: 0.5,
      });
      expect(a.toll).toBe(0);
      expect(a.toBag).toBe(0);
      expect(a.tollPaid).toBe(0);
      expect(a.fallenTollsBanked).toBe(0.5); // unchanged
      expect(a.roundTollsBanked).toBe(0.5); // unchanged
    }
  });
});
