/**
 * SERVER ↔ CLIENT ECONOMY PARITY GUARD.
 *
 * WHY THIS EXISTS: `supabase/functions/settle-siege/index.ts` hand-copies the
 * frozen economy constants from `siegeMath.ts` because a Deno Edge Function
 * cannot import from the Vite `src/` tree. Duplication of money math is a
 * standing hazard, and it has already bitten once: the Edge Function was authored
 * against the v1 economy and merged after the client had moved to v2, producing a
 * server that would have settled a 44.7%-hold King's Court while the UI
 * advertised 8.56%, and an Arena paying defenders exactly zero.
 *
 * That class of bug is worse than a balance error. The settlement response
 * publishes `p_win` for client-side verification, so a divergent server makes
 * `roll < p` disagree with the advertised odds — i.e. it breaks the provable
 * fairness claim that the entire product is built on, in a way any user can
 * demonstrate.
 *
 * HOW IT WORKS: the Edge Function is parsed as TEXT, not imported — it targets
 * Deno and pulls `https://` specifiers that Vitest cannot resolve. Text parsing
 * also means the test asserts against the literal source a reviewer reads, which
 * is exactly what we want for a constants mirror.
 *
 * If this test fails, fix the Edge Function to match `siegeMath.ts`. Do not
 * relax the assertions.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  TIER_PARAMS,
  STREAK_CFG,
  RISK_PROFILES,
  DEFAULT_RISK_PROFILE,
  type TierParams,
} from "./siegeMath";
import { REFERRAL_BPS, REFERRAL_CAP_MULTIPLE } from "./referral";
import { WAR_CONFIG, rollFromSeed } from "./walletWarsState";

const EDGE_FN_PATH = resolve(__dirname, "../../supabase/functions/settle-siege/index.ts");
const SRC = readFileSync(EDGE_FN_PATH, "utf8");

/** Extract a `const NAME... = { ... }` object literal body from the source. */
function objectBody(name: string): string {
  const re = new RegExp(`const\\s+${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\}`, "m");
  const m = SRC.match(re);
  if (!m) throw new Error(`could not find object literal "${name}" in settle-siege/index.ts`);
  return m[1];
}

/** Read a numeric field out of an extracted object body. */
function numField(body: string, key: string): number {
  const m = body.match(new RegExp(`\\b${key}\\s*:\\s*(-?[0-9.eE+]+)`));
  if (!m) throw new Error(`missing numeric field "${key}"`);
  return Number(m[1]);
}

/** Read a top-level `const NAME = <number>;` scalar. */
function scalar(name: string): number {
  const m = SRC.match(new RegExp(`const\\s+${name}\\s*=\\s*(-?[0-9.eE+x]+)\\s*;`));
  if (!m) throw new Error(`could not find scalar "${name}"`);
  return Number(m[1]);
}

/** Parse a server tier-params literal into the client's TierParams shape. */
function serverTier(name: string): TierParams {
  const body = objectBody(name);
  const idMatch = body.match(/id\s*:\s*"([a-z]+)"/);
  if (!idMatch) throw new Error(`missing id in ${name}`);
  return {
    id: idMatch[1] as TierParams["id"],
    feeRate: numField(body, "feeRate"),
    winChance: numField(body, "winChance"),
    sliceRate: numField(body, "sliceRate"),
    houseFeeCut: numField(body, "houseFeeCut"),
    housePrizeRake: numField(body, "housePrizeRake"),
  };
}

const SERVER_TIER_NAMES = ["PIT_PARAMS", "GRIND_PARAMS", "ARENA_PARAMS", "COURT_PARAMS"] as const;

