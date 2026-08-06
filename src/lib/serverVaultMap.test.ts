/**
 * ServerVault → Vault mapping tests.
 *
 * The headline case is the Postgres `NUMERIC → string` coercion. `supabase-js`
 * returns NUMERIC columns as strings to preserve precision, so `amount` arrives
 * as `"1.000000000"`. TypeScript cannot catch it (the interface claims `number`),
 * and downstream `+` treats a string as CONCATENATION — so an un-coerced row
 * silently corrupts every money calculation instead of failing loudly. These
 * tests pin that behaviour, plus timestamp parsing and the rule that tier is
 * always re-derived locally rather than trusted from the wire.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  toNum,
  toEpochMs,
  toCount,
  serverVaultToVault,
  serverBoardToStashes,
  derivedTierId,
  tierDisagrees,
  effectiveRiskProfile,
} from "./serverVaultMap";
import { computeFee, vaultParamsFor, STREAK_CFG, feeMultiplierForStreak } from "./siegeMath";
import { tierIndexForAmount } from "./walletWarsState";

const NOW = 1_700_000_000_000;
const OWNER = "11111111-1111-1111-1111-111111111111";

/** A realistic row exactly as supabase-js returns it: NUMERICs are STRINGS. */
const PG_ROW = {
  id: "vault-1",
  wallet: "7xKpQw2ZNt6Y",
  amount: "5.000000000",
  banked: "0.123456789",
  fees_earned: "1.500000000",
  survived: 7,
  cracked: 1,
  streak: 3,
  opened_at: "2026-08-01T10:00:00.000Z",
  shield_until: "2026-08-01T10:00:06.000Z",
  tier: "arena",
  risk_profile: "exposed" as const,
  bounty_pool: "0.000000000",
  bounty_expiry: null,
  compound: false,
  owner_id: OWNER,
};

describe("toNum — the NUMERIC-as-string trap", () => {
  it("parses Postgres numeric strings", () => {
    expect(toNum("5.000000000")).toBe(5);
    expect(toNum("0.123456789")).toBe(0.123456789);
    expect(toNum("-2.5")).toBe(-2.5);
    expect(toNum("1e3")).toBe(1000);
  });

  it("passes finite numbers through untouched", () => {
    expect(toNum(5)).toBe(5);
    expect(toNum(0)).toBe(0);
  });

  it("falls back for every non-finite / missing / junk input", () => {
    for (const bad of [null, undefined, "", "   ", "abc", NaN, Infinity, -Infinity, {}, [], true]) {
      expect(toNum(bad, -1), String(bad)).toBe(-1);
    }
  });

  it("never returns a non-finite number", () => {
    fc.assert(
      fc.property(fc.anything(), (v) => Number.isFinite(toNum(v, 0))),
      { numRuns: 500 },
    );
  });
});

describe("toEpochMs", () => {
  it("parses ISO timestamptz into epoch millis", () => {
    expect(toEpochMs("2026-08-01T10:00:00.000Z")).toBe(Date.parse("2026-08-01T10:00:00.000Z"));
  });

  it("passes epoch numbers through", () => {
    expect(toEpochMs(NOW)).toBe(NOW);
  });

  it("falls back on null / empty / unparseable", () => {
    expect(toEpochMs(null, 42)).toBe(42);
    expect(toEpochMs("", 42)).toBe(42);
    expect(toEpochMs("not a date", 42)).toBe(42);
    expect(toEpochMs(undefined, 42)).toBe(42);
  });
});

describe("toCount", () => {
  it("floors to a non-negative integer", () => {
    expect(toCount("7")).toBe(7);
    expect(toCount(7.9)).toBe(7);
    expect(toCount(-3)).toBe(0);
    expect(toCount(null)).toBe(0);
    expect(toCount("abc")).toBe(0);
  });
});

