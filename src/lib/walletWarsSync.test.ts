/**
 * Multi-tab coordination (Stash_Sync) tests.
 *
 * Feature: wallet-wars-launch-hardening
 *
 * Validates Requirement 6 (Multi-Tab Safety):
 *   - 6.1/6.4 — at most ONE tab holds a live lease at any instant, so only one
 *     tab ever persists authoritative state.
 *   - 6.2/6.5 — a follower adopting the leader's record converges on the
 *     leader's vault, so a newly opened tab loads the existing vault instead of
 *     reinitialising it.
 *   - 6.3 — adoption never invents or drops SOL: the house counters are
 *     monotonically non-decreasing, so a lagging tab can never rewind them.
 *
 * All helpers under test are pure and total, so the whole protocol is exercised
 * with fast-check property tests (≥100 runs) and no DOM.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  parseLease,
  isLeaseStale,
  isLeaseHeldBy,
  decideLeadership,
  canReleaseLease,
  nextLease,
  newTabId,
  parseSyncedWar,
  adoptRemoteWar,
  LEASE_TTL_MS,
  LEASE_RENEW_MS,
  type SyncedWar,
} from "./walletWarsSync";

const RUNS = { numRuns: 200 };

/** A plausible ms-epoch clock value. */
const arbAt = fc.integer({ min: 1_600_000_000_000, max: 1_900_000_000_000 });
const arbId = fc.string({ minLength: 1, maxLength: 12 }).map((s) => `tab-${s}`);

// ── Lease invariants ──────────────────────────────────────────────────────────

describe("Feature: wallet-wars-launch-hardening, Property 1: lease mutual exclusion (Req 6.1, 6.4)", () => {
  it("two distinct tabs can never both hold a live lease at the same instant", () => {
    fc.assert(
      fc.property(arbId, arbId, arbAt, arbAt, (idA, idB, at, writeAt) => {
        fc.pre(idA !== idB);
        // Whatever single record is in storage, at most one id can hold it.
        const lease = nextLease(idA, writeAt);
        const aHolds = isLeaseHeldBy(lease, idA, at);
        const bHolds = isLeaseHeldBy(lease, idB, at);
        expect(aHolds && bHolds).toBe(false);
      }),
      RUNS,
    );
  });

  it("a live lease is only ever held by its owner", () => {
    fc.assert(
      fc.property(arbId, arbId, arbAt, fc.integer({ min: 0, max: LEASE_TTL_MS - 1 }), (owner, other, writeAt, age) => {
        fc.pre(owner !== other);
        const lease = nextLease(owner, writeAt);
        expect(isLeaseHeldBy(lease, owner, writeAt + age)).toBe(true);
        expect(isLeaseHeldBy(lease, other, writeAt + age)).toBe(false);
      }),
      RUNS,
    );
  });
});

describe("Feature: wallet-wars-launch-hardening, Property 2: leases are always eventually reclaimable (Req 6.4)", () => {
  it("a lease that stops being renewed becomes claimable by any tab after the TTL", () => {
    fc.assert(
      fc.property(arbId, arbId, arbAt, fc.integer({ min: LEASE_TTL_MS, max: LEASE_TTL_MS * 50 }), (owner, other, writeAt, age) => {
        const lease = nextLease(owner, writeAt);
        expect(isLeaseStale(lease, writeAt + age)).toBe(true);
        // A dead leader never wedges the app — a visible tab takes over without
        // needing any user input.
        expect(decideLeadership({ lease, selfId: other, at: writeAt + age, hidden: false, forced: false }))
          .toBe("claim");
        expect(isLeaseHeldBy(lease, owner, writeAt + age)).toBe(false);
      }),
      RUNS,
    );
  });

  it("a healthy leader renewing on schedule always still holds its lease", () => {
    fc.assert(
      fc.property(arbId, arbAt, fc.integer({ min: 0, max: LEASE_RENEW_MS }), (owner, writeAt, drift) => {
        // Renewal happens every LEASE_RENEW_MS; even with a full interval of
        // extra drift the lease must still be live, or a healthy leader would be
        // mistaken for a dead one and two tabs would sim at once.
        const lease = nextLease(owner, writeAt);
        expect(isLeaseHeldBy(lease, owner, writeAt + LEASE_RENEW_MS + drift)).toBe(true);
      }),
      RUNS,
    );
  });

  it("keeps a safety margin between the renew interval and the lease TTL", () => {
    // Guards the invariant the property above depends on.
    expect(LEASE_RENEW_MS * 2).toBeLessThan(LEASE_TTL_MS);
  });
});