describe("settle-siege mirrors the client tier economy EXACTLY", () => {
  it("every tier param matches siegeMath field-for-field", () => {
    expect(SERVER_TIER_NAMES).toHaveLength(TIER_PARAMS.length);
    SERVER_TIER_NAMES.forEach((name, i) => {
      const server = serverTier(name);
      const client = TIER_PARAMS[i];
      // Deep equality — catches a drifted value AND a renamed/reordered tier.
      expect(server, `${name} vs client TIER_PARAMS[${i}] (${client.id})`).toEqual(client);
    });
  });

  it("tier order is identical, so tierIndexForAmount resolves the same params", () => {
    const serverIds = SERVER_TIER_NAMES.map((n) => serverTier(n).id);
    expect(serverIds).toEqual(TIER_PARAMS.map((p) => p.id));
    expect(serverIds).toEqual(["pit", "grind", "arena", "court"]);
  });

  it("the server's TIER_PARAMS array is built in that same order", () => {
    // A correct set of constants assembled in the wrong order would still
    // mis-settle every siege.
    const arr = SRC.match(/const\s+TIER_PARAMS\s*:[^=]*=\s*\[([^\]]*)\]/);
    expect(arr, "server TIER_PARAMS array literal").not.toBeNull();
    const order = arr![1].split(",").map((s) => s.trim()).filter(Boolean);
    expect(order).toEqual([...SERVER_TIER_NAMES]);
  });
});

describe("settle-siege mirrors the streak ramp and risk profiles", () => {
  it("streak step and cap match STREAK_CFG", () => {
    expect(scalar("STREAK_STEP")).toBe(STREAK_CFG.step);
    expect(scalar("STREAK_CAP")).toBe(STREAK_CFG.cap);
  });

  it("risk-profile kappas match RISK_PROFILES", () => {
    const body = objectBody("RISK_KAPPA");
    for (const [id, spec] of Object.entries(RISK_PROFILES)) {
      expect(numField(body, id), `kappa for ${id}`).toBe(spec.oddsFactor);
    }
  });

  it("Standard kappa is exactly 1.0 on the server too", () => {
    // resolveVaultParams short-circuits on kappa === 1 as the base-tier identity.
    // If the server's Standard were 0.999, every Standard vault would re-price.
    expect(numField(objectBody("RISK_KAPPA"), DEFAULT_RISK_PROFILE)).toBe(1.0);
  });
});

describe("settle-siege mirrors the referral split", () => {
  it("referral bps match referral.ts for every tier", () => {
    const body = objectBody("REFERRAL_BPS");
    for (const [tier, bps] of Object.entries(REFERRAL_BPS)) {
      expect(numField(body, tier), `referral bps for ${tier}`).toBe(bps);
    }
  });

  it("the lifetime cap multiple matches", () => {
    expect(scalar("REFERRAL_CAP_MULTIPLE")).toBe(REFERRAL_CAP_MULTIPLE);
  });
});

describe("settle-siege mirrors engine safety rails", () => {
  it("corpus floor matches WAR_CONFIG", () => {
    expect(scalar("CORPUS_FLOOR")).toBe(WAR_CONFIG.CORPUS_FLOOR);
  });

  it("rollFromSeed uses the identical FNV-1a constants", () => {
    // Provable fairness depends on the server and client deriving the SAME roll
    // from the same seed. Any divergence here silently invalidates every
    // verification the client performs.
    const fn = SRC.match(/function\s+rollFromSeed[\s\S]*?\n\}/);
    expect(fn, "server rollFromSeed").not.toBeNull();
    const body = fn![0];
    expect(body).toContain("2166136261"); // FNV offset basis
    expect(body).toContain("16777619");   // FNV prime
    expect(body).toContain("0xffffffff"); // normalisation divisor
    expect(body).toContain("Math.imul");
    expect(body).toContain(">>> 0");
  });

  it("client rollFromSeed still produces values in [0,1) (sanity for the mirror)", () => {
    for (const seed of ["a", "deadbeef", "", "0".repeat(64)]) {
      const r = rollFromSeed(seed);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
});

describe("the mirror carries a warning for the next editor", () => {
  it("names siegeMath.ts as the source of truth", () => {
    // Cheap insurance: if someone rewrites this block they should still be told
    // the constants are a mirror, not an independent definition.
    expect(SRC).toMatch(/siegeMath\.ts/);
  });

  it("points at this test by name so a failure is self-explaining", () => {
    expect(SRC).toMatch(/serverEconomyParity/);
  });
});
