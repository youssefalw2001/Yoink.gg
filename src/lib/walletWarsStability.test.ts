/**
 * Wallet Wars — stability / defensive-hardening smoke tests.
 *
 * These do NOT assert any economy math (siegeMath formulas, tier params, EV are
 * untouched by the stability work). They assert only that the runtime path
 * cannot THROW:
 *   1. The full lifecycle openVault → siege (forced win AND forced loss) →
 *      withdraw → cash out settles without throwing and yields finite numbers.
 *   2. Loading a corrupt / legacy / malformed localStorage record never throws
 *      and always degrades to a safe value (null or a finite, schema-clean
 *      PersistedWar), so a bad blob can never white-screen the app on mount.
 *   3. `formatSol` is total — a single undefined/null/NaN/Infinity value (the
 *      classic `undefined.toLocaleString()` crash) never throws during render.
 */

import { describe, it, expect } from "vitest";
import {
  createInitialState,
  openVaultState,
  resolveSiege,
  withdrawBankedState,
  cashOutState,
  loadWarFromStorage,
  rollFromSeed,
  tierIndexForAmount,
  type WarState,
  type StorageLike,
} from "@/lib/walletWarsState";
import { formatSol } from "@/lib/utils";

const STORAGE_KEY = "yoink_walletwars_v4";
const LEGACY_STORAGE_KEY_V3 = "yoink_walletwars_v3";

/** An in-memory StorageLike seeded with arbitrary (possibly corrupt) values. */
function fakeStorage(init: Record<string, string>): StorageLike {
  const map = new Map<string, string>(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => { map.set(k, v); },
  };
}

/** Find a seed whose provably-fair roll falls on the chosen side of `pWin`. */
function seedForOutcome(win: boolean, pWin: number): string {
  for (let i = 0; i < 100_000; i++) {
    const seed = `seed-${i}`;
    const roll = rollFromSeed(seed);
    if ((roll < pWin) === win) return seed;
  }
  throw new Error("no seed found (should be unreachable)");
}

/** Build a deterministic state with an open player vault + a same-tier target. */
function stateWithTarget(at: number): { state: WarState; targetId: string } {
  let state = createInitialState();
  state = openVaultState(state, 0.25, "standard", at); // 0.25 SOL → The Pit (tier 0)
  const youTier = tierIndexForAmount(state.you!.amount);
  const target = state.stashes.find(
    (s) => tierIndexForAmount(s.amount) === youTier && at >= s.shieldUntil,
  );
  expect(target, "seeded board should contain a same-tier target").toBeTruthy();
  return { state, targetId: target!.id };
}

describe("Wallet Wars stability — siege lifecycle never throws", () => {
  it("drives openVault → siege (win) → withdraw → cash out with finite results", () => {
    const at = 1_000_000;
    const { state, targetId } = stateWithTarget(at);
    const pWin = 0.12; // pit published odds; only used to pick a winning seed

    let res!: ReturnType<typeof resolveSiege>;
    expect(() => {
      res = resolveSiege(state, targetId, { at, seed: seedForOutcome(true, pWin), taxMult: 0 });
    }).not.toThrow();

    expect(res.resolution.ok).toBe(true);
    if (res.resolution.ok) {
      expect(res.resolution.result.outcome).toBe("win");
      expect(Number.isFinite(res.resolution.result.seized)).toBe(true);
      expect(Number.isFinite(res.resolution.result.yourVaultAfter)).toBe(true);
    }

    const afterWithdraw = withdrawBankedState(res.state);
    const cashed = cashOutState(afterWithdraw.state);
    expect(Number.isFinite(cashed.amount)).toBe(true);
    expect(cashed.state.you).toBeNull();
  });

  it("drives a forced losing siege without throwing", () => {
    const at = 2_000_000;
    const { state, targetId } = stateWithTarget(at);

    let res!: ReturnType<typeof resolveSiege>;
    expect(() => {
      res = resolveSiege(state, targetId, { at, seed: seedForOutcome(false, 0.12), taxMult: 0 });
    }).not.toThrow();

    expect(res.resolution.ok).toBe(true);
    if (res.resolution.ok) {
      expect(res.resolution.result.outcome).toBe("loss");
      expect(Number.isFinite(res.resolution.result.lost)).toBe(true);
    }
    expect(Number.isFinite(cashOutState(res.state).amount)).toBe(true);
  });
});