describe("Feature: wallet-wars-launch-hardening, Property 3: lease parsing is total (Req 6.4)", () => {
  it("never throws and never yields a bogus holder for arbitrary input", () => {
    fc.assert(
      fc.property(fc.string(), arbId, arbAt, (raw, selfId, at) => {
        const lease = parseLease(raw);
        // Unparseable input must read as "no lease" → freely claimable.
        if (lease === null) {
          expect(decideLeadership({ lease, selfId, at, hidden: false, forced: false })).toBe("claim");
          expect(isLeaseHeldBy(lease, selfId, at)).toBe(false);
        } else {
          expect(typeof lease.id).toBe("string");
          expect(lease.id.length).toBeGreaterThan(0);
          expect(Number.isFinite(lease.ts)).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it("round-trips a written lease", () => {
    fc.assert(
      fc.property(arbId, arbAt, (id, at) => {
        expect(parseLease(JSON.stringify(nextLease(id, at)))).toEqual({ id, ts: at });
      }),
      RUNS,
    );
  });

  it("rejects records missing or mistyping required fields", () => {
    expect(parseLease(null)).toBeNull();
    expect(parseLease("")).toBeNull();
    expect(parseLease("not json")).toBeNull();
    expect(parseLease("null")).toBeNull();
    expect(parseLease("[]")).toBeNull();
    expect(parseLease(JSON.stringify({ id: "", ts: 1 }))).toBeNull();
    expect(parseLease(JSON.stringify({ id: "a" }))).toBeNull();
    expect(parseLease(JSON.stringify({ id: "a", ts: "1" }))).toBeNull();
    expect(parseLease(JSON.stringify({ id: "a", ts: NaN }))).toBeNull();
  });

  it("mints distinct tab ids", () => {
    const ids = new Set(Array.from({ length: 200 }, newTabId));
    expect(ids.size).toBe(200);
  });
});

// ── Leadership decision ───────────────────────────────────────────────────────

describe("Feature: wallet-wars-launch-hardening, Property 7: the tab the user acts in always becomes the writer (Req 6.3, 6.4)", () => {
  it("a forced signal claims the lease no matter who holds it", () => {
    // This is the invariant a previous revision violated: a polite claim can
    // never take a live lease, so the first tab kept leadership forever and the
    // tab the user was actually clicking in discarded everything it did.
    fc.assert(
      fc.property(arbId, arbId, arbAt, arbAt, fc.boolean(), (self, other, writeAt, at, hidden) => {
        const heldByOther = nextLease(other, writeAt);
        expect(decideLeadership({ lease: heldByOther, selfId: self, at, hidden, forced: true })).toBe("claim");
        expect(decideLeadership({ lease: null, selfId: self, at, hidden, forced: true })).toBe("claim");
      }),
      RUNS,
    );
  });

  it("every player-action path ends with this tab holding the lease", () => {
    fc.assert(
      fc.property(arbId, arbId, arbAt, (self, other, at) => {
        fc.pre(self !== other);
        const intent = decideLeadership({
          lease: nextLease(other, at), selfId: self, at, hidden: false, forced: true,
        });
        expect(intent).not.toBe("stand_down");
        // Executing the intent means writing our own lease, which we then hold.
        expect(isLeaseHeldBy(nextLease(self, at), self, at)).toBe(true);
      }),
      RUNS,
    );
  });
});

describe("Feature: wallet-wars-launch-hardening, Property 8: a hidden tab never holds leadership (Req 6.3)", () => {
  it("stands down when hidden and unforced, even if it currently holds the lease", () => {
    // Otherwise a backgrounded leader keeps renewing while its sim is paused, and
    // the visible tab — gated on leadership — shows a vault that never earns.
    fc.assert(
      fc.property(arbId, arbAt, (self, at) => {
        expect(decideLeadership({ lease: nextLease(self, at), selfId: self, at, hidden: true, forced: false }))
          .toBe("stand_down");
      }),
      RUNS,
    );
  });

  it("lets a visible tab take over once the hidden leader's lease goes stale", () => {
    fc.assert(
      fc.property(arbId, arbId, arbAt, fc.integer({ min: LEASE_TTL_MS, max: LEASE_TTL_MS * 10 }), (self, other, writeAt, age) => {
        fc.pre(self !== other);
        const abandoned = nextLease(other, writeAt);
        expect(decideLeadership({ lease: abandoned, selfId: self, at: writeAt + age, hidden: false, forced: false }))
          .toBe("claim");
      }),
      RUNS,
    );
  });

  it("a healthy visible leader renews rather than re-claiming", () => {
    fc.assert(
      fc.property(arbId, arbAt, fc.integer({ min: 0, max: LEASE_RENEW_MS }), (self, writeAt, drift) => {
        expect(decideLeadership({
          lease: nextLease(self, writeAt), selfId: self, at: writeAt + drift, hidden: false, forced: false,
        })).toBe("renew");
      }),
      RUNS,
    );
  });

  it("a visible tab does not steal a live lease from another visible tab", () => {
    // Two side-by-side windows must not thrash; handover happens on focus, which
    // arrives as `forced`.
    fc.assert(
      fc.property(arbId, arbId, arbAt, fc.integer({ min: 0, max: LEASE_TTL_MS - 1 }), (self, other, writeAt, age) => {
        fc.pre(self !== other);
        expect(decideLeadership({
          lease: nextLease(other, writeAt), selfId: self, at: writeAt + age, hidden: false, forced: false,
        })).toBe("stand_down");
      }),
      RUNS,
    );
  });

  it("is total — always returns one of the three intents", () => {
    fc.assert(
      fc.property(
        fc.option(fc.record({ id: arbId, ts: arbAt }), { nil: null }),
        arbId, arbAt, fc.boolean(), fc.boolean(),
        (lease, selfId, at, hidden, forced) => {
          expect(["claim", "renew", "stand_down"]).toContain(
            decideLeadership({ lease, selfId, at, hidden, forced }),
          );
        },
      ),
      RUNS,
    );
  });
});

describe("Feature: wallet-wars-launch-hardening, Property 9: a tab only releases a lease it still owns (Req 6.4)", () => {
  it("never releases a lease owned by another tab", () => {
    // A tab that slept through its TTL and was taken over still believes it leads
    // until its next renew; releasing blindly on unload would clobber the live
    // record of the tab that legitimately took over.
    fc.assert(
      fc.property(arbId, arbId, arbAt, (self, other, at) => {
        fc.pre(self !== other);
        expect(canReleaseLease(nextLease(other, at), self)).toBe(false);
        expect(canReleaseLease(nextLease(self, at), self)).toBe(true);
        expect(canReleaseLease(null, self)).toBe(false);
      }),
      RUNS,
    );
  });
});

// ── State adoption invariants ─────────────────────────────────────────────────

interface FakeVault { id: string; amount: number }

const arbWar: fc.Arbitrary<SyncedWar<FakeVault>> = fc.record({
  you: fc.option(
    fc.record({ id: fc.string({ minLength: 1 }), amount: fc.double({ min: 0, max: 1e6, noNaN: true }) }),
    { nil: null },
  ),
  totalBanked: fc.double({ min: 0, max: 1e9, noNaN: true }),
  biggestHeist: fc.double({ min: 0, max: 1e6, noNaN: true }),
});

describe("Feature: wallet-wars-launch-hardening, Property 4: follower adoption converges on the leader's vault (Req 6.2, 6.5)", () => {
  it("always takes the leader's vault verbatim", () => {
    fc.assert(
      fc.property(arbWar, arbWar, (local, remote) => {
        expect(adoptRemoteWar(local, remote).you).toEqual(remote.you);
      }),
      RUNS,
    );
  });

  it("is idempotent — re-adopting the same record changes nothing", () => {
    fc.assert(
      fc.property(arbWar, arbWar, (local, remote) => {
        const once = adoptRemoteWar(local, remote);
        expect(adoptRemoteWar(once, remote)).toEqual(once);
      }),
      RUNS,
    );
  });

  it("propagates a cash-out performed in the leader tab", () => {
    // The regression this whole mechanism exists to prevent, in both directions:
    // a follower must neither resurrect a closed vault nor lose an open one.
    const open: SyncedWar<FakeVault> = { you: { id: "v1", amount: 5 }, totalBanked: 10, biggestHeist: 2 };
    const closed: SyncedWar<FakeVault> = { you: null, totalBanked: 15, biggestHeist: 2 };
    expect(adoptRemoteWar(open, closed).you).toBeNull();
    expect(adoptRemoteWar(closed, open).you).toEqual({ id: "v1", amount: 5 });
  });

  it("lets a freshly opened tab pick up an existing vault (Req 6.5)", () => {
    const fresh: SyncedWar<FakeVault> = { you: null, totalBanked: 1284.6, biggestHeist: 12.4 };
    const leader: SyncedWar<FakeVault> = { you: { id: "v9", amount: 3.25 }, totalBanked: 1300, biggestHeist: 14 };
    const out = adoptRemoteWar(fresh, leader);
    expect(out.you).toEqual({ id: "v9", amount: 3.25 });
    expect(out.totalBanked).toBe(1300);
    expect(out.biggestHeist).toBe(14);
  });
});

describe("Feature: wallet-wars-launch-hardening, Property 5: adoption never rewinds house counters (Req 6.3)", () => {
  it("keeps totalBanked and biggestHeist monotonically non-decreasing", () => {
    fc.assert(
      fc.property(arbWar, arbWar, (local, remote) => {
        const out = adoptRemoteWar(local, remote);
        expect(out.totalBanked).toBeGreaterThanOrEqual(local.totalBanked);
        expect(out.totalBanked).toBeGreaterThanOrEqual(remote.totalBanked);
        expect(out.biggestHeist).toBeGreaterThanOrEqual(local.biggestHeist);
        expect(out.biggestHeist).toBeGreaterThanOrEqual(remote.biggestHeist);
      }),
      RUNS,
    );
  });

  it("returns local state untouched when there is nothing to adopt", () => {
    fc.assert(
      fc.property(arbWar, (local) => {
        expect(adoptRemoteWar(local, null)).toEqual(local);
      }),
      RUNS,
    );
  });
});

describe("Feature: wallet-wars-launch-hardening, Property 6: synced-state parsing is total (Req 6.3)", () => {
  it("never throws on arbitrary input and always yields finite counters", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const out = parseSyncedWar<FakeVault>(raw);
        if (out !== null) {
          expect(Number.isFinite(out.totalBanked)).toBe(true);
          expect(Number.isFinite(out.biggestHeist)).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it("coerces malformed counters rather than propagating NaN into the economy", () => {
    const out = parseSyncedWar<FakeVault>(JSON.stringify({ you: null, totalBanked: "x", biggestHeist: null }));
    expect(out).toEqual({ you: null, totalBanked: 0, biggestHeist: 0 });
    expect(parseSyncedWar("nope")).toBeNull();
    expect(parseSyncedWar(null)).toBeNull();
    expect(parseSyncedWar("null")).toBeNull();
  });

  it("round-trips a persisted record", () => {
    const rec: SyncedWar<FakeVault> = { you: { id: "v1", amount: 2.5 }, totalBanked: 99.5, biggestHeist: 7.25 };
    expect(parseSyncedWar<FakeVault>(JSON.stringify(rec))).toEqual(rec);
  });
});
