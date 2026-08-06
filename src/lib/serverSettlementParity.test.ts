/**
 * SERVER ↔ CLIENT SETTLEMENT PARITY (executable, not textual).
 *
 * `serverEconomyParity.test.ts` proves the server's CONSTANTS match the client's.
 * This file proves the server's MATH does too — by extracting the Edge Function's
 * pure-math section, stripping its types with esbuild, evaluating it, and
 * property-testing every money function against the client implementation across
 * thousands of random inputs.
 *
 * Why bother when the functions "look identical"? Because a one-character
 * divergence in `toHouseOnFail` or a missing `Math.min` clamp in `computePrize`
 * would silently move real SOL, and no constants check would catch it. The Edge
 * Function is server-authoritative: it owns the seed, the roll and the
 * settlement. The client is only a view of its truth, so any divergence is
 * decided in the server's favour and against the user.
 *
 * The Edge Function cannot simply be imported — it targets Deno and pulls
 * `https://` specifiers Vitest cannot resolve — hence the extract-and-eval.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transformSync } from "esbuild";

import {
  TIER_PARAMS,
  STREAK_CFG,
  RISK_PROFILE_ORDER,
  feeMultiplierForStreak,
  computeFee,
  computePrize,
  resolveVaultParams,
  type RiskProfile,
  type TierParams,
} from "./siegeMath";
import { splitHouseRake, referralTierForAmount } from "./referral";
import { tierIndexForAmount, rollFromSeed, WAR_CONFIG } from "./walletWarsState";

// ── Extract the Edge Function's pure-math section and make it callable ────────

const EDGE_FN = readFileSync(
  resolve(__dirname, "../../supabase/functions/settle-siege/index.ts"),
  "utf8",
);

/**
 * Slice out everything from the constants block to just before the CORS section.
 * That range is self-contained pure math with no Deno/network dependencies.
 */
function extractPureMath(src: string): string {
  const start = src.indexOf("interface TierParams");
  const end = src.indexOf("// CORS");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("could not locate the pure-math section of settle-siege/index.ts");
  }
  // Trim the trailing banner comment that precedes the CORS marker.
  return src.slice(start, end).replace(/\/\/\s*═+\s*$/m, "");
}

interface ServerMath {
  tierIndexForAmount: (amount: number) => number;
  tierParamsFor: (amount: number) => TierParams;
  resolveVaultParams: (base: TierParams, profile: RiskProfile) => TierParams;
  vaultParamsFor: (amount: number, profile: RiskProfile) => TierParams;
  feeMultiplierForStreak: (streak: number) => number;
  computeFee: (corpus: number, params: TierParams, mult: number, repeatTaxMult: number) => {
    fee: number; baseFee: number; repeatTax: number; toDefenderOnFail: number; toHouseOnFail: number;
  };
  computePrize: (corpus: number, params: TierParams, mult: number) => {
    gross: number; toRaider: number; toHouse: number;
  };
  splitHouseRake: (
    houseRake: number, tier: string, hasReferrer: boolean, earnedSoFar: number, largestStake: number,
  ) => { referrerCut: number; houseKept: number };
  rollFromSeed: (seed: string) => number;
  TIER_PARAMS: readonly TierParams[];
  STREAK_STEP: number;
  STREAK_CAP: number;
  CORPUS_FLOOR: number;
}

/** Compile the extracted TS to JS and evaluate it into an isolated scope. */
function loadServerMath(): ServerMath {
  const ts = extractPureMath(EDGE_FN);
  const js = transformSync(ts, { loader: "ts", format: "cjs", target: "es2020" }).code;
  const factory = new Function(`
    ${js}
    return {
      tierIndexForAmount, tierParamsFor, resolveVaultParams, vaultParamsFor,
      feeMultiplierForStreak, computeFee, computePrize, splitHouseRake, rollFromSeed,
      TIER_PARAMS, STREAK_STEP, STREAK_CAP, CORPUS_FLOOR,
    };
  `);
  return factory() as ServerMath;
}

const S = loadServerMath();

// ── Generators ───────────────────────────────────────────────────────────────

const corpusArb = fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true });
const streakArb = fc.nat({ max: 200 });
const taxArb = fc.double({ min: 0, max: WAR_CONFIG.REPEAT_TAX_CAP, noNaN: true, noDefaultInfinity: true });
const tierIdxArb = fc.nat({ max: TIER_PARAMS.length - 1 });
const profileArb = fc.constantFrom<RiskProfile>(...RISK_PROFILE_ORDER);

