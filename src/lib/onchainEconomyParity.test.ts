/**
 * ON-CHAIN ↔ CLIENT ECONOMY PARITY GUARD.
 *
 * ## Why this file is the most important artifact in the Anchor rewrite
 *
 * The program this replaces implemented a *different game*: fixed 50/50 odds,
 * matched stakes, 15% rake. The client advertises tiered odds, fee-only risk, a
 * defender toll and ~6.5% rake. That divergence was invisible because nothing
 * compared the two — exactly like the `settle-siege` Edge Function, which shipped
 * a stale v1 economy and would have settled a 44.7%-hold King's Court while the
 * UI said 8.56%.
 *
 * Money math now lives in THREE places (client `siegeMath.ts`, the Supabase Edge
 * Function, and the Solana program). Each duplication is a place drift can hide,
 * so each gets a guard. This is the third.
 *
 * ## Method
 *
 * `economy.rs` is parsed as TEXT rather than executed. It cannot be imported by
 * Vitest, and text parsing has a real advantage for a constants mirror: the
 * assertions run against the literal source a reviewer reads.
 *
 * The Rust module additionally carries 22 of its own `rustc --test` unit tests
 * covering conservation, clamping, overflow and the crack frequency. This file
 * covers the one thing those cannot: agreement with the TypeScript client.
 *
 * If this fails, fix `economy.rs` to match `siegeMath.ts`. Do not relax it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  TIER_PARAMS,
  STREAK_CFG,
  RISK_PROFILE_ORDER,
  RISK_PROFILES,
  resolveVaultParams,
} from "./siegeMath";
import { TIERS } from "./walletWarsState";

const RUST = readFileSync(
  resolve(__dirname, "../../solana/programs/wallet-wars/src/economy.rs"),
  "utf8",
);

/** Strip Rust numeric underscores: `12_415_902` → `12415902`. */
const num = (s: string) => Number(s.replace(/_/g, ""));

