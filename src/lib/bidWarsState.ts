/**
 * YOINK.GG — Bid Wars Game State
 *
 * Separate from the main YOINK mechanic.
 * Open bidding — anyone places a bid above the minimum raise.
 * Highest bidder when the timer hits zero wins the bag.
 *
 * Economics:
 *   - Minimum first bid: 1 SOL
 *   - Minimum raise: 0.25 SOL above current highest
 *   - 85% of every bid → bag
 *   - 10% → rake
 *   - 5%  → jackpot reserve
 *   - Timer resets to 30s on every new highest bid
 *   - Unlocked at Rank 6 (Warlord) — the wolves only room
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { randomPoolWallet } from "@/lib/wallets";
export const BID_CONFIG = {
  ROUND_SECONDS:    30,
  TICK_MS:          100,
  MIN_FIRST_BID:    1.0,
  MIN_RAISE:        0.25,
  BAG_SHARE:        0.85,
  RAKE:             0.10,
  JACKPOT:          0.05,
  STARTING_BAG:     5.0,    // bigger starting bag for whales
  REQUIRED_RANK:    6,       // Warlord+
} as const;

export interface Bidder {
  id:        string;
  wallet:    string;
  isYou:     boolean;
  bid:       number;         // their current highest bid this round
  totalBids: number;         // how many times they've bid
  walletBal: number;         // simulated SOL balance
  rank:      number;         // 1 = current leader
  isActive:  boolean;        // still in this round
}

export interface BidEvent {
  id:        string;
  wallet:    string;
  isYou:     boolean;
  amount:    number;
  ts:        number;
  newBag:    number;
}

export interface BidWarsState {
  bagAmount:     number;
  countdown:     number;
  leader:        Bidder | null;
  bidders:       Bidder[];
  bidHistory:    BidEvent[];
  roundNumber:   number;
  isRoundOver:   boolean;
  winner:        string | null;
  winnerIsYou:   boolean;
  minNextBid:    number;
  isWaiting:     boolean;
  totalDistributed: number;
  biggestPot:    number;
}

let _id = 0;
const uid = () => `bw-${Date.now()}-${_id++}`;

function fakeBalance() {
  return +(5 + Math.random() * 195).toFixed(2);
}

function seedBidders(): Bidder[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id:        uid(),
    wallet:    randomPoolWallet(),
    isYou:     false,
    bid:       0,
    totalBids: 0,
    walletBal: fakeBalance(),
    rank:      i + 1,
    isActive:  true,
  }));
}

const INITIAL: BidWarsState = {
  bagAmount:        BID_CONFIG.STARTING_BAG,
  countdown:        BID_CONFIG.ROUND_SECONDS,
  leader:           null,
  bidders:          seedBidders(),
  bidHistory:       [],
  roundNumber:      47,
  isRoundOver:      false,
  winner:           null,
  winnerIsYou:      false,
  minNextBid:       BID_CONFIG.MIN_FIRST_BID,
  isWaiting:        true,
  totalDistributed: 4820.5,
  biggestPot:       347.2,
};

export function useBidWarsState() {
  const [state, setState] = useState<BidWarsState>(INITIAL);
  const stateRef  = useRef(state);
  stateRef.current = state;
  const tickRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const botCdRef  = useRef<Map<string, number>>(new Map());
  const heldRef   = useRef(0);

  // ── Place a bid (by you or bot) ──────────────────────────────────────────
  const applyBid = useCallback((wallet: string, isYou: boolean, amount: number) => {
    setState(prev => {
      if (prev.isRoundOver || prev.isWaiting) return prev;
      if (amount < prev.minNextBid - 0.001) return prev; // too low

      const bagAdd = +(amount * BID_CONFIG.BAG_SHARE).toFixed(6);
      const newBag = +(prev.bagAmount + bagAdd).toFixed(6);

      // Update or insert bidder
      const existing = prev.bidders.find(b => b.wallet === wallet);
      let newBidders: Bidder[];
      if (existing) {
        newBidders = prev.bidders.map(b =>
          b.wallet === wallet
            ? { ...b, bid: amount, totalBids: b.totalBids + 1, isYou }
            : b,
        );
      } else {
        newBidders = [
          ...prev.bidders,
          {
            id:        uid(),
            wallet,
            isYou,
            bid:       amount,
            totalBids: 1,
            walletBal: fakeBalance(),
            rank:      prev.bidders.length + 1,
            isActive:  true,
          },
        ];
      }

      // Re-rank by bid amount desc
      const sorted = [...newBidders].sort((a, b) => b.bid - a.bid);
      const ranked = sorted.map((b, i) => ({ ...b, rank: i + 1 }));

      const event: BidEvent = {
        id:     uid(),
        wallet,
        isYou,
        amount,
        ts:     Date.now(),
        newBag,
      };

      return {
        ...prev,
        bagAmount:   newBag,
        countdown:   BID_CONFIG.ROUND_SECONDS,
        leader:      ranked[0] ?? null,
        bidders:     ranked,
        bidHistory:  [event, ...prev.bidHistory].slice(0, 30),
        minNextBid:  +(amount + BID_CONFIG.MIN_RAISE).toFixed(3),
      };
    });
  }, []);

  // ── Player bid ─────────────────────────────────────────────────────────────
  const placeBid = useCallback((amount: number) => {
    const s = stateRef.current;
    if (s.isRoundOver || s.isWaiting) return false;
    if (amount < s.minNextBid - 0.001) return false;
    applyBid("You", true, amount);
    return true;
  }, [applyBid]);

  // ── Restart ────────────────────────────────────────────────────────────────
  const playAgain = useCallback(() => {
    setState(prev => ({
      ...INITIAL,
      roundNumber:      prev.roundNumber + 1,
      bidders:          seedBidders(),
      totalDistributed: prev.totalDistributed,
      biggestPot:       prev.biggestPot,
      isWaiting:        false,
    }));
    botCdRef.current.clear();
    heldRef.current = 0;
  }, []);

  // ── Core tick ──────────────────────────────────────────────────────────────
  useEffect(() => {
    tickRef.current = setInterval(() => {
      const now = Date.now();

      setState(prev => {
        if (prev.isWaiting) {
          // auto-start after 2s
          return { ...prev, isWaiting: false };
        }
        if (prev.isRoundOver) return prev;

        const next = +(prev.countdown - BID_CONFIG.TICK_MS / 1000).toFixed(2);

        if (next <= 0) {
          const winner = prev.leader;
          const won    = +prev.bagAmount.toFixed(3);
          return {
            ...prev,
            countdown:        0,
            isRoundOver:      true,
            winner:           winner?.isYou ? "You" : (winner?.wallet ?? null),
            winnerIsYou:      winner?.isYou ?? false,
            biggestPot:       Math.max(prev.biggestPot, won),
            totalDistributed: +(prev.totalDistributed + won).toFixed(2),
          };
        }

        return { ...prev, countdown: next };
      });

      // ── Bot bidding logic ────────────────────────────────────────────────
      const s = stateRef.current;
      if (!s.isRoundOver && !s.isWaiting) {
        const frac   = s.countdown / BID_CONFIG.ROUND_SECONDS;
        // Bots bid more aggressively as time runs low
        let chance = 0.008;
        if (frac < 0.6) chance = 0.018;
        if (frac < 0.3) chance = 0.04;
        if (frac < 0.15) chance = 0.07;

        if (Math.random() < chance && s.bidders.length > 0) {
          // Pick a random bot bidder to raise
          const bots = s.bidders.filter(b => !b.isYou);
          if (bots.length) {
            const bot = bots[Math.floor(Math.random() * bots.length)];
            const lastBid = botCdRef.current.get(bot.wallet) ?? 0;
            if (now - lastBid > 3500) {
              botCdRef.current.set(bot.wallet, now);
              const raise = +(s.minNextBid + Math.random() * 0.5).toFixed(3);
              setTimeout(() => applyBid(bot.wallet, false, raise), 0);
            }
          }
        }
      }
    }, BID_CONFIG.TICK_MS);

    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [applyBid]);

  // Seed a few starting bids from bots to make it feel active
  useEffect(() => {
    const t1 = setTimeout(() => {
      const s = stateRef.current;
      if (s.bidders.length > 0) {
        applyBid(s.bidders[0].wallet, false, BID_CONFIG.MIN_FIRST_BID);
      }
    }, 800);
    const t2 = setTimeout(() => {
      const s = stateRef.current;
      if (s.bidders.length > 1) {
        applyBid(s.bidders[1].wallet, false, BID_CONFIG.MIN_FIRST_BID + BID_CONFIG.MIN_RAISE);
      }
    }, 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [applyBid]);

  return { state, placeBid, playAgain };
}