/** Exact-equality helper with a float tolerance scaled to magnitude. */
function same(a: number, b: number, scale = 1): boolean {
  return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(scale), Math.abs(a), Math.abs(b));
}

describe("the extraction actually loaded the server code", () => {
  it("exposes the server's own constants", () => {
    expect(S.TIER_PARAMS).toHaveLength(TIER_PARAMS.length);
    expect(S.STREAK_STEP).toBe(STREAK_CFG.step);
    expect(S.STREAK_CAP).toBe(STREAK_CFG.cap);
    expect(S.CORPUS_FLOOR).toBe(WAR_CONFIG.CORPUS_FLOOR);
  });

  it("server TIER_PARAMS deep-equals client TIER_PARAMS", () => {
    expect(S.TIER_PARAMS).toEqual(TIER_PARAMS);
  });
});

describe("tier resolution parity", () => {
  it("tierIndexForAmount agrees on every amount, including tier boundaries", () => {
    for (const boundary of [0, 0.099, 0.1, 0.999, 1, 4.999, 5, 19.999, 20, 20.001, 1e6]) {
      expect(S.tierIndexForAmount(boundary), `amount ${boundary}`).toBe(tierIndexForAmount(boundary));
    }
    fc.assert(
      fc.property(corpusArb, (v) => S.tierIndexForAmount(v) === tierIndexForAmount(v)),
      { numRuns: 400 },
    );
  });

  it("tierParamsFor returns the identical params object", () => {
    fc.assert(
      fc.property(corpusArb, (v) => {
        expect(S.tierParamsFor(v)).toEqual(TIER_PARAMS[tierIndexForAmount(v)]);
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

describe("risk-profile resolution parity (Variable-Risk Vaults)", () => {
  it("resolveVaultParams matches for every tier × profile", () => {
    for (const base of TIER_PARAMS) {
      for (const profile of RISK_PROFILE_ORDER) {
        const a = S.resolveVaultParams(base, profile);
        const b = resolveVaultParams(base, profile);
        expect(a.id, `${base.id}/${profile} id`).toBe(b.id);
        expect(same(a.winChance, b.winChance), `${base.id}/${profile} p`).toBe(true);
        expect(same(a.feeRate, b.feeRate), `${base.id}/${profile} f`).toBe(true);
        expect(a.sliceRate).toBe(b.sliceRate);
        expect(a.houseFeeCut).toBe(b.houseFeeCut);
        expect(a.housePrizeRake).toBe(b.housePrizeRake);
      }
    }
  });

  it("vaultParamsFor matches across random amounts and profiles", () => {
    fc.assert(
      fc.property(corpusArb, profileArb, (v, profile) => {
        const a = S.vaultParamsFor(v, profile);
        const b = resolveVaultParams(TIER_PARAMS[tierIndexForAmount(v)], profile);
        return same(a.winChance, b.winChance) && same(a.feeRate, b.feeRate)
          && a.sliceRate === b.sliceRate && a.houseFeeCut === b.houseFeeCut
          && a.housePrizeRake === b.housePrizeRake;
      }),
      { numRuns: 400 },
    );
  });
});

describe("money math parity", () => {
  it("feeMultiplierForStreak matches, including past the cap", () => {
    fc.assert(
      fc.property(streakArb, (s) =>
        same(S.feeMultiplierForStreak(s), feeMultiplierForStreak(s, STREAK_CFG))),
      { numRuns: 300 },
    );
  });

  it("computeFee agrees on every field", () => {
    // A divergence in toDefenderOnFail / toHouseOnFail would silently reroute
    // real SOL between the defender and the house on every settled siege.
    fc.assert(
      fc.property(corpusArb, tierIdxArb, streakArb, taxArb, (V, ti, streak, tax) => {
        const params = TIER_PARAMS[ti];
        const mult = feeMultiplierForStreak(streak, STREAK_CFG);
        const a = S.computeFee(V, params, mult, tax);
        const b = computeFee(V, params, mult, tax);
        return same(a.fee, b.fee, V) && same(a.baseFee, b.baseFee, V)
          && same(a.repeatTax, b.repeatTax, V)
          && same(a.toDefenderOnFail, b.toDefenderOnFail, V)
          && same(a.toHouseOnFail, b.toHouseOnFail, V);
      }),
      { numRuns: 500 },
    );
  });

  it("computePrize agrees, including the slice ≤ corpus clamp", () => {
    // The Math.min(slice, corpus) clamp matters at high streaks; without it the
    // server could pay out more than the vault holds.
    fc.assert(
      fc.property(corpusArb, tierIdxArb, streakArb, (V, ti, streak) => {
        const params = TIER_PARAMS[ti];
        const mult = feeMultiplierForStreak(streak, STREAK_CFG);
        const a = S.computePrize(V, params, mult);
        const b = computePrize(V, params, mult);
        return same(a.gross, b.gross, V) && same(a.toRaider, b.toRaider, V)
          && same(a.toHouse, b.toHouse, V) && a.gross <= V + 1e-9;
      }),
      { numRuns: 500 },
    );
  });

  it("splitHouseRake agrees, and stays conservation-exact on the server", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        corpusArb,
        fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
        fc.boolean(),
        (houseRake, largestStake, earnedSoFar, hasReferrer) => {
          const tier = referralTierForAmount(largestStake);
          const a = S.splitHouseRake(houseRake, tier, hasReferrer, earnedSoFar, largestStake);
          const b = splitHouseRake({ houseRake, tier, hasReferrer, earnedSoFar, largestStake });
          // Same split as the client…
          const matches = same(a.referrerCut, b.referrerCut, houseRake)
            && same(a.houseKept, b.houseKept, houseRake);
          // …and the server never leaks or mints rake.
          const conserved = same(a.referrerCut + a.houseKept, Math.max(0, houseRake), houseRake);
          return matches && conserved;
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("provable-fairness parity", () => {
  it("rollFromSeed is bit-identical for arbitrary seeds", () => {
    // If the server's roll differs from the client's for even one seed, every
    // client-side verification of that siege is invalid.
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (seed) =>
        S.rollFromSeed(seed) === rollFromSeed(seed)),
      { numRuns: 800 },
    );
  });

  it("matches on the hex seeds the server actually generates", () => {
    for (let i = 0; i < 200; i++) {
      const seed = Array.from({ length: 16 }, () =>
        Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
      expect(S.rollFromSeed(seed)).toBe(rollFromSeed(seed));
    }
  });

  it("the win/loss decision agrees for every tier × profile", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 40 }), corpusArb, profileArb, (seed, V, profile) => {
        const p = S.vaultParamsFor(V, profile).winChance;
        const pc = resolveVaultParams(TIER_PARAMS[tierIndexForAmount(V)], profile).winChance;
        return (S.rollFromSeed(seed) < p) === (rollFromSeed(seed) < pc);
      }),
      { numRuns: 600 },
    );
  });
});

describe("full settlement parity end to end", () => {
  it("a complete settled siege produces identical per-actor deltas", () => {
    fc.assert(
      fc.property(corpusArb, profileArb, streakArb, taxArb, fc.string({ minLength: 1, maxLength: 32 }),
        (V, profile, streak, tax, seed) => {
          const clientParams = resolveVaultParams(TIER_PARAMS[tierIndexForAmount(V)], profile);
          const serverParams = S.vaultParamsFor(V, profile);
          const mult = feeMultiplierForStreak(streak, STREAK_CFG);

          const cFee = computeFee(V, clientParams, mult, tax);
          const sFee = S.computeFee(V, serverParams, mult, tax);
          const cPrize = computePrize(V, clientParams, mult);
          const sPrize = S.computePrize(V, serverParams, mult);

          const won = rollFromSeed(seed) < clientParams.winChance;

          // Raider / defender / house deltas, computed the same way both sides do.
          const cRaider = won ? -cFee.fee + cPrize.toRaider : -cFee.fee;
          const sRaider = won ? -sFee.fee + sPrize.toRaider : -sFee.fee;
          const cHouse = won ? cPrize.toHouse + cFee.toHouseOnFail : cFee.toHouseOnFail;
          const sHouse = won ? sPrize.toHouse + sFee.toHouseOnFail : sFee.toHouseOnFail;

          return same(cRaider, sRaider, V)
            && same(cFee.toDefenderOnFail, sFee.toDefenderOnFail, V)
            && same(cHouse, sHouse, V)
            && same(won ? cPrize.gross : 0, won ? sPrize.gross : 0, V);
        }),
      { numRuns: 600 },
    );
  });
});
