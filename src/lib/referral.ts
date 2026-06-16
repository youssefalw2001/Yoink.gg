/**
 * YOINK.GG — Wallet Wars · Tiered Lifetime Referral (pure money math + attribution)
 *
 * THE NON-NEGOTIABLE RULE: a referral payout is ALWAYS carved out of the
 * house's OWN rake share, AFTER that rake has already been computed by the
 * frozen `siegeMath.ts`. It NEVER touches the referred user's fee, their odds,
 * or the defender's toll. A referred user's economic experience is byte-for-byte
 * identical to a non-referred user's — only the house's own margin is split
 * differently when a referral relationship exists.
 *
 * This module is PURE + total + side-effect-free in its math (`splitHouseRake`,
 * tiers, cap). The attribution helpers touch `localStorage` defensively (never
 * throw) because `ESCROW_ENABLED` is false and there is no backend yet; the
 * tag survives refreshes/reconnects keyed by wallet.
 *
 * Provable fairness + EV are untouched: nothing here changes a roll, a fee, an
 * odds value, or a rake percentage CHARGED to a user. It only repartitions the
 * already-charged house rake between the house and a referrer.
 */

import { tierIndexForAmount } from "@/lib/walletWarsState";

// ── Tier → referrer percentage of house rake (bps) ────────────────────────────

export type ReferralTier = "pit" | "grind" | "arena" | "court";

/**
 * The referrer's cut of house rake scales with the tier the referred user's
 * SPECIFIC transaction occurs in — not a fixed classification of the user. So a
 * referred user generates different referrer percentages in different tiers.
 *
 *   Pit (0.1–1 SOL)  15%   Grind (1–5)  20%   Arena (5–20)  22%   Court (20+)  25%
 *
 * Stored in basis points (1% = 100 bps) for exact integer-rate arithmetic.
 */
export const REFERRAL_BPS: Record<ReferralTier, number> = {
  pit: 1500,
  grind: 2000,
  arena: 2200,
  court: 2500,
};

/** Tier order, low → high (for display + iteration in tests). */
export const REFERRAL_TIER_ORDER: readonly ReferralTier[] = ["pit", "grind", "arena", "court"];

const TIER_BY_INDEX: readonly ReferralTier[] = ["pit", "grind", "arena", "court"];

/**
 * Resolve which referral tier a transaction falls in, reusing the engine's
 * canonical `tierIndexForAmount` thresholds (pit 0.1–1 / grind 1–5 / arena
 * 5–20 / court 20+) so the referral tier can never drift from the siege tier.
 */
export function referralTierForAmount(amount: number): ReferralTier {
  return TIER_BY_INDEX[tierIndexForAmount(amount)];
}

// ── Lifetime cap (per referred-user → referrer pair) ──────────────────────────

/**
 * Safety cap: a referrer can earn at most `20×` a referred user's largest single
 * vault stake to date FROM THAT user. Tracked per referred-user→referrer pair
 * (never globally), so hitting one user's cap never affects earnings from other
 * referred users.
 */
export const REFERRAL_CAP_MULTIPLE = 20;

/** The lifetime cap (SOL) for one referred user, from their largest stake. */
export function referralCapFor(largestStake: number): number {
  return REFERRAL_CAP_MULTIPLE * Math.max(0, Number.isFinite(largestStake) ? largestStake : 0);
}

// ── The split (conservation-exact) ────────────────────────────────────────────

/** Inputs to a single house-rake split for one settled transaction. */
export interface ReferralSplitInput {
  /** The house rake ALREADY computed by siegeMath for this transaction (SOL). */
  houseRake: number;
  /** The tier this specific transaction occurred in. */
  tier: ReferralTier;
  /** Whether the referred user (whose tx this is) has a referrer tag. */
  hasReferrer: boolean;
  /** Referral earned so far from THIS referred user (for the per-pair cap). */
  earnedSoFar: number;
  /** This referred user's largest single vault stake to date (caps at 20×). */
  largestStake: number;
}

/** Result of splitting one transaction's house rake. Conservation-exact. */
export interface HouseRakeSplit {
  /** The original house rake (clamped to ≥ 0). */
  houseRake: number;
  /** Carved to the referrer (0 when no referrer or fully capped). */
  referrerCut: number;
  /** Remaining to the house. Always `houseRake − referrerCut` EXACTLY. */
  houseKept: number;
  /** The bps applied (0 when no referrer). */
  bps: number;
  /** True iff the cut was clamped down by the lifetime cap. */
  capped: boolean;
}

