/**
 * Stable-identity tests.
 *
 * Guards the LORD-ANON fix: every guest must get a UNIQUE, STABLE referral
 * identity instead of the single shared literal `"anon"`.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  anonPlayerId,
  newAnonId,
  playerIdentity,
  linkAnonToWallet,
  recordedAnonLinks,
  ANON_ID_KEY,
  ANON_LINK_KEY,
} from "./identity";
import { referralCodeForWallet } from "./referral";

/** Minimal in-memory localStorage so these tests run in the node environment. */
function installStorage(): void {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

beforeEach(() => installStorage());

describe("newAnonId", () => {
  it("is lowercase hex and long enough to avoid collisions", () => {
    for (let i = 0; i < 50; i++) expect(newAnonId()).toMatch(/^[0-9a-f]{10}$/);
  });

  it("is unique across many draws", () => {
    const seen = new Set(Array.from({ length: 500 }, () => newAnonId()));
    expect(seen.size).toBe(500);
  });
});

describe("anonPlayerId", () => {
  it("is stable across calls within a browser", () => {
    const a = anonPlayerId();
    expect(anonPlayerId()).toBe(a);
    expect(anonPlayerId()).toBe(a);
  });

  it("persists to localStorage so it survives a reload", () => {
    const a = anonPlayerId();
    expect(localStorage.getItem(ANON_ID_KEY)).toBe(a);
    // A fresh "reload" reads the same value back.
    expect(anonPlayerId()).toBe(a);
  });

  it("differs between browsers (separate storage)", () => {
    const first = anonPlayerId();
    installStorage(); // simulate a different browser
    expect(anonPlayerId()).not.toBe(first);
  });

  it("replaces a corrupt stored id rather than trusting it", () => {
    localStorage.setItem(ANON_ID_KEY, "<script>bad</script>");
    expect(anonPlayerId()).toMatch(/^[0-9a-f]{10}$/);
  });
});

describe("playerIdentity", () => {
  it("prefers the connected wallet", () => {
    expect(playerIdentity("7xKpQw2ZNt6Y")).toBe("7xKpQw2ZNt6Y");
  });

  it("falls back to the stable anon id, never the literal 'anon'", () => {
    // This is the exact bug: wallet ?? "anon" made every guest identical.
    for (const empty of [null, undefined, ""]) {
      const id = playerIdentity(empty);
      expect(id).not.toBe("anon");
      expect(id).toBe(anonPlayerId());
    }
  });
});

describe("referral codes derived from identity", () => {
  it("no longer collapses guests onto LORD-ANON", () => {
    const guestA = referralCodeForWallet(playerIdentity(null));
    installStorage(); // a different guest, different browser
    const guestB = referralCodeForWallet(playerIdentity(null));
    expect(guestA).not.toBe("LORD-ANON");
    expect(guestB).not.toBe("LORD-ANON");
    expect(guestA).not.toBe(guestB);
  });

  it("a guest's code is stable across reloads", () => {
    const before = referralCodeForWallet(playerIdentity(null));
    expect(referralCodeForWallet(playerIdentity(null))).toBe(before);
  });
});

describe("linkAnonToWallet", () => {
  it("records the association exactly once", () => {
    expect(linkAnonToWallet("WALLET1")).toBe(true);
    expect(linkAnonToWallet("WALLET1")).toBe(false); // idempotent
    const links = recordedAnonLinks();
    expect(links).toHaveLength(1);
    expect(links[0].wallet).toBe("WALLET1");
    expect(links[0].anonId).toBe(anonPlayerId());
  });

  it("ignores an empty wallet", () => {
    expect(linkAnonToWallet("")).toBe(false);
    expect(recordedAnonLinks()).toHaveLength(0);
  });

  it("tolerates a corrupt link store", () => {
    localStorage.setItem(ANON_LINK_KEY, "{not json");
    expect(recordedAnonLinks()).toEqual([]);
    expect(linkAnonToWallet("WALLET2")).toBe(true);
  });

  it("bounds growth on a shared browser", () => {
    for (let i = 0; i < 40; i++) linkAnonToWallet(`W${i}`);
    expect(recordedAnonLinks().length).toBeLessThanOrEqual(25);
  });
});