describe("serverVaultToVault", () => {
  it("coerces every money field to a real number", () => {
    const v = serverVaultToVault(PG_ROW, OWNER, NOW);
    for (const key of ["amount", "banked", "feesEarned", "bountyPool"] as const) {
      expect(typeof v[key], key).toBe("number");
      expect(Number.isFinite(v[key]), key).toBe(true);
    }
    expect(v.amount).toBe(5);
    expect(v.banked).toBeCloseTo(0.123456789, 9);
  });

  it("produces a vault whose money math actually works", () => {
    // The regression this guards: with a string `amount`, feeRate * amount is
    // NaN-or-nonsense and the advertised fee becomes garbage.
    const v = serverVaultToVault(PG_ROW, OWNER, NOW);
    const params = vaultParamsFor(v.amount, v.riskProfile);
    const fee = computeFee(v.amount, params, feeMultiplierForStreak(v.streak, STREAK_CFG), 0);
    expect(Number.isFinite(fee.fee)).toBe(true);
    expect(fee.fee).toBeGreaterThan(0);
    expect(fee.toDefenderOnFail + fee.toHouseOnFail).toBeCloseTo(fee.fee, 12);
  });

  it("converts timestamps so shield checks work against Date.now()", () => {
    const v = serverVaultToVault(PG_ROW, OWNER, NOW);
    expect(v.openedAt).toBe(Date.parse(PG_ROW.opened_at));
    expect(v.shieldUntil).toBe(Date.parse(PG_ROW.shield_until));
    // A string shieldUntil would make every comparison meaningless.
    expect(typeof v.shieldUntil).toBe("number");
  });

  it("sets isYou only for the signed-in owner", () => {
    expect(serverVaultToVault(PG_ROW, OWNER, NOW).isYou).toBe(true);
    expect(serverVaultToVault(PG_ROW, "someone-else", NOW).isYou).toBe(false);
    // A guest (no session) must never own a board vault.
    expect(serverVaultToVault(PG_ROW, null, NOW).isYou).toBe(false);
  });

  it("prefers display_name but never renders blank", () => {
    expect(serverVaultToVault({ ...PG_ROW, display_name: "KingRat" }, OWNER, NOW).wallet).toBe("KingRat");
    expect(serverVaultToVault({ ...PG_ROW, display_name: "   " }, OWNER, NOW).wallet).toBe(PG_ROW.wallet);
    expect(serverVaultToVault({ ...PG_ROW, display_name: "x".repeat(99) }, OWNER, NOW).wallet.length)
      .toBeLessThanOrEqual(24);
    expect(serverVaultToVault({ amount: "1" }, null, NOW).wallet).toBe("Unknown");
  });

  it("defaults an invalid risk profile to Standard rather than trusting it", () => {
    // Silently accepting a bogus profile would advertise odds nobody published.
    const v = serverVaultToVault({ ...PG_ROW, risk_profile: "godmode" as never }, OWNER, NOW);
    expect(v.riskProfile).toBe("standard");
  });

  it("clamps negatives that slipped past the DB CHECK constraints", () => {
    const v = serverVaultToVault(
      { ...PG_ROW, amount: "-5", banked: "-1", fees_earned: "-2", bounty_pool: "-3", streak: -9 },
      OWNER, NOW,
    );
    expect(v.amount).toBe(0);
    expect(v.banked).toBe(0);
    expect(v.feesEarned).toBe(0);
    expect(v.bountyPool).toBe(0);
    expect(v.streak).toBe(0);
  });

  it("never throws on an arbitrarily malformed row", () => {
    // One bad row must not white-screen the board.
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.anything()), (row) => {
        expect(() => serverVaultToVault(row as never, OWNER, NOW)).not.toThrow();
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it("defaults seq to 0 when the board query omits it", () => {
    // seq drives optimistic concurrency; NaN here would break every comparison.
    const { ...noSeq } = PG_ROW;
    expect(serverVaultToVault(noSeq, OWNER, NOW).seq).toBe(0);
  });
});

describe("serverBoardToStashes", () => {
  it("maps a board and preserves order", () => {
    const rows = [
      { ...PG_ROW, id: "a", amount: "1" },
      { ...PG_ROW, id: "b", amount: "10" },
    ];
    const out = serverBoardToStashes(rows, OWNER, NOW);
    expect(out.map((v) => v.id)).toEqual(["a", "b"]);
  });

  it("drops unsiegeable zero/negative-corpus rows", () => {
    const rows = [
      { ...PG_ROW, id: "ok", amount: "1" },
      { ...PG_ROW, id: "zero", amount: "0" },
      { ...PG_ROW, id: "neg", amount: "-4" },
    ];
    expect(serverBoardToStashes(rows, OWNER, NOW).map((v) => v.id)).toEqual(["ok"]);
  });

  it("de-duplicates repeated ids", () => {
    const rows = [{ ...PG_ROW, id: "dup" }, { ...PG_ROW, id: "dup" }];
    expect(serverBoardToStashes(rows, OWNER, NOW)).toHaveLength(1);
  });

  it("returns [] for null / undefined / non-array", () => {
    expect(serverBoardToStashes(null, OWNER, NOW)).toEqual([]);
    expect(serverBoardToStashes(undefined, OWNER, NOW)).toEqual([]);
    expect(serverBoardToStashes({} as never, OWNER, NOW)).toEqual([]);
  });

  it("skips null entries inside the array", () => {
    const rows = [null, { ...PG_ROW, id: "ok" }, undefined] as never;
    expect(serverBoardToStashes(rows, OWNER, NOW).map((v) => v.id)).toEqual(["ok"]);
  });
});

describe("tier is derived locally, never trusted from the server", () => {
  it("derivedTierId matches the engine's own thresholds", () => {
    expect(derivedTierId(0.5)).toBe("pit");
    expect(derivedTierId(1)).toBe("grind");
    expect(derivedTierId(5)).toBe("arena");
    expect(derivedTierId(20)).toBe("court");
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }), (v) =>
        derivedTierId(v) === (["pit", "grind", "arena", "court"] as const)[tierIndexForAmount(v)]),
      { numRuns: 400 },
    );
  });

  it("flags a server tier that disagrees with the local derivation", () => {
    // Tier controls raid-up eligibility and the published odds, so a drifted
    // server trigger must be visible rather than silently authoritative.
    expect(tierDisagrees({ amount: "5", tier: "arena" })).toBe(false);
    expect(tierDisagrees({ amount: "5", tier: "pit" })).toBe(true);
    expect(tierDisagrees({ amount: "0.5", tier: "court" })).toBe(true);
    expect(tierDisagrees({ amount: "5" })).toBe(false); // absent → nothing to compare
  });

  it("effectiveRiskProfile validates the wire value", () => {
    expect(effectiveRiskProfile({ risk_profile: "fortified" })).toBe("fortified");
    expect(effectiveRiskProfile({ risk_profile: "nope" as never })).toBe("standard");
    expect(effectiveRiskProfile({})).toBe("standard");
  });
});