describe("Wallet Wars stability — corrupt/legacy storage never throws on load", () => {
  const at = 5_000_000;

  it("returns null for a null storage (in-memory session)", () => {
    expect(() => loadWarFromStorage(null, at)).not.toThrow();
    expect(loadWarFromStorage(null, at)).toBeNull();
  });

  it("does not throw on a corrupt (non-JSON) v4 record", () => {
    const storage = fakeStorage({ [STORAGE_KEY]: "{ this is not json" });
    expect(() => loadWarFromStorage(storage, at)).not.toThrow();
    // No valid v4 and no v3 → seeded fallback (null).
    expect(loadWarFromStorage(storage, at)).toBeNull();
  });

  it("normalizes a v4 record full of wrong-typed / non-finite fields to finite values", () => {
    const storage = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({
        you: {
          id: 123,                // wrong type
          wallet: "",             // empty
          amount: "5",            // string
          banked: null,           // null
          streak: "lots",         // string
          shieldUntil: Infinity,  // serializes to null
          survived: -3,           // negative
          seq: 1.5,
          compound: "yes",        // wrong type
          bountyPool: undefined,  // dropped by JSON
        },
        totalBanked: "abc",       // not a number
        biggestHeist: NaN,        // serializes to null
      }),
    });

    let loaded!: ReturnType<typeof loadWarFromStorage>;
    expect(() => { loaded = loadWarFromStorage(storage, at); }).not.toThrow();
    expect(loaded).not.toBeNull();
    const you = loaded!.you!;
    for (const v of [
      you.amount, you.banked, you.streak, you.shieldUntil, you.survived,
      you.seq, you.bountyPool, you.bountyExpiry, you.openedAt,
      loaded!.totalBanked, loaded!.biggestHeist,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(you.amount).toBeGreaterThanOrEqual(0);
    expect(you.survived).toBeGreaterThanOrEqual(0);
    expect(typeof you.compound).toBe("boolean");
    expect(typeof you.wallet).toBe("string");
  });

  it("migrates a legacy v3 record to v4 without throwing and preserves balances", () => {
    const storage = fakeStorage({
      [LEGACY_STORAGE_KEY_V3]: JSON.stringify({
        you: { id: "old", wallet: "You", amount: 3, banked: 1, bounty: 0.5 },
        totalBanked: 100,
        biggestHeist: 5,
      }),
    });

    let loaded!: ReturnType<typeof loadWarFromStorage>;
    expect(() => { loaded = loadWarFromStorage(storage, at); }).not.toThrow();
    expect(loaded).not.toBeNull();
    expect(loaded!.you!.amount).toBe(3);
    expect(loaded!.you!.banked).toBe(1);
    expect(loaded!.totalBanked).toBe(100);
    // Migration writes the v4 record back under the new key.
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("does not throw on a corrupt v3 record or on a non-object root", () => {
    expect(() => loadWarFromStorage(fakeStorage({ [LEGACY_STORAGE_KEY_V3]: "<broken>" }), at)).not.toThrow();
    expect(() => loadWarFromStorage(fakeStorage({ [STORAGE_KEY]: "[]" }), at)).not.toThrow();
    expect(() => loadWarFromStorage(fakeStorage({ [STORAGE_KEY]: "42" }), at)).not.toThrow();
  });
});

describe("Wallet Wars stability — formatSol is total (never throws during render)", () => {
  it("coerces undefined / null / NaN / Infinity to a safe string instead of throwing", () => {
    const bad: unknown[] = [undefined, null, NaN, Infinity, -Infinity, "5", {}];
    for (const v of bad) {
      expect(() => formatSol(v as number)).not.toThrow();
      expect(typeof formatSol(v as number)).toBe("string");
    }
    // Non-finite inputs render as zero, not a crash.
    expect(formatSol(undefined as unknown as number, 2)).toBe("0.00");
    expect(formatSol(NaN, 3)).toBe("0.000");
    // Valid input still formats normally.
    expect(formatSol(1234.5, 2)).toBe("1,234.50");
  });
});
