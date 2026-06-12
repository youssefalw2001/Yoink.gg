/**
 * YOINK.GG — Bag Payout Engine
 *
 * Winner-take-all is brutal: 1 winner, N losers → churn.
 * This splits the SAME player-funded bag across MANY winners.
 *
 * IMPORTANT: this changes nothing about the house take.
 *   - The 10% rake, 5% jackpot reserve and 1–3% drain are applied per-yoink
 *     (see GAME_CONFIG) and are untouched here.
 *   - This module only decides how the FINAL bag (already net of all house
 *     cuts) is distributed at round end. Same SOL out — just to more people.
 *
 * Distribution tiers:
 *   1. King        — final holder when the fuse blows
 *   2. Runner-up   — the king robbed last (held immediately before the blow)
 *   3. Podium 3–5  — the next most-recent kings, split equally
 *   4. Held pool   — everyone else who held the bag, split by seconds held
 *
 * Any unused share (e.g. nobody in the held pool) folds back into the King's
 * cut, so the bag ALWAYS pays out in full — never leaks, never over-pays.
 */

import type { King } from "@/lib/types";
import type { RoomId } from "@/lib/rooms";

export type PayoutTier = "king" | "runnerup" | "podium" | "held";

export interface PayoutEntry {
  wallet: string;
  isYou: boolean;
  /** 1 = King, 2 = runner-up, 3–5 = podium, 0 = held-time pool */
  place: number;
  tier: PayoutTier;
  amount: number;
  heldFor: number;
}

export interface PayoutCurve {
  king: number;
  runnerUp: number;
  /** total for places 3–5 combined (split equally) */
  podium: number;
  /** total for the held-time pool (split by seconds held) */
  heldPool: number;
}

/**
 * Room-shaped payout curves.
 *   - The Pit is the funnel: flat, lots of small winners, fast dopamine.
 *   - King's Court is the whales: top-heavy, the King wants the trophy.
 */
export const PAYOUT_CURVES: Record<RoomId, PayoutCurve> = {
  pit:   { king: 0.50, runnerUp: 0.12, podium: 0.18, heldPool: 0.20 },
  grind: { king: 0.62, runnerUp: 0.12, podium: 0.14, heldPool: 0.12 },
  arena: { king: 0.70, runnerUp: 0.12, podium: 0.10, heldPool: 0.08 },
  court: { king: 0.85, runnerUp: 0.08, podium: 0.05, heldPool: 0.02 },
};

const DEFAULT_CURVE: PayoutCurve = PAYOUT_CURVES.arena;

export interface WinnerInput {
  wallet: string;
  isYou: boolean;
  heldFor: number;
}

/**
 * Merge duplicate wallets (a wallet can win + lose + re-win in one round).
 * Keeps the most-recent occurrence (lowest index) for placement and sums
 * the total seconds that wallet held the bag this round.
 */
function dedupeByWallet(kings: King[]): King[] {
  const seen = new Map<string, King>();
  kings.forEach((k) => {
    const existing = seen.get(k.wallet);
    if (existing) {
      existing.heldFor += k.heldFor;
    } else {
      seen.set(k.wallet, { ...k });
    }
  });
  return Array.from(seen.values());
}

const round = (n: number) => +n.toFixed(4);

/**
 * Compute the full payout split for a finished round.
 *
 * @param bag         final bag value (already net of all house cuts)
 * @param winner      the final king when the fuse blew
 * @param roundFallen kings who held + lost THIS round, most-recent first
 * @param roomId      drives which payout curve is used
 */
export function computePayouts(
  bag: number,
  winner: WinnerInput,
  roundFallen: King[],
  roomId: RoomId,
): PayoutEntry[] {
  const curve = PAYOUT_CURVES[roomId] ?? DEFAULT_CURVE;

  // Fallen kings this round, deduped by wallet, excluding the winner's wallet
  // (the winner is paid via the King tier, not twice).
  const fallen = dedupeByWallet(roundFallen).filter((k) => k.wallet !== winner.wallet);

  const runnerUp  = fallen[0] ?? null;
  const podium    = fallen.slice(1, 4);          // up to 3rd–5th
  const heldTail  = fallen.slice(4);             // everyone else who held

  const entries: PayoutEntry[] = [];
  let distributed = 0;

  // ── Runner-up ──────────────────────────────────────────────────────────────
  if (runnerUp) {
    const amount = round(bag * curve.runnerUp);
    distributed += amount;
    entries.push({
      wallet: runnerUp.wallet, isYou: runnerUp.isYou,
      place: 2, tier: "runnerup", amount, heldFor: runnerUp.heldFor,
    });
  }

  // ── Podium 3rd–5th (split equally) ───────────────────────────────────────────
  if (podium.length > 0) {
    const each = round((bag * curve.podium) / podium.length);
    podium.forEach((k, i) => {
      distributed += each;
      entries.push({
        wallet: k.wallet, isYou: k.isYou,
        place: 3 + i, tier: "podium", amount: each, heldFor: k.heldFor,
      });
    });
  }

  // ── Held-time pool (split by seconds held) ───────────────────────────────────
  const heldTotal = heldTail.reduce((s, k) => s + Math.max(k.heldFor, 0), 0);
  if (heldTail.length > 0 && heldTotal > 0) {
    const pool = bag * curve.heldPool;
    heldTail.forEach((k) => {
      const amount = round(pool * (Math.max(k.heldFor, 0) / heldTotal));
      if (amount <= 0) return;
      distributed += amount;
      entries.push({
        wallet: k.wallet, isYou: k.isYou,
        place: 0, tier: "held", amount, heldFor: k.heldFor,
      });
    });
  }

  // ── King — absorbs everything not yet distributed (incl. unused shares) ──────
  const kingAmount = round(Math.max(bag - distributed, 0));
  entries.unshift({
    wallet: winner.wallet, isYou: winner.isYou,
    place: 1, tier: "king", amount: kingAmount, heldFor: winner.heldFor,
  });

  return entries;
}

/** Total SOL paid to the local player across all tiers. */
export function playerPayout(entries: PayoutEntry[]): number {
  return round(entries.filter((e) => e.isYou).reduce((s, e) => s + e.amount, 0));
}

const ORDINAL: Record<number, string> = { 3: "3rd", 4: "4th", 5: "5th" };

/** Human label for a payout tier. */
export function tierLabel(entry: PayoutEntry): string {
  switch (entry.tier) {
    case "king":     return "King";
    case "runnerup": return "Runner-up";
    case "podium":   return `${ORDINAL[entry.place] ?? `${entry.place}th`} place`;
    case "held":     return "Held-time";
  }
}
