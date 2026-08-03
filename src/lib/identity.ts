/**
 * YOINK.GG — Stable player identity (wallet-optional).
 *
 * THE BUG THIS FIXES: `useReferral` derived the player's referral code from
 * `wallet ?? "anon"`, and `referralCodeForWallet("anon")` returns the literal
 * string `LORD-ANON`. So EVERY guest in the world shared one referral code.
 * A guest who shared a win card was crediting a code that identified nobody —
 * and guests are exactly the cohort most likely to share, because the free
 * siege is the first thing they touch.
 *
 * The fix: mint a stable, unique, per-browser anonymous id on first use and key
 * the referral code off that whenever no wallet is connected. The code then
 * stays constant across reloads, so a link shared before connecting keeps
 * working afterwards.
 *
 * HONEST LIMITATION: without a backend, resolving an anonymous code back to a
 * person is only possible on that person's own device. `linkAnonToWallet` records
 * the anon→wallet association locally so the mapping exists the moment a real
 * server can consume it, but cross-device credit genuinely requires that server.
 * This module makes attribution *possible and unique*; it does not fake
 * settlement. See `recordedAnonLinks`.
 */

/** localStorage key for the per-browser anonymous player id. */
export const ANON_ID_KEY = "yoink_anon_id_v1";
/** localStorage key for anon-id → wallet associations, kept for a future server. */
export const ANON_LINK_KEY = "yoink_anon_link_v1";

/**
 * Generate a fresh anonymous id: 10 lowercase hex chars, crypto-random when
 * available. Long enough that collisions across a launch-scale audience are
 * negligible, short enough to read inside a referral code.
 */
export function newAnonId(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return Array.from(crypto.getRandomValues(new Uint8Array(5)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return Math.random().toString(16).slice(2, 12).padEnd(10, "0");
}

/**
 * The stable anonymous id for this browser, minting and persisting one on first
 * call. Never throws — in private mode (or with storage blocked) it returns a
 * session-scoped id instead, which is still unique, just not durable.
 */
export function anonPlayerId(): string {
  try {
    const existing = localStorage.getItem(ANON_ID_KEY);
    if (existing && /^[0-9a-f]{6,32}$/i.test(existing)) return existing;
    const fresh = newAnonId();
    localStorage.setItem(ANON_ID_KEY, fresh);
    return fresh;
  } catch {
    // Storage unavailable: memoise for the page lifetime so the code at least
    // stays stable within the session.
    if (!memoAnon) memoAnon = newAnonId();
    return memoAnon;
  }
}

let memoAnon: string | null = null;

/**
 * The identity the referral system should key on: the connected wallet when
 * present, otherwise this browser's stable anonymous id. This is the single
 * function that replaces the old `wallet ?? "anon"`.
 */
export function playerIdentity(wallet: string | null | undefined): string {
  return wallet && wallet.length > 0 ? wallet : anonPlayerId();
}

/** Recorded anon→wallet associations, oldest first. Never throws. */
export function recordedAnonLinks(): Array<{ anonId: string; wallet: string; at: number }> {
  try {
    const raw = localStorage.getItem(ANON_LINK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is { anonId: string; wallet: string; at: number } =>
        !!r && typeof r === "object"
        && typeof (r as { anonId?: unknown }).anonId === "string"
        && typeof (r as { wallet?: unknown }).wallet === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Associate this browser's anonymous id with a now-connected wallet, exactly
 * once per pair. Returns true iff a new association was written.
 *
 * This does NOT move or credit any SOL — there is no server to adjudicate it.
 * It preserves the fact that these two identities are the same person so that
 * links shared while anonymous can be honoured once a backend exists.
 */
export function linkAnonToWallet(wallet: string): boolean {
  if (!wallet) return false;
  try {
    const anonId = anonPlayerId();
    if (anonId === wallet) return false;
    const links = recordedAnonLinks();
    if (links.some((l) => l.anonId === anonId && l.wallet === wallet)) return false;
    links.push({ anonId, wallet, at: Date.now() });
    // Bound the list so a shared browser cannot grow it without limit.
    localStorage.setItem(ANON_LINK_KEY, JSON.stringify(links.slice(-25)));
    return true;
  } catch {
    return false;
  }
}
