/**
 * Tests for the pure Reign Toll money-math module.
 *
 * Feature: bag-reign-toll
 *
 * Contains the worked-example unit tests (design Worked Examples A & B, plus the
 * lamport-exact Arena split) and the numbered correctness-property tests from
 * the design's "Correctness Properties" section. Each property test runs a
 * minimum of 100 iterations.
 *
 * Fee generation note: real yoink fees are produced by `computeYoinkCost`, which
 * rounds to 3 decimal places. We generate fees at ≤4 dp (multiples of 1e-4) — an
 * intelligent constraint on the input space — so that `fee · (bps/100)/100` lands
 * exactly on the 6 dp grid and per-part rounding is lossless. Conservation then
 * holds to lamport precision (1e-9).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  type BagTierId,
  type BagSplitParams,
  TOLL_BPS_BY_ROOM,
  bagSplitParamsFor,
  tollFor,
  bagAddFor,
  splitYoinkFee,
  settleYoink,
  evHousePerYoink,
  collusionFloor,
  playerSideBps,
  BAG_ESCROW_LIVE,
} from "./bagMath";

const TIER_IDS: BagTierId[] = ["pit", "grind", "arena", "court"];
const ALL_PARAMS: BagSplitParams[] = TIER_IDS.map((id) => bagSplitParamsFor(id));

/** 1 lamport = 1e-9 SOL — the conservation tolerance. */
const LAMPORT = 1e-9;

const sumSplit = (s: ReturnType<typeof splitYoinkFee>) =>
  s.toBag + s.toToll + s.toRake + s.toJackpot + s.toDrain;

// ── Generators ────────────────────────────────────────────────────────────────

/** Fees at ≤4 dp in [0, 500] SOL (matches the engine's rounded fee domain). */
const feeArb = fc.integer({ min: 0, max: 5_000_000 }).map((n) => n / 10_000);
/** Strictly-positive fees for collusion totals. */
const posFeeArb = fc.integer({ min: 1, max: 5_000_000 }).map((n) => n / 10_000);
const tierArb = fc.constantFrom(...ALL_PARAMS);

// ── 1.2 Worked-example unit tests ─────────────────────────────────────────────

describe("worked examples (exact published rows)", () => {
  it("lamport-exact Arena F = 0.20 SOL split reproduces the design table", () => {
    const arena = bagSplitParamsFor("arena");
    const s = splitYoinkFee(0.2, arena);
    // 1 SOL = 1e9 lamports; assert the exact lamport amounts from design.md.
    expect(Math.round(s.toBag * 1e9)).toBe(152_000_000);
    expect(Math.round(s.toToll * 1e9)).toBe(14_000_000);
    expect(Math.round(s.toRake * 1e9)).toBe(20_000_000);
    expect(Math.round(s.toJackpot * 1e9)).toBe(10_000_000);
    expect(Math.round(s.toDrain * 1e9)).toBe(4_000_000);
    expect(Math.round(sumSplit(s) * 1e9)).toBe(200_000_000);
  });

  it("Worked Example A — busy Arena (24 yoinks, avg 0.22 → 5.28 SOL total)", () => {
    const arena = bagSplitParamsFor("arena");
    const totalFees = 5.28;
    // Total toll pool = 7% of fees; bag inflow = 76% of fees.
    expect(tollFor(totalFees, arena)).toBeCloseTo(0.3696, 9);
    expect(bagAddFor(totalFees, arena)).toBeCloseTo(4.0128, 9);
    // Alice dethroned at fees [0.15,0.20,0.25,0.30,0.28] banks 7% of their sum.
    const aliceFees = 0.15 + 0.2 + 0.25 + 0.3 + 0.28; // 1.18
    expect(tollFor(aliceFees, arena)).toBeCloseTo(0.0826, 9);
  });

  it("Worked Example B — quiet Grind (5 yoinks, avg 0.07 → 0.35 SOL total)", () => {
    const grind = bagSplitParamsFor("grind");
    const totalFees = 0.35;
    // Total toll pool = 6% of fees.
    expect(tollFor(totalFees, grind)).toBeCloseTo(0.021, 9);
    // A King dethroned once at a 0.07 fee banks 6% of it.
    expect(tollFor(0.07, grind)).toBeCloseTo(0.0042, 9);
  });

  it("fee = 0 → all parts 0 (free-yoink case)", () => {
    for (const p of ALL_PARAMS) {
      const s = splitYoinkFee(0, p);
      expect(s).toEqual({ toBag: 0, toToll: 0, toRake: 0, toJackpot: 0, toDrain: 0 });
      expect(tollFor(0, p)).toBe(0);
      expect(bagAddFor(0, p)).toBe(0);
    }
  });

  it("unknown room id falls back to Arena params", () => {
    const arena = bagSplitParamsFor("arena");
    for (const bad of ["", "ARENA", "vault", "pit ", "unknown", "court2"]) {
      expect(bagSplitParamsFor(bad)).toEqual(arena);
    }
  });

  it("each tier's five bps fields sum to 10000", () => {
    for (const p of ALL_PARAMS) {
      expect(p.bagBps + p.tollBps + p.rakeBps + p.jackpotBps + p.drainBps).toBe(10_000);
    }
  });

  it("BAG_ESCROW_LIVE is false (settlement seam kept off)", () => {
    expect(BAG_ESCROW_LIVE).toBe(false);
  });
});