/** Extract the `TIER_RATES` array entries in declaration order. */
function rustTierRates(): Array<{ slice: number; feeCut: number; prizeRake: number }> {
  const block = RUST.match(/pub const TIER_RATES[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!block) throw new Error("could not find TIER_RATES in economy.rs");
  const re = /TierRates\s*\{\s*slice_bps:\s*([\d_]+),\s*house_fee_cut_bps:\s*([\d_]+),\s*house_prize_rake_bps:\s*([\d_]+)\s*\}/g;
  const out: Array<{ slice: number; feeCut: number; prizeRake: number }> = [];
  for (const m of block[1].matchAll(re)) {
    out.push({ slice: num(m[1]), feeCut: num(m[2]), prizeRake: num(m[3]) });
  }
  return out;
}

/** Extract the `EFF` table as `[tier][profile] → { pPpm, fPpb }`. */
function rustEff(): Array<Array<{ pPpm: number; fPpb: number }>> {
  const block = RUST.match(/pub const EFF[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!block) throw new Error("could not find EFF in economy.rs");
  const re = /EffParams\s*\{\s*p_ppm:\s*([\d_]+),\s*f_ppb:\s*([\d_]+)\s*\}/g;
  const flat = [...block[1].matchAll(re)].map((m) => ({ pPpm: num(m[1]), fPpb: num(m[2]) }));
  if (flat.length !== 12) throw new Error(`expected 12 EFF entries, found ${flat.length}`);
  return [flat.slice(0, 3), flat.slice(3, 6), flat.slice(6, 9), flat.slice(9, 12)];
}

/** Read a `pub const NAME...= <number>;` scalar. */
function rustScalar(name: string): number {
  const m = RUST.match(new RegExp(`pub const ${name}[^=]*=\\s*([\\d_]+)`));
  if (!m) throw new Error(`could not find ${name} in economy.rs`);
  return num(m[1]);
}

const RATES = rustTierRates();
const EFF = rustEff();

describe("scales are what the guard assumes", () => {
  it("bps / ppm / ppb are the documented powers of ten", () => {
    expect(rustScalar("BPS")).toBe(10_000);
    expect(rustScalar("PPM")).toBe(1_000_000);
    expect(rustScalar("PPB")).toBe(1_000_000_000);
    expect(rustScalar("LAMPORTS_PER_SOL")).toBe(1_000_000_000);
  });
});

describe("base tier rates mirror siegeMath exactly", () => {
  it("has one entry per client tier, in the same order", () => {
    expect(RATES).toHaveLength(TIER_PARAMS.length);
  });

  it("slice / fee-cut / prize-rake match to the basis point", () => {
    TIER_PARAMS.forEach((p, i) => {
      expect(RATES[i].slice, `${p.id} sliceRate`).toBe(Math.round(p.sliceRate * 1e4));
      expect(RATES[i].feeCut, `${p.id} houseFeeCut`).toBe(Math.round(p.houseFeeCut * 1e4));
      expect(RATES[i].prizeRake, `${p.id} housePrizeRake`).toBe(Math.round(p.housePrizeRake * 1e4));
    });
  });

  it("every client rate is EXACTLY representable in bps (no silent rounding)", () => {
    // If a future tuning pass introduces e.g. sliceRate 0.15503, the bps mirror
    // would quietly truncate and the chain would pay a different prize than the
    // UI promises. Fail loudly instead.
    for (const p of TIER_PARAMS) {
      for (const [label, v] of Object.entries({
        sliceRate: p.sliceRate, houseFeeCut: p.houseFeeCut, housePrizeRake: p.housePrizeRake,
        feeRate: p.feeRate,
      })) {
        expect(Math.abs(v * 1e4 - Math.round(v * 1e4)), `${p.id}.${label} not exact in bps`)
          .toBeLessThan(1e-9);
      }
    }
  });
});

describe("the 12-combo effective table mirrors resolveVaultParams", () => {
  it("crack chance matches EXACTLY in ppm for every tier x profile", () => {
    // p drives the published odds and the settlement test. An off-by-one in ppm
    // is a real divergence between advertised and actual fairness.
    TIER_PARAMS.forEach((base, ti) => {
      RISK_PROFILE_ORDER.forEach((prof, pi) => {
        const client = resolveVaultParams(base, prof);
        expect(EFF[ti][pi].pPpm, `${base.id}/${prof} p`).toBe(Math.round(client.winChance * 1e6));
        // …and the client value must itself be exact in ppm.
        expect(Math.abs(client.winChance * 1e6 - Math.round(client.winChance * 1e6)))
          .toBeLessThan(1e-6);
      });
    });
  });

  it("effective fee matches within 1 part per billion", () => {
    // f' comes from a division so it is not exactly representable; the mirror is
    // rounded to the nearest ppb. On a 1000 SOL vault, 1 ppb is 1e-6 SOL.
    TIER_PARAMS.forEach((base, ti) => {
      RISK_PROFILE_ORDER.forEach((prof, pi) => {
        const client = resolveVaultParams(base, prof);
        expect(Math.abs(EFF[ti][pi].fPpb - client.feeRate * 1e9), `${base.id}/${prof} f`)
          .toBeLessThanOrEqual(1);
      });
    });
  });

  it("Standard is the exact base identity on-chain too", () => {
    const si = RISK_PROFILE_ORDER.indexOf("standard");
    expect(RISK_PROFILES.standard.oddsFactor).toBe(1.0);
    TIER_PARAMS.forEach((base, ti) => {
      expect(EFF[ti][si].pPpm, `${base.id} standard p`).toBe(Math.round(base.winChance * 1e6));
      expect(EFF[ti][si].fPpb, `${base.id} standard f`).toBe(Math.round(base.feeRate * 1e9));
    });
  });

  it("profile order is fortified, standard, exposed — matching the Rust enum", () => {
    // The Rust table is indexed by `RiskProfile as usize`, so a reordering on
    // either side would silently swap every vault's odds.
    expect([...RISK_PROFILE_ORDER]).toEqual(["fortified", "standard", "exposed"]);
    expect(RUST).toMatch(/Fortified = 0/);
    expect(RUST).toMatch(/Standard = 1/);
    expect(RUST).toMatch(/Exposed = 2/);
  });

  it("kappa values match the client's published risk factors", () => {
    expect(RISK_PROFILES.fortified.oddsFactor).toBe(0.6);
    expect(RISK_PROFILES.exposed.oddsFactor).toBe(1.5);
    // Derivable from the table itself: p_fortified / p_standard === 0.6.
    TIER_PARAMS.forEach((base, ti) => {
      const s = EFF[ti][1].pPpm;
      expect(EFF[ti][0].pPpm / s, `${base.id} fortified kappa`).toBeCloseTo(0.6, 9);
      expect(EFF[ti][2].pPpm / s, `${base.id} exposed kappa`).toBeCloseTo(1.5, 9);
    });
  });
});

describe("streak ramp mirrors STREAK_CFG", () => {
  it("step and cap match", () => {
    expect(rustScalar("STREAK_STEP_BPS")).toBe(Math.round(STREAK_CFG.step * 1e4));
    expect(rustScalar("STREAK_CAP")).toBe(STREAK_CFG.cap);
  });

  it("the capped multiplier is exactly 2.00x on both sides", () => {
    const rustMax = 10_000 + rustScalar("STREAK_STEP_BPS") * rustScalar("STREAK_CAP");
    expect(rustMax).toBe(20_000);
    expect(1 + STREAK_CFG.step * STREAK_CFG.cap).toBeCloseTo(2.0, 9);
  });
});

describe("tier floors mirror the client ladder", () => {
  it("floors match TIERS mins, in lamports", () => {
    const block = RUST.match(/pub const TIER_FLOORS[^=]*=\s*\[([\s\S]*?)\n\];/);
    expect(block, "TIER_FLOORS").not.toBeNull();
    // Expressed as arithmetic on LAMPORTS_PER_SOL, so assert the intent textually
    // and the values numerically via the documented ladder.
    expect(TIERS.map((t) => t.min)).toEqual([0.1, 1, 5, 20]);
    expect(block![1]).toMatch(/LAMPORTS_PER_SOL \/ 10/); // 0.1
    expect(block![1]).toMatch(/5 \* LAMPORTS_PER_SOL/);  // 5
    expect(block![1]).toMatch(/20 \* LAMPORTS_PER_SOL/); // 20
  });
});

describe("the old 50/50 economy is gone", () => {
  it("no fixed 50% win threshold remains", () => {
    // The replaced program had WIN_THRESHOLD = 5_000 (exactly 50%) and a flat
    // 15% rake. Their absence is the whole point of the rewrite.
    expect(RUST).not.toMatch(/WIN_THRESHOLD/);
    expect(RUST).not.toMatch(/HOUSE_RAKE_BPS/);
    expect(RUST).not.toMatch(/1_500.*15%/);
  });

  it("no tier carries the old 15% rake", () => {
    for (const r of RATES) {
      expect(r.feeCut, "house fee cut should be ~1-2%, not 1500bps").toBeLessThan(1_000);
      expect(r.prizeRake, "prize rake should be 500bps").toBeLessThan(1_000);
    }
  });
});

describe("the mirror warns the next editor", () => {
  it("names siegeMath.ts as the source of truth", () => {
    expect(RUST).toMatch(/siegeMath\.ts/);
  });

  it("documents the modulo bias in the VRF reduction", () => {
    // "Provably fair" invites exactly this scrutiny; the bound should be stated
    // in the source rather than discovered by an auditor.
    expect(RUST).toMatch(/MODULO BIAS/i);
  });
});