/**
 * Split one transaction's house rake into `referrerCut + houseKept`.
 *
 * CONSERVATION GUARANTEE (the heart of the system): for ALL inputs,
 *   `referrerCut + houseKept === houseRake`  (exactly, no leakage, no double-pay)
 * and `referrerCut === 0 → houseKept === houseRake` (house keeps 100%).
 *
 * - No referrer (or non-positive rake) → referrer gets 0, house keeps everything
 *   (zero behavior change vs. today).
 * - With a referrer → `rawCut = houseRake · bps(tier)/10000`, then clamped by the
 *   remaining room under the per-user 20× cap.
 *
 * It NEVER reads or returns the defender toll or the raider fee — those are
 * computed by the frozen siegeMath and are identical regardless of this split.
 */
export function splitHouseRake(input: ReferralSplitInput): HouseRakeSplit {
  const houseRake = Number.isFinite(input.houseRake) && input.houseRake > 0 ? input.houseRake : 0;

  if (!input.hasReferrer || houseRake === 0) {
    return { houseRake, referrerCut: 0, houseKept: houseRake, bps: 0, capped: false };
  }

  const bps = REFERRAL_BPS[input.tier];
  const rawCut = (houseRake * bps) / 10_000;

  const cap = referralCapFor(input.largestStake);
  const room = Math.max(0, cap - Math.max(0, Number.isFinite(input.earnedSoFar) ? input.earnedSoFar : 0));

  const referrerCut = Math.min(rawCut, room);
  const houseKept = houseRake - referrerCut; // defined as the remainder → exact conservation
  return { houseRake, referrerCut, houseKept, bps, capped: referrerCut < rawCut };
}

// ── Attribution (set-once, per wallet, survives refresh/reconnect) ─────────────

/** Map of referred-wallet → referrer tag (the referrer's code/address). */
const REFERRER_KEY = "yoink_ww_referrer_v1";

type ReferrerMap = Record<string, string>;

function loadReferrerMap(): ReferrerMap {
  try {
    const raw = localStorage.getItem(REFERRER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: ReferrerMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.length > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveReferrerMap(map: ReferrerMap): void {
  try {
    localStorage.setItem(REFERRER_KEY, JSON.stringify(map));
  } catch {
    /* private mode / unavailable — in-memory only */
  }
}

/** The referrer tag for a wallet, or null if none. Never throws. */
export function getReferrer(wallet: string): string | null {
  if (!wallet) return null;
  return loadReferrerMap()[wallet] ?? null;
}

/**
 * Tag `wallet` with `referrer` exactly ONCE. A subsequent referral link never
 * overwrites an existing tag. Self-referral is ignored. Returns true iff a new
 * tag was written.
 */
export function setReferrerOnce(wallet: string, referrer: string): boolean {
  if (!wallet || !referrer) return false;
  const map = loadReferrerMap();
  if (map[wallet]) return false; // permanent — never overwritten
  // Ignore self-referral (a wallet cannot refer itself).
  if (referrer === wallet || referrer === referralCodeForWallet(wallet)) return false;
  map[wallet] = referrer;
  saveReferrerMap(map);
  return true;
}

// ── Referral code / link ───────────────────────────────────────────────────────

/** Deterministic, shareable referral code for a wallet (stable across sessions). */
export function referralCodeForWallet(wallet: string): string {
  const w = (wallet || "anon").replace(/[^a-zA-Z0-9]/g, "");
  return `LORD-${w.slice(0, 6).toUpperCase()}`;
}

/** The full invite link carrying the wallet's referral code. */
export function referralLinkForWallet(wallet: string, origin = "https://yoink.gg"): string {
  return `${origin}/?ref=${encodeURIComponent(referralCodeForWallet(wallet))}`;
}

/** Read the incoming `?ref=` code from the current URL, or null. Never throws. */
export function parseRefFromUrl(search?: string): string | null {
  try {
    const q = search ?? (typeof window !== "undefined" ? window.location.search : "");
    const code = new URLSearchParams(q).get("ref");
    return code && code.trim().length > 0 ? code.trim() : null;
  } catch {
    return null;
  }
}