// ── Property 1 — Per-yoink conservation ───────────────────────────────────────

describe("Property 1: Per-yoink conservation", () => {
  it("split parts sum to the fee for all fee ≥ 0 and all tiers", () => {
    // Feature: bag-reign-toll, Property 1
    fc.assert(
      fc.property(feeArb, tierArb, (fee, p) => {
        const s = splitYoinkFee(fee, p);
        return Math.abs(sumSplit(s) - fee) <= LAMPORT;
      }),
      { numRuns: 200 },
    );
  });
});

// ── Property 2 — Toll is an exact fraction of the fee ─────────────────────────

describe("Property 2: Toll is an exact fraction of the fee", () => {
  it("tollFor(fee) === fee·tollBps/10000 and 0 ≤ tollFor ≤ fee", () => {
    // Feature: bag-reign-toll, Property 2
    fc.assert(
      fc.property(feeArb, tierArb, (fee, p) => {
        const toll = tollFor(fee, p);
        const expected = (fee * p.tollBps) / 10_000;
        return Math.abs(toll - expected) <= LAMPORT && toll >= 0 && toll <= fee + LAMPORT;
      }),
      { numRuns: 200 },
    );
  });
});

// ── Property 3 — Player-side share tier-invariant and unchanged ───────────────

describe("Property 3: Player-side share is tier-invariant and unchanged", () => {
  it("toBag + toToll === 0.83·fee for every tier (and 0 when fee === 0)", () => {
    // Feature: bag-reign-toll, Property 3
    fc.assert(
      fc.property(feeArb, tierArb, (fee, p) => {
        const s = splitYoinkFee(fee, p);
        const playerSide = s.toBag + s.toToll;
        const invariant = playerSideBps(p) === 8_300;
        const share = Math.abs(playerSide - 0.83 * fee) <= LAMPORT;
        const zeroAtZero = fee !== 0 || (s.toBag === 0 && s.toToll === 0);
        return invariant && share && zeroAtZero;
      }),
      { numRuns: 200 },
    );
  });
});

// ── Property 4 — House-side share preserved ───────────────────────────────────

describe("Property 4: House-side share is preserved", () => {
  it("rake+jackpot+drain === 0.17·fee, rake === 0.10·fee, jackpot === 0.05·fee", () => {
    // Feature: bag-reign-toll, Property 4
    fc.assert(
      fc.property(feeArb, tierArb, (fee, p) => {
        const s = splitYoinkFee(fee, p);
        const houseSide = s.toRake + s.toJackpot + s.toDrain;
        return (
          Math.abs(houseSide - 0.17 * fee) <= LAMPORT &&
          Math.abs(s.toRake - 0.1 * fee) <= LAMPORT &&
          Math.abs(s.toJackpot - 0.05 * fee) <= LAMPORT
        );
      }),
      { numRuns: 200 },
    );
  });
});

// ── Property 5 — Toll rate monotonic in tier ──────────────────────────────────

