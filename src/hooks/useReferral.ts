/**
 * useReferral — the Crown-tab referral ledger + the player's own referral context.
 *
 * Two sides:
 *   1. PLAYER AS REFERRED — the referrer tag set once from a `?ref=` link, the
 *      player's largest stake, and a running total routed to their referrer.
 *      `myReferralContext()` feeds the live siege so the split fires inside
 *      `resolveSiege` (house rake only).
 *   2. PLAYER AS REFERRER — the roster of wallets they've invited, each with a
 *      tier, lifetime SOL earned (capped per user at 20× their largest stake via
 *      the audited `splitHouseRake`), and the lifetime total for the Crown hero.
 *
 * Because `ESCROW_ENABLED` is false and there is no backend, the referred-user
 * activity is CLIENT-SIDE SIMULATED — exactly like the bot economy elsewhere —
 * and is driven by the same audited `splitHouseRake` math so every number is
 * conservation-exact. It becomes real money the moment escrow/a backend is on.
 * All persistence is defensive (never throws); the referrer tag survives
 * refreshes/reconnects keyed by wallet.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  splitHouseRake,
  referralCapFor,
  referralTierForAmount,
  getReferrer,
  setReferrerOnce,
  referralCodeForWallet,
  referralLinkForWallet,
  parseRefFromUrl,
  type ReferralTier,
} from "@/lib/referral";

const LEDGER_KEY = "yoink_ww_referral_ledger_v1";
const ACCRUAL_MS = 4_000;

export interface ReferredUser {
  id: string;
  wallet: string;
  tier: ReferralTier;
  largestStake: number;
  earned: number;
}

interface Ledger {
  /** Player's largest single vault stake to date (their own cap basis as a referee). */
  myLargestStake: number;
  /** Total house rake the player (as a referred user) has routed to THEIR referrer. */
  sentToReferrer: number;
  /** Wallets the player has invited (simulated network while escrow is off). */
  referred: ReferredUser[];
  /** True once the starter network has been seeded for this browser. */
  seeded: boolean;
}

const EMPTY: Ledger = { myLargestStake: 0, sentToReferrer: 0, referred: [], seeded: false };

