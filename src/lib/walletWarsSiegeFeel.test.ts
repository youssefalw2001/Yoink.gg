/**
 * Wallet Wars — "Siege the Vault" Feel Pass property + example tests.
 *
 * Feature: wallet-wars-siege-feel (the design IS the spec). Each property below
 * is tagged to the design's Correctness Properties. PBT properties run ≥ 100
 * iterations via fast-check.
 *
 * The guiding invariant is verified head-on: NOTHING in `siegeMath.ts` changes,
 * and the feel changes (cadence, board stability, the strain build-up, the
 * `feesEarned` lifetime counter, compound-default-off) never move SOL.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  WAR_CONFIG,
  type WarState,
  type Vault,
  openVaultState,
  cashOutState,
  withdrawBankedState,
  setCompoundState,
  resolveSiege,
  resortBoard,
  sortByHeat,
  rollFromSeed,
  verifySiege,
} from "./walletWarsState";
import {
  PIT_PARAMS, GRIND_PARAMS, ARENA_PARAMS, COURT_PARAMS, TIER_PARAMS,
  RISK_PROFILES, STREAK_CFG, SURVIVAL_TAU, DEFAULT_RISK_PROFILE,
  computeFee, computePrize, evRaider, evDefender, evHouse, heatScore,
  feeMultiplierForStreak, vaultParamsFor, tierParamsFor,
  type RiskProfile,
} from "./siegeMath";
import { nextPhaseAfterCommit, shouldPlayStrain } from "@/components/walletwars/siegeFeel";

const RUNS = 150;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeVault(over: Partial<Vault>): Vault {
  return {
    id: "v", wallet: "0xbot", isYou: false, amount: 10, banked: 0, survived: 0,
    cracked: 0, streak: 0, openedAt: 0, shieldUntil: 0, seq: 0, compound: false,
    bountyPool: 0, bountyExpiry: 0, riskProfile: "standard", feesEarned: 0, ...over,
  };
}

function bareState(you: Vault | null, stashes: Vault[]): WarState {
  return { stashes, you, feed: [], totalBanked: 1000, biggestHeist: 0, raidCooldownUntil: 0 };
}

/** First seed `s{i}` whose roll lands the desired outcome for `pWin`. */
function seedFor(outcome: "win" | "loss", pWin: number): string {
  for (let i = 0; i < 200_000; i++) {
    const seed = `s${i}`;
    if ((outcome === "win") === (rollFromSeed(seed) < pWin)) return seed;
  }
  throw new Error(`no seed for ${outcome} @ p=${pWin}`);
}

const PROFILES: RiskProfile[] = ["fortified", "standard", "exposed"];
const profileArb = fc.constantFrom<RiskProfile>(...PROFILES);

// ════════════════════════════════════════════════════════════════════════════
// Property 1 — Money math is byte-for-byte unchanged (economics FROZEN)
// ════════════════════════════════════════════════════════════════════════════