describe("Property 5: Toll rate is monotonic in tier", () => {
  it("τ(pit) < τ(grind) < τ(arena) < τ(court) and every bagBps > 0", () => {
    // Feature: bag-reign-toll, Property 5
    expect(TOLL_BPS_BY_ROOM.pit).toBeLessThan(TOLL_BPS_BY_ROOM.grind);
    expect(TOLL_BPS_BY_ROOM.grind).toBeLessThan(TOLL_BPS_BY_ROOM.arena);
    expect(TOLL_BPS_BY_ROOM.arena).toBeLessThan(TOLL_BPS_BY_ROOM.court);
    fc.assert(
      fc.property(tierArb, (p) => p.bagBps > 0),
      { numRuns: 100 },
    );
  });
});

// ── Property 6 — Settlement is zero-sum ───────────────────────────────────────

describe("Property 6: Settlement is zero-sum", () => {
  it("settleYoink deltas sum to 0 for all fee ≥ 0 and all tiers", () => {
    // Feature: bag-reign-toll, Property 6
    fc.assert(
      fc.property(feeArb, tierArb, (fee, p) => {
        const d = settleYoink(fee, p);
        const sum = d.payer + d.outgoingKing + d.bag + d.house + d.jackpot;
        return Math.abs(sum) <= LAMPORT;
      }),
      { numRuns: 200 },
    );
  });
});

// ── Property 7 — Closed-group collusion is strictly −EV ───────────────────────

describe("Property 7: Closed-group collusion is strictly −EV", () => {
  it("group net ≤ −0.12·ΣF < 0 for any sequence of internal yoinks", () => {
    // Feature: bag-reign-toll, Property 7
    fc.assert(
      fc.property(fc.array(posFeeArb, { minLength: 1, maxLength: 40 }), tierArb, (fees, p) => {
        // Model a closed group: the payer loses the whole fee; the toll and the
        // bag share stay inside the group (recovered); rake+jackpot+drain leave.
        let totalFees = 0;
        let groupNet = 0;
        for (const fee of fees) {
          const s = splitYoinkFee(fee, p);
          totalFees += fee;
          groupNet += -fee + s.toToll + s.toBag; // recovered = toll + bag
        }
        const floor = collusionFloor(totalFees, p); // ≤ totalFees·0.88
        const houseEdge = evHousePerYoink(p); // 0.12
        return (
          groupNet < 0 &&
          groupNet <= -houseEdge * totalFees + LAMPORT &&
          // recovered (toll+bag = 0.83·ΣF) never exceeds the collusion floor.
          groupNet + totalFees <= floor + LAMPORT
        );
      }),
      { numRuns: 200 },
    );
  });
});

// ── Property 8 — Free yoinks bank nothing ─────────────────────────────────────

describe("Property 8: Free yoinks bank nothing", () => {
  it("fee === 0 ⇒ toToll === 0 ∧ toBag === 0 for every tier", () => {
    // Feature: bag-reign-toll, Property 8
    fc.assert(
      fc.property(tierArb, (p) => {
        const s = splitYoinkFee(0, p);
        return s.toToll === 0 && s.toBag === 0;
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 9 — Non-negativity ───────────────────────────────────────────────

describe("Property 9: Non-negativity", () => {
  it("every part of YoinkSplit is ≥ 0 for any fee ≥ 0", () => {
    // Feature: bag-reign-toll, Property 9
    fc.assert(
      fc.property(feeArb, tierArb, (fee, p) => {
        const s = splitYoinkFee(fee, p);
        return s.toBag >= 0 && s.toToll >= 0 && s.toRake >= 0 && s.toJackpot >= 0 && s.toDrain >= 0;
      }),
      { numRuns: 200 },
    );
  });

  it("negative / non-finite fees clamp to all-zero parts", () => {
    const arena = bagSplitParamsFor("arena");
    for (const bad of [-1, -0.001, NaN, Infinity, -Infinity]) {
      const s = splitYoinkFee(bad, arena);
      expect(s).toEqual({ toBag: 0, toToll: 0, toRake: 0, toJackpot: 0, toDrain: 0 });
      expect(tollFor(bad, arena)).toBe(0);
      expect(bagAddFor(bad, arena)).toBe(0);
    }
  });
});
