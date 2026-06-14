/**
 * Persistence v3 → v4 migration tests (Task 4.1).
 *
 * Feature: wallet-wars-siege-economy
 *
 * Asserts:
 *   - A seeded legacy `yoink_walletwars_v3` blob maps to the v4 `Vault` shape
 *     with `streak`/`seq`/`bountyExpiry` reset, `compound` on, `openedAt = now`,
 *     `bountyPool` carried from the prior `bounty`, and the corpus `amount`,
 *     `banked`, house `totalBanked`, and `biggestHeist` preserved (Req 23.1–23.3).
 *   - A corrupt record and an absent/unavailable storage both fall back without
 *     throwing (Req 23.4, 23.5).
 */

import { describe, it, expect } from "vitest";
import {
  migrateV3ToV4,
  loadWarFromStorage,
  type StorageLike,
} from "./walletWarsState";

/** A tiny in-memory `StorageLike` so the loader can be exercised off-DOM. */
function memStorage(seed: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, v); },
  };
}

const NOW = 1_750_000_000_000;

describe("migrateV3ToV4 (Req 23.1–23.2)", () => {
  it("maps a legacy v3 Stash to the v4 Vault shape and preserves balances", () => {
    const v3 = {
      you: { id: "old-1", wallet: "You", amount: 7.5, banked: 1.25, bounty: 0.4, streak: 9, seq: 12 },
      totalBanked: 4321.5,
      biggestHeist: 33.3,
    };

    const out = migrateV3ToV4(v3, NOW);

    expect(out.you).not.toBeNull();
    // Preserved balances (23.2)
    expect(out.you!.amount).toBe(7.5);
    expect(out.you!.banked).toBe(1.25);
    expect(out.totalBanked).toBe(4321.5);
    expect(out.biggestHeist).toBe(33.3);
    // Reset / defaulted fields (23.1)
    expect(out.you!.streak).toBe(0);
    expect(out.you!.seq).toBe(0);
    expect(out.you!.bountyExpiry).toBe(0);
    expect(out.you!.compound).toBe(true);
    expect(out.you!.openedAt).toBe(NOW);
    // Prior bounty becomes the bounty pool
    expect(out.you!.bountyPool).toBe(0.4);
    expect(out.you!.isYou).toBe(true);
  });

  it("degrades malformed input to seeded defaults without a null you", () => {
    const out = migrateV3ToV4({ you: null }, NOW);
    expect(out.you).toBeNull();
    expect(Number.isFinite(out.totalBanked)).toBe(true);
    expect(Number.isFinite(out.biggestHeist)).toBe(true);
  });

  it("never produces NaN amounts from a partial vault", () => {
    const out = migrateV3ToV4({ you: { wallet: "You" } }, NOW);
    expect(out.you!.amount).toBe(0);
    expect(out.you!.banked).toBe(0);
    expect(out.you!.bountyPool).toBe(0);
  });
});

describe("loadWarFromStorage (Req 23.3–23.5)", () => {
  it("migrates a v3 record and writes it back under the v4 key", () => {
    const storage = memStorage({
      yoink_walletwars_v3: JSON.stringify({
        you: { wallet: "You", amount: 3, banked: 0.5, bounty: 0.2 },
        totalBanked: 100,
        biggestHeist: 5,
      }),
    });

    const loaded = loadWarFromStorage(storage, NOW);
    expect(loaded).not.toBeNull();
    expect(loaded!.you!.amount).toBe(3);
    expect(loaded!.you!.bountyPool).toBe(0.2);
    // Written back under v4 (23.3)
    expect(storage.map.has("yoink_walletwars_v4")).toBe(true);
    const writtenBack = JSON.parse(storage.map.get("yoink_walletwars_v4")!);
    expect(writtenBack.you.amount).toBe(3);
  });

  it("prefers an existing v4 record over a legacy v3 one", () => {
    const storage = memStorage({
      yoink_walletwars_v4: JSON.stringify({ you: { amount: 9, banked: 2 }, totalBanked: 1, biggestHeist: 1 }),
      yoink_walletwars_v3: JSON.stringify({ you: { amount: 999 }, totalBanked: 0, biggestHeist: 0 }),
    });
    const loaded = loadWarFromStorage(storage, NOW);
    expect(loaded!.you!.amount).toBe(9);
  });

  it("falls back (returns null) on a corrupt record without throwing (Req 23.4)", () => {
    const storage = memStorage({ yoink_walletwars_v4: "{not valid json", });
    expect(() => loadWarFromStorage(storage, NOW)).not.toThrow();
    expect(loadWarFromStorage(storage, NOW)).toBeNull();
  });

  it("runs without throwing when storage is unavailable (Req 23.5)", () => {
    expect(() => loadWarFromStorage(null, NOW)).not.toThrow();
    expect(loadWarFromStorage(null, NOW)).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(loadWarFromStorage(memStorage(), NOW)).toBeNull();
  });
});