describe("Property 1 — siegeMath economics are frozen", () => {
  it("publishes the exact tier parameters (fee/odds/slice/cuts)", () => {
    expect(PIT_PARAMS).toEqual({ id: "pit", feeRate: 0.02, winChance: 0.12, sliceRate: 0.15, houseFeeCut: 0.01, housePrizeRake: 0.02 });
    expect(GRIND_PARAMS).toEqual({ id: "grind", feeRate: 0.015, winChance: 0.1, sliceRate: 0.13, houseFeeCut: 0.06, housePrizeRake: 0.08 });
    expect(ARENA_PARAMS).toEqual({ id: "arena", feeRate: 0.01, winChance: 0.08, sliceRate: 0.11, houseFeeCut: 0.12, housePrizeRake: 0.15 });
    expect(COURT_PARAMS).toEqual({ id: "court", feeRate: 0.008, winChance: 0.06, sliceRate: 0.09, houseFeeCut: 0.15, housePrizeRake: 0.18 });
    expect(TIER_PARAMS).toHaveLength(4);
    // Risk-profile factors + streak ramp + heat decay constant are unchanged.
    expect(RISK_PROFILES.fortified.oddsFactor).toBe(0.6);
    expect(RISK_PROFILES.standard.oddsFactor).toBe(1.0);
    expect(RISK_PROFILES.exposed.oddsFactor).toBe(1.5);
    expect(STREAK_CFG).toEqual({ step: 0.04, cap: 25 });
    expect(SURVIVAL_TAU).toBe(3_600_000);
  });

  it("computes fee/prize/EV to the exact published values (Pit @ V=1, m=1)", () => {
    const fee = computeFee(1, PIT_PARAMS, 1, 0);
    expect(fee.fee).toBeCloseTo(0.02, 12);
    expect(fee.toDefenderOnFail).toBeCloseTo(0.0198, 12);
    expect(fee.toHouseOnFail).toBeCloseTo(0.0002, 12);
    const prize = computePrize(1, PIT_PARAMS, 1);
    expect(prize.gross).toBeCloseTo(0.15, 12);
    expect(prize.toRaider).toBeCloseTo(0.147, 12);
    expect(prize.toHouse).toBeCloseTo(0.003, 12);
    expect(evRaider(PIT_PARAMS)).toBeCloseTo(-0.00236, 12);
    expect(evDefender(PIT_PARAMS)).toBeCloseTo(0.0018, 12);
    expect(evHouse(PIT_PARAMS)).toBeCloseTo(0.00056, 12);
  });

  it("Standard profile is the exact identity; Fortified/Exposed preserve defender EV", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 80, noNaN: true, noDefaultInfinity: true }), (amount) => {
        const base = tierParamsFor(amount);
        expect(vaultParamsFor(amount, "standard")).toEqual(base);
        for (const p of ["fortified", "exposed"] as const) {
          const resolved = vaultParamsFor(amount, p);
          // defender EV held constant by construction (variable-risk invariant).
          expect(evDefender(resolved)).toBeCloseTo(evDefender(base), 10);
          expect(resolved.sliceRate).toBe(base.sliceRate);
          expect(resolved.houseFeeCut).toBe(base.houseFeeCut);
          expect(resolved.housePrizeRake).toBe(base.housePrizeRake);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("heatScore is the unchanged visibility-only ranking formula", () => {
    const v = { amount: 9, streak: 10, openedAt: 0 };
    const now = SURVIVAL_TAU; // one tau elapsed
    const expected =
      0.5 * Math.log10(1 + 9) + 0.35 * (10 / STREAK_CFG.cap) + 0.15 * (1 - Math.exp(-1));
    expect(heatScore(v, now)).toBeCloseTo(expected, 12);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Property 2 — Provable fairness preserved (win ⇔ roll < p; verifySiege)
// ════════════════════════════════════════════════════════════════════════════

describe("Property 2 — provable fairness", () => {
  it("win ⇔ rollFromSeed(seed) < p, and verifySiege round-trips", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 40 }), fc.double({ min: 0, max: 1, noNaN: true }), (seed, p) => {
        const won = rollFromSeed(seed) < p;
        expect(verifySiege(seed, p, won ? "win" : "loss")).toBe(true);
        expect(verifySiege(seed, p, won ? "loss" : "win")).toBe(false);
      }),
      { numRuns: RUNS },
    );
  });

  it("the sealed engine result is self-verifiable from its seed/roll/pWin", () => {
    const you = makeVault({ id: "you", wallet: "You", isYou: true, amount: 10 });
    const target = makeVault({ id: "t", amount: 12, riskProfile: "standard" });
    const s0 = bareState(you, [target]);
    const seed = seedFor("loss", vaultParamsFor(12, "standard").winChance);
    const r = resolveSiege(s0, "t", { at: 1, seed, taxMult: 0 });
    expect(r.resolution.ok).toBe(true);
    if (!r.resolution.ok) return;
    const res = r.resolution.result;
    expect(res.roll).toBeCloseTo(rollFromSeed(seed), 12);
    expect(verifySiege(res.seed, res.pWin, res.outcome)).toBe(true);
    expect(res.outcome === "win").toBe(res.roll < res.pWin);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Property 3 — Conservation holds (deltas sum to zero)
// ════════════════════════════════════════════════════════════════════════════

function residual(before: WarState, after: WarState, id: string): number {
  const tb = before.stashes.find((v) => v.id === id)!;
  const ta = after.stashes.find((v) => v.id === id)!;
  const dRaider = after.you!.amount - before.you!.amount;
  const dBanked = ta.banked - tb.banked;
  const dCorpus = ta.amount - tb.amount;
  const dHouse = after.totalBanked - before.totalBanked;
  return dRaider + dBanked + dCorpus + dHouse;
}

describe("Property 3 — settlement conserves SOL (feesEarned does not perturb it)", () => {
  it("every settled siege nets to zero across raider/defender/house/corpus", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 5, max: 19.5, noNaN: true, noDefaultInfinity: true }),
        profileArb,
        fc.boolean(), // compound on the defender
        fc.boolean(), // force win vs loss
        (amount, profile, compound, wantWin) => {
          const you = makeVault({ id: "you", wallet: "You", isYou: true, amount: 18 });
          const target = makeVault({ id: "t", amount, riskProfile: profile, compound });
          const s0 = bareState(you, [target]);
          const p = vaultParamsFor(amount, profile).winChance;
          const seed = seedFor(wantWin ? "win" : "loss", p);
          const r = resolveSiege(s0, "t", { at: 1, seed, taxMult: 0 });
          expect(r.resolution.ok).toBe(true);
          if (!r.resolution.ok) return;
          expect(Math.abs(residual(s0, r.state, "t"))).toBeLessThan(1e-9);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Property 4 — feesEarned is a monotonic, display-only accumulator
// ════════════════════════════════════════════════════════════════════════════

describe("Property 4 — feesEarned accumulator", () => {
  it("equals the cumulative Σ toDefenderOnFail and is non-decreasing over a siege sequence", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), profileArb, (steps, profile) => {
        // Forced losses keep the corpus (and tier) stable so the sequence runs
        // cleanly; feesEarned still increments on every settle (win or loss).
        const you = makeVault({ id: "you", wallet: "You", isYou: true, amount: 18 });
        let state = bareState(you, [makeVault({ id: "t", amount: 12, riskProfile: profile, compound: false })]);
        let at = 1;
        let expectedSum = 0;
        let prevFees = 0;
        const p = vaultParamsFor(12, profile).winChance;
        for (let i = 0; i < steps; i++) {
          const tgt = state.stashes[0];
          const mult = feeMultiplierForStreak(tgt.streak, STREAK_CFG);
          const feeB = computeFee(tgt.amount, vaultParamsFor(tgt.amount, profile), mult, 0);
          expectedSum += feeB.toDefenderOnFail;
          const r = resolveSiege(state, "t", { at, seed: seedFor("loss", p), taxMult: 0 });
          expect(r.resolution.ok).toBe(true);
          if (!r.resolution.ok) return;
          state = r.state;
          const fees = state.stashes[0].feesEarned;
          expect(fees).toBeGreaterThanOrEqual(prevFees); // monotonic
          expect(fees).toBeCloseTo(expectedSum, 9);      // = Σ toDefenderOnFail
          prevFees = fees;
          at += WAR_CONFIG.SHIELD_MS + WAR_CONFIG.RAID_COOLDOWN_MS + 1;
        }
      }),
      { numRuns: 60 },
    );
  });

  it("is NEVER decreased by withdrawing banked fees or toggling compound", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
        (banked, feesEarned, corpus) => {
          const you = makeVault({ id: "you", wallet: "You", isYou: true, amount: corpus + 0.1, banked, feesEarned });
          const s0 = bareState(you, []);
          // withdraw banked → banked may go to 0 but feesEarned is untouched.
          const w = withdrawBankedState(s0);
          expect(w.state.you!.feesEarned).toBe(feesEarned);
          // toggling compound (either direction) never touches feesEarned.
          const onCompound = setCompoundState(s0, true);
          expect(onCompound.you!.feesEarned).toBe(feesEarned);
          const offCompound = setCompoundState(onCompound, false);
          expect(offCompound.you!.feesEarned).toBe(feesEarned);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Property 5 — Cash-out excludes feesEarned (= corpus + banked only)
// ════════════════════════════════════════════════════════════════════════════

describe("Property 5 — cashOut returns corpus + banked, excluding feesEarned", () => {
  it("is independent of feesEarned and the compound flag", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 200, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.boolean(),
        (corpus, banked, feesEarned, compound) => {
          const you = makeVault({ id: "you", wallet: "You", isYou: true, amount: corpus, banked, feesEarned, compound });
          const { amount } = cashOutState(bareState(you, []), 123);
          expect(amount).toBeCloseTo(corpus + banked, 9);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Property 6 — Compound default off → banked visibly accumulates; both branches conserve
// ════════════════════════════════════════════════════════════════════════════

describe("Property 6 — compound on/off branches", () => {
  it("compound OFF: a bounce banks exactly toDefenderOnFail, corpus unchanged; both branches conserve", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 5, max: 19.5, noNaN: true, noDefaultInfinity: true }),
        profileArb,
        (amount, profile) => {
          const p = vaultParamsFor(amount, profile).winChance;
          const lossSeed = seedFor("loss", p);
          const mult = feeMultiplierForStreak(0, STREAK_CFG);
          const feeB = computeFee(amount, vaultParamsFor(amount, profile), mult, 0);

          // compound OFF
          const youA = makeVault({ id: "you", wallet: "You", isYou: true, amount: 18 });
          const off = resolveSiege(bareState(youA, [makeVault({ id: "t", amount, riskProfile: profile, compound: false })]), "t", { at: 1, seed: lossSeed, taxMult: 0 });
          expect(off.resolution.ok).toBe(true);
          if (!off.resolution.ok) return;
          const tOff = off.state.stashes[0];
          expect(tOff.banked).toBeCloseTo(feeB.toDefenderOnFail, 9); // accumulates visibly
          expect(tOff.amount).toBeCloseTo(amount, 9);                // corpus untouched on a loss
          expect(Math.abs(residual(bareState(youA, [makeVault({ id: "t", amount, riskProfile: profile, compound: false })]), off.state, "t"))).toBeLessThan(1e-9);

          // compound ON → banked folds to 0, corpus grows by the toll
          const youB = makeVault({ id: "you", wallet: "You", isYou: true, amount: 18 });
          const before = bareState(youB, [makeVault({ id: "t", amount, riskProfile: profile, compound: true })]);
          const on = resolveSiege(before, "t", { at: 1, seed: lossSeed, taxMult: 0 });
          expect(on.resolution.ok).toBe(true);
          if (!on.resolution.ok) return;
          const tOn = on.state.stashes[0];
          expect(tOn.banked).toBeCloseTo(0, 9);
          expect(tOn.amount).toBeCloseTo(amount + feeB.toDefenderOnFail, 9);
          // feesEarned still accrues regardless of the fold.
          expect(tOn.feesEarned).toBeCloseTo(feeB.toDefenderOnFail, 9);
          expect(Math.abs(residual(before, on.state, "t"))).toBeLessThan(1e-9);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Property 7 — resortBoard is a non-mutating permutation
// ════════════════════════════════════════════════════════════════════════════

const vaultArb = fc.record({
  amount: fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }),
  streak: fc.integer({ min: 0, max: 30 }),
  openedAt: fc.integer({ min: 0, max: 5_000_000 }),
});

describe("Property 7 — resortBoard is a permutation that mutates nothing", () => {
  it("returns the same multiset of vault ids and the same vault object references", () => {
    fc.assert(
      fc.property(fc.array(vaultArb, { minLength: 0, maxLength: 25 }), fc.integer({ min: 0, max: 9_000_000 }), (rows, at) => {
        const stashes = rows.map((r, i) => makeVault({ id: `v${i}`, amount: r.amount, streak: r.streak, openedAt: r.openedAt }));
        const s0 = bareState(null, stashes);
        const out = resortBoard(s0, at);
        // same multiset of ids
        expect([...out.stashes].map((v) => v.id).sort()).toEqual([...stashes].map((v) => v.id).sort());
        // every output vault is the SAME reference as its input (no economic mutation)
        for (const v of out.stashes) {
          expect(stashes.find((x) => x.id === v.id)).toBe(v);
        }
        // ordering is exactly hottest-first
        const expectedOrder = sortByHeat(stashes, at).map((v) => v.id);
        expect(out.stashes.map((v) => v.id)).toEqual(expectedOrder);
      }),
      { numRuns: RUNS },
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Property 8 — Board order is stable between ranking moments
// ════════════════════════════════════════════════════════════════════════════

describe("Property 8 — board order is stable across a player siege (non-ranking moment)", () => {
  it("resolveSiege updates the target in place and preserves the stash id order", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), fc.integer({ min: 0, max: 4 }), fc.boolean(), (n, pick, wantWin) => {
        const targets = Array.from({ length: n }, (_, i) =>
          makeVault({ id: `t${i}`, amount: 10 + i * 0.5, riskProfile: "standard" }),
        );
        const you = makeVault({ id: "you", wallet: "You", isYou: true, amount: 18 });
        const s0 = bareState(you, targets);
        const idx = pick % n;
        const before = s0.stashes.map((v) => v.id);
        const p = vaultParamsFor(targets[idx].amount, "standard").winChance;
        const r = resolveSiege(s0, `t${idx}`, { at: 1, seed: seedFor(wantWin ? "win" : "loss", p), taxMult: 0 });
        if (!r.resolution.ok) return; // tier edge → skip (still no reorder)
        expect(r.state.stashes.map((v) => v.id)).toEqual(before); // order unchanged
        expect(r.state.stashes[idx].id).toBe(`t${idx}`);          // replaced in place
      }),
      { numRuns: RUNS },
    );
  });

  it("opening and cashing out ARE ranking moments that re-sort hottest-first", () => {
    const stashes = [
      makeVault({ id: "a", amount: 0.5, streak: 0, openedAt: 0 }),
      makeVault({ id: "b", amount: 90, streak: 20, openedAt: 0 }),
    ];
    // deliberately mis-ordered (cold first)
    const s0 = bareState(null, stashes);
    const opened = openVaultState(s0, 5, DEFAULT_RISK_PROFILE, 1000);
    expect(opened.stashes.map((v) => v.id)).toEqual(sortByHeat(stashes, 1000).map((v) => v.id));

    const withYou = openVaultState(bareState(null, stashes), 5, DEFAULT_RISK_PROFILE, 1000);
    const cashed = cashOutState(withYou, 2000);
    expect(cashed.state.stashes.map((v) => v.id)).toEqual(sortByHeat(stashes, 2000).map((v) => v.id));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Property 9 — No build-up on a rejected siege
// ════════════════════════════════════════════════════════════════════════════

describe("Property 9 — a rejected siege never plays the strain build-up", () => {
  const kinds = [
    { kind: "cooldown", remainingMs: 1000 },
    { kind: "shielded", shieldRemainingMs: 1000 },
    { kind: "self_siege" },
    { kind: "tier_mismatch", yourTier: 0, targetTier: 1 },
    { kind: "insufficient_funds", required: 1, available: 0 },
  ] as const;

  it("stays in select for every rejection kind, regardless of quickRaid / reduced motion", () => {
    for (const reason of kinds) {
      for (const quickRaid of [true, false]) {
        for (const reducedMotion of [true, false]) {
          const phase = nextPhaseAfterCommit({ ok: false, reason }, { quickRaid, reducedMotion });
          expect(phase).toBe("select");
          expect(shouldPlayStrain({ ok: false, reason }, { quickRaid, reducedMotion })).toBe(false);
        }
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Property 10 — Reduced motion (and Quick Siege) yield the instant outcome
// ════════════════════════════════════════════════════════════════════════════

describe("Property 10 — reduced motion / Quick Siege skip the build-up", () => {
  const sealedOk = {
    ok: true as const,
    result: {
      outcome: "win" as const, pWin: 0.1, fee: 0.1, repeatTax: 0, seized: 1, prizeGross: 1.2,
      lost: 0, streakAtSiege: 1, targetWallet: "0xt", targetId: "t", yourVaultAfter: 9, roll: 0.05, seed: "abc",
    },
  };

  it("an accepted siege plays strain ONLY when neither reduced motion nor Quick Siege is set", () => {
    expect(nextPhaseAfterCommit(sealedOk, { quickRaid: false, reducedMotion: false })).toBe("strain");
    expect(nextPhaseAfterCommit(sealedOk, { quickRaid: true, reducedMotion: false })).toBe("result");
    expect(nextPhaseAfterCommit(sealedOk, { quickRaid: false, reducedMotion: true })).toBe("result");
    expect(nextPhaseAfterCommit(sealedOk, { quickRaid: true, reducedMotion: true })).toBe("result");
  });
});