const fin = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function load(): Ledger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return { ...EMPTY };
    const p = JSON.parse(raw) as Partial<Ledger>;
    const referred = Array.isArray(p.referred)
      ? p.referred
          .filter((u): u is ReferredUser => !!u && typeof u.wallet === "string")
          .map((u) => ({
            id: typeof u.id === "string" ? u.id : u.wallet,
            wallet: u.wallet,
            tier: (["pit", "grind", "arena", "court"] as ReferralTier[]).includes(u.tier) ? u.tier : "pit",
            largestStake: Math.max(0, fin(u.largestStake, 0)),
            earned: Math.max(0, fin(u.earned, 0)),
          }))
      : [];
    return {
      myLargestStake: Math.max(0, fin(p.myLargestStake, 0)),
      sentToReferrer: Math.max(0, fin(p.sentToReferrer, 0)),
      referred,
      seeded: p.seeded === true,
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(l: Ledger): void {
  try { localStorage.setItem(LEDGER_KEY, JSON.stringify(l)); } catch { /* ignore */ }
}

/** Deterministic-ish simulated starter network so the Crown tab demonstrates the
 *  tiered mechanic + the cap with live, audited numbers (devnet simulation). */
function seedNetwork(): ReferredUser[] {
  const specs: Array<{ stake: number }> = [{ stake: 0.6 }, { stake: 2.4 }, { stake: 9 }];
  return specs.map((s, i) => ({
    id: `ref-${i}`,
    wallet: `0x${Math.random().toString(16).slice(2, 6)}${Math.random().toString(16).slice(2, 6)}`,
    tier: referralTierForAmount(s.stake),
    largestStake: s.stake,
    earned: 0,
  }));
}

export interface UseReferral {
  /** The player's own referrer tag (who invited them), or null. */
  referrer: string | null;
  /** The player's shareable referral code + link. */
  code: string;
  link: string;
  /** Wallets the player has invited (with a derived `capReached`). */
  referred: Array<ReferredUser & { capReached: boolean; cap: number }>;
  /** Lifetime SOL earned across all referred users (the Crown hero number). */
  lifetimeEarned: number;
  /** Biggest single-referral lifetime earning — the "top referral" figure (real). */
  topReferral: number;
  /** Context to feed the live siege so the split fires inside resolveSiege. */
  myReferralContext: () => { referrer: string | null; earnedSoFar: number; largestStake: number };
  /** Record house rake the player routed to their referrer (from a settled siege). */
  recordSentToReferrer: (cut: number) => void;
  /** Note the player's vault stake (updates their largest-stake cap basis). */
  noteStake: (amount: number) => void;
}

export function useReferral(wallet: string | null): UseReferral {
  const [ledger, setLedger] = useState<Ledger>(() => {
    const l = load();
    if (!l.seeded) {
      const seeded = { ...l, referred: seedNetwork(), seeded: true };
      save(seeded);
      return seeded;
    }
    return l;
  });
  const ref = useRef(ledger);
  ref.current = ledger;

  const code = referralCodeForWallet(wallet ?? "anon");
  const link = referralLinkForWallet(wallet ?? "anon");
  const referrer = wallet ? getReferrer(wallet) : null;

  // Capture the inbound ?ref= tag once, the first time we know the wallet.
  useEffect(() => {
    if (!wallet) return;
    const incoming = parseRefFromUrl();
    if (incoming) setReferrerOnce(wallet, incoming);
  }, [wallet]);

  // Simulated accrual: every tick, each non-capped referred user generates a
  // little house rake in their tier and the player earns the audited cut.
  useEffect(() => {
    const id = setInterval(() => {
      setLedger((prev) => {
        let changed = false;
        const referred = prev.referred.map((u) => {
          const cap = referralCapFor(u.largestStake);
          if (u.earned >= cap) return u;
          // A representative house-rake event in this user's tier (~0.1–0.25% of stake).
          const houseRake = u.largestStake * (0.001 + Math.random() * 0.0015);
          const split = splitHouseRake({
            houseRake, tier: u.tier, hasReferrer: true, earnedSoFar: u.earned, largestStake: u.largestStake,
          });
          if (split.referrerCut <= 0) return u;
          changed = true;
          return { ...u, earned: +(u.earned + split.referrerCut).toFixed(9) };
        });
        if (!changed) return prev;
        const next = { ...prev, referred };
        save(next);
        return next;
      });
    }, ACCRUAL_MS);
    return () => clearInterval(id);
  }, []);

  const recordSentToReferrer = useCallback((cut: number) => {
    if (!Number.isFinite(cut) || cut <= 0) return;
    setLedger((prev) => {
      const next = { ...prev, sentToReferrer: +(prev.sentToReferrer + cut).toFixed(9) };
      save(next);
      return next;
    });
  }, []);

  const noteStake = useCallback((amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    setLedger((prev) => {
      if (amount <= prev.myLargestStake) return prev;
      const next = { ...prev, myLargestStake: amount };
      save(next);
      return next;
    });
  }, []);

  const myReferralContext = useCallback(
    () => ({ referrer, earnedSoFar: ref.current.sentToReferrer, largestStake: ref.current.myLargestStake }),
    [referrer],
  );

  const referred = ledger.referred.map((u) => {
    const cap = referralCapFor(u.largestStake);
    return { ...u, cap, capReached: u.earned >= cap };
  });
  const lifetimeEarned = referred.reduce((sum, u) => sum + u.earned, 0);
  const topReferral = referred.reduce((max, u) => Math.max(max, u.earned), 0);

  return {
    referrer, code, link, referred, lifetimeEarned, topReferral,
    myReferralContext, recordSentToReferrer, noteStake,
  };
}
