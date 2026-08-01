/**
 * YOINK.GG — Wallet Wars · multi-tab coordination (Stash_Sync)
 *
 * PROBLEM (launch-hardening Requirement 6): every open tab runs its own bot
 * simulation and persists Wallet Wars state to the SAME `localStorage` key. With
 * independent writers the last tab to write wins, which can silently erase the
 * player's open vault — real, unrecoverable progress loss.
 *
 * SOLUTION: a single-writer LEASE. Exactly one tab holds leadership at a time:
 *   - The LEADER runs the `you`-mutating simulation and is the only tab that
 *     persists authoritative state.
 *   - FOLLOWERS keep simulating their own ambient board (so the UI still feels
 *     alive) but never mutate or persist the player's vault. They adopt the
 *     leader's vault from `storage` events instead.
 *   - Leadership follows THE USER. Mount, window focus and every player action
 *     are `forced` signals that take the lease outright (see `decideLeadership`),
 *     because only one tab can be focused or clicked at a time. Without this the
 *     first tab would keep the lease forever and the tab the user is actually
 *     using would discard everything they did.
 *   - A hidden tab STANDS DOWN rather than renewing, so a backgrounded leader
 *     cannot freeze the vault of the tab the user is watching.
 *   - A lease is reclaimable once STALE, so closing or crashing the leader tab
 *     never wedges the app — the next tab takes over within `LEASE_TTL_MS`.
 *
 * This module is PURE, TOTAL and side-effect free: it reads no clock, no
 * storage, and no DOM. Every decision takes an injected `at` timestamp and
 * returns a value, which makes the whole coordination protocol property-testable
 * without a browser. The stateful wiring lives in `useWalletWars`.
 *
 * It is deliberately generic over the vault type so it never imports from
 * `walletWarsState.ts` (which imports this module) — no cycles, and no economy
 * coupling. NOTHING here computes or moves SOL.
 */

// ── Lease ─────────────────────────────────────────────────────────────────────

/** A leadership lease: which tab holds it, and when it was last renewed. */
export interface Lease {
  /** Opaque per-tab identifier. */
  id: string;
  /** ms epoch of the last claim/renewal. */
  ts: number;
}

/**
 * How long a lease stays valid without renewal. A leader that stops renewing
 * (tab closed, crashed, or suspended) has its lease considered stale after this,
 * letting another tab take over. Must be comfortably larger than the renew
 * interval so a healthy leader is never mistaken for a dead one.
 */
export const LEASE_TTL_MS = 9_000;

/** How often a healthy leader renews its lease. */
export const LEASE_RENEW_MS = 3_000;

/** `localStorage` key holding the current lease. */
export const LEASE_KEY = "yoink_ww_leader_v1";

/**
 * Parse a persisted lease. TOTAL: any malformed / partial / non-JSON input
 * yields `null` (treated as "no lease", i.e. freely claimable) rather than
 * throwing.
 */
export function parseLease(raw: string | null): Lease | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const rec = JSON.parse(raw) as unknown;
    if (!rec || typeof rec !== "object") return null;
    const { id, ts } = rec as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0) return null;
    if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
    return { id, ts };
  } catch {
    return null;
  }
}

/**
 * True iff `lease` is absent or has not been renewed within `ttl`. A stale lease
 * is reclaimable by any tab. Total for all inputs; a non-finite `ttl` or `at`
 * degrades to "stale" so the app can always make progress.
 */
export function isLeaseStale(lease: Lease | null, at: number, ttl: number = LEASE_TTL_MS): boolean {
  if (!lease) return true;
  if (!Number.isFinite(at) || !Number.isFinite(ttl)) return true;
  return at - lease.ts >= ttl;
}

/**
 * True iff `selfId` currently holds a live (non-stale) lease. This is the single
 * predicate the hook uses to decide "am I allowed to mutate and persist the
 * player's vault?".
 */
export function isLeaseHeldBy(
  lease: Lease | null,
  selfId: string,
  at: number,
  ttl: number = LEASE_TTL_MS,
): boolean {
  if (!lease) return false;
  return lease.id === selfId && !isLeaseStale(lease, at, ttl);
}

/** The lease record `selfId` writes when claiming or renewing at `at`. */
export function nextLease(selfId: string, at: number): Lease {
  return { id: selfId, ts: at };
}

// ── Leadership decision ───────────────────────────────────────────────────────

/**
 * What a tab should do with the lease right now.
 *   `claim`      — write our id and become/stay the authoritative writer.
 *   `renew`      — we already hold it; refresh the timestamp.
 *   `stand_down` — another tab is authoritative (or we are hidden); do not write.
 */
export type LeadershipIntent = "claim" | "renew" | "stand_down";

export interface LeadershipInput {
  /** The lease currently in storage. */
  lease: Lease | null;
  selfId: string;
  at: number;
  /** `document.hidden` — a backgrounded tab must not hold leadership. */
  hidden: boolean;
  /**
   * True when an explicit user signal drives this decision: mount, window focus,
   * or a player action. Only ONE tab can be focused or receive a click, so a
   * forced claim is safe — it is the mechanism that makes leadership follow the
   * user rather than stranding them in a tab whose writes are discarded.
   */
  forced: boolean;
  ttl?: number;
}

/**
 * Decide this tab's leadership intent. PURE and TOTAL — the hook does nothing but
 * execute the returned intent, which is what makes the whole protocol testable
 * without a browser.
 *
 * The rule the rest of the system depends on: **the tab the user is interacting
 * with is the writer.** An earlier revision only ever claimed a free or stale
 * lease, which meant the first tab kept leadership forever and a second tab
 * silently accepted vault opens, sieges and cash-outs that were never persisted.
 * A forced signal therefore takes the lease outright.
 *
 * Unforced, a hidden tab stands down instead of renewing. That is deliberate: it
 * lets its lease go stale so a visible tab can pick it up, which is what stops a
 * backgrounded leader from freezing the vault of the tab the user is watching.
 */
export function decideLeadership(input: LeadershipInput): LeadershipIntent {
  const { lease, selfId, at, hidden, forced, ttl = LEASE_TTL_MS } = input;

  // An explicit user signal always wins: whatever the user just did must be
  // persisted by the tab they did it in.
  if (forced) return "claim";

  // Background tabs never hold the lease — their sim is paused anyway, so there
  // is nothing to persist, and standing down frees the visible tab to lead.
  if (hidden) return "stand_down";

  if (isLeaseHeldBy(lease, selfId, at, ttl)) return "renew";
  if (isLeaseStale(lease, at, ttl)) return "claim";

  // A live lease owned by another visible tab is left alone; we take over only
  // when the user focuses or acts in this tab (which arrives as `forced`).
  return "stand_down";
}

/**
 * Whether a stored lease may be cleared by `selfId` on unload. Releasing without
 * this check lets a tab whose lease was already taken over (e.g. it slept through
 * the TTL) clobber the CURRENT leader's live record on the way out.
 */
export function canReleaseLease(lease: Lease | null, selfId: string): boolean {
  return lease !== null && lease.id === selfId;
}

/** Generate an opaque per-tab id. The only impure function here, and it is trivial. */
export function newTabId(): string {
  const rand =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint8Array(8)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      : Math.random().toString(16).slice(2);
  return `tab-${rand}`;
}

// ── Cross-tab state adoption ──────────────────────────────────────────────────

/**
 * The persisted slice of Wallet Wars state shared across tabs. Generic over the
 * vault type so this module never depends on the engine's `Vault`.
 */
export interface SyncedWar<V> {
  you: V | null;
  totalBanked: number;
  biggestHeist: number;
}

const finite = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * Parse a `storage` event payload into a `SyncedWar`. TOTAL: malformed input
 * yields `null`. `you` is passed through untouched — the caller normalises it
 * with the engine's own `normalizeVault`, keeping vault-shape knowledge in one
 * place.
 */
export function parseSyncedWar<V>(raw: string | null): SyncedWar<V> | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const rec = JSON.parse(raw) as unknown;
    if (!rec || typeof rec !== "object") return null;
    const r = rec as Record<string, unknown>;
    return {
      you: (r.you ?? null) as V | null,
      totalBanked: finite(r.totalBanked, 0),
      biggestHeist: finite(r.biggestHeist, 0),
    };
  } catch {
    return null;
  }
}

/**
 * Merge the leader's persisted state into a follower's local state.
 *
 * - `you` — the LEADER is authoritative. A follower must not keep a divergent
 *   copy of the player's vault, so it takes the remote value verbatim (including
 *   `null`, which correctly propagates a cash-out performed in the leader tab).
 * - `totalBanked` / `biggestHeist` — monotonically non-decreasing house
 *   counters, so the MAX is taken. This is what prevents a lagging record from
 *   visually rewinding the headline numbers.
 *
 * PURE and TOTAL: a `null`/malformed `remote` returns `local` unchanged, and
 * non-finite counters fall back to the local value.
 */
export function adoptRemoteWar<V>(local: SyncedWar<V>, remote: SyncedWar<V> | null): SyncedWar<V> {
  if (!remote) return local;
  return {
    you: remote.you,
    totalBanked: Math.max(finite(local.totalBanked, 0), finite(remote.totalBanked, 0)),
    biggestHeist: Math.max(finite(local.biggestHeist, 0), finite(remote.biggestHeist, 0)),
  };
}
