/**
 * YOINK.GG — Wallet Wars (flagship PvP)
 *
 * Stake a stash → raid stashes in YOUR weight class → snatch a slice on a win,
 * bank the bid on a survive. The house rakes EVERY action.
 *
 * STRUCTURE — tiered boards (weight classes by stash size):
 *   The Pit (0.1–1) · The Grind (1–5) · The Arena (5–20) · King's Court (20+)
 *   You can only raid inside your own tier. Whales physically can't reach minnows.
 *
 * WHALE SAFETY:
 *   - Tiering (above).
 *   - Bid cap: a bid can't push win odds past MAX_WIN_CHANCE — nobody buys certainty.
 *   - Repeat-target tax: each re-raid on the same wallet costs an escalating
 *     house surcharge — kills griefing AND alt-wallet collusion.
 *   - Seize cap (25%) + post-raid shield — no one-shot wipes, no chain-draining.
 *
 * BET LEVERS:
 *   - Variable bid (slider) + ALL-IN.
 *   - Bounties: pledge SOL on a wallet; whoever cracks them takes the pool.
 *
 * THE MONEY MACHINE: house takes HOUSE_RAKE on every seize, every forfeited bid,
 * every bounty payout, plus the full repeat-target surcharge. 100% player-funded.
 *
 * Faithful client-side simulation; on-chain the roll uses Switchboard VRF.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { randomPoolWallet } from "@/lib/wallets";

export const WAR_CONFIG = {
  HOUSE_RAKE: 0.15,
  SEIZE_PCT: 0.25,
  DEF_FACTOR: 0.5,
  /** Bids can never push win odds past this — the anti-whale ceiling. */
  MAX_WIN_CHANCE: 0.8,
  RAID_COOLDOWN_MS: 3_000,
  SHIELD_MS: 6_000,
  TICK_MS: 1_500,
  REF_BID: 0.1,
  /** Bot stashes generated per tier. */
  PER_TIER: 5,
  /** Repeat-target surcharge: + this × bid per prior raid within the window. */
  REPEAT_TAX_STEP: 0.3,
  REPEAT_TAX_CAP: 1.2,
  REPEAT_WINDOW_MS: 45_000,
} as const;

export interface Tier {
  id: string;
  label: string;
  min: number;
  max: number;
  accent: string;
  /** Minimum bid (table stakes) in this tier. */
  minBet: number;
}

export const TIERS: Tier[] = [
  { id: "pit",   label: "The Pit",      min: 0.1, max: 1,        accent: "#7000FF", minBet: 0.02 },
  { id: "grind", label: "The Grind",    min: 1,   max: 5,        accent: "#00E676", minBet: 0.05 },
  { id: "arena", label: "The Arena",    min: 5,   max: 20,       accent: "#FFD700", minBet: 0.25 },
  { id: "court", label: "King's Court", min: 20,  max: Infinity, accent: "#FF2200", minBet: 1 },
];

/** Stake presets when opening a stash — one entry point per tier. */
export const OPEN_STAKES: number[] = [0.25, 1, 5, 20];

export function tierIndexForAmount(amount: number): number {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (amount >= TIERS[i].min) return i;
  }
  return 0;
}
export function tierForAmount(amount: number): Tier {
  return TIERS[tierIndexForAmount(amount)];
}

export interface Stash {
  id: string;
  wallet: string;
  isYou: boolean;
  amount: number;
  banked: number;
  survived: number;
  cracked: number;
  shieldUntil: number;
  /** Open bounty pledged on this wallet — whoever cracks it takes the pool. */
  bounty: number;
}

export type RaidOutcome = "win" | "loss";

export interface RaidEvent {
  id: string;
  raider: string;
  raiderIsYou: boolean;
  target: string;
  targetIsYou: boolean;
  outcome: RaidOutcome;
  bid: number;
  amount: number;
  /** True when this raid also claimed a bounty. */
  bounty?: number;
  ts: number;
}

export interface RaidResult {
  outcome: RaidOutcome;
  pWin: number;
  bid: number;
  tax: number;
  seized: number;
  bounty: number;
  forfeit: number;
  targetWallet: string;
  targetId: string;
  yourStashAfter: number;
}

export interface WarState {
  stashes: Stash[];
  you: Stash | null;
  feed: RaidEvent[];
  totalBanked: number;
  biggestHeist: number;
  raidCooldownUntil: number;
}

let _id = 0;
const uid = (p = "ww") => `${p}-${Date.now()}-${_id++}`;
const round = (n: number) => +n.toFixed(4);
const now = () => Date.now();

// ── Pure helpers (shared with the UI) ─────────────────────────────────────────

export function defenceOf(stashAmount: number): number {
  return round(stashAmount * WAR_CONFIG.DEF_FACTOR);
}
export function winChance(bid: number, stashAmount: number): number {
  const def = defenceOf(stashAmount);
  if (bid <= 0) return 0;
  return Math.min(WAR_CONFIG.MAX_WIN_CHANCE, Math.max(0.02, bid / (bid + def)));
}
export function seizeAmount(stashAmount: number): number {
  return round(stashAmount * WAR_CONFIG.SEIZE_PCT);
}
export function stashStrengthPct(stashAmount: number): number {
  const def = defenceOf(stashAmount);
  return Math.round((def / (def + WAR_CONFIG.REF_BID)) * 100);
}
/** Largest bid allowed — the one that hits exactly MAX_WIN_CHANCE odds. */
export function maxBidFor(targetAmount: number): number {
  const def = defenceOf(targetAmount);
  const m = WAR_CONFIG.MAX_WIN_CHANCE;
  return round(def * (m / (1 - m)));
}

// ── Board generation ──────────────────────────────────────────────────────────

function amountInTier(t: Tier): number {
  const hi = t.max === Infinity ? t.min * 3.5 : t.max;
  return round(t.min + Math.random() * (hi - t.min));
}
function makeBotStash(tier: Tier): Stash {
  return {
    id: uid("stash"),
    wallet: randomPoolWallet(),
    isYou: false,
    amount: amountInTier(tier),
    banked: round(Math.random() * 0.4),
    survived: Math.floor(Math.random() * 12),
    cracked: Math.floor(Math.random() * 3),
    shieldUntil: 0,
    bounty: Math.random() < 0.15 ? round(tier.minBet * (3 + Math.random() * 8)) : 0,
  };
}
function seedBoard(): Stash[] {
  return TIERS.flatMap((t) =>
    Array.from({ length: WAR_CONFIG.PER_TIER }, () => makeBotStash(t)),
  ).sort((a, b) => b.amount - a.amount);
}

const INITIAL: WarState = {
  stashes: seedBoard(),
  you: null,
  feed: [],
  totalBanked: 1_284.6,
  biggestHeist: 12.4,
  raidCooldownUntil: 0,
};

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "yoink_walletwars_v2";
interface PersistedWar { you: Stash | null; totalBanked: number; biggestHeist: number; }

function loadPersisted(): PersistedWar | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedWar;
  } catch { /* ignore */ }
  return null;
}
function savePersisted(s: WarState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ you: s.you, totalBanked: s.totalBanked, biggestHeist: s.biggestHeist }));
  } catch { /* ignore */ }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWalletWars() {
  const [state, setState] = useState<WarState>(() => {
    const p = loadPersisted();
    return p
      ? { ...INITIAL, you: p.you ?? null, totalBanked: p.totalBanked ?? INITIAL.totalBanked, biggestHeist: p.biggestHeist ?? INITIAL.biggestHeist }
      : INITIAL;
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Repeat-target raid log (for the anti-grief surcharge), kept out of render state.
  const raidLog = useRef<Map<string, number[]>>(new Map());

  useEffect(() => { savePersisted(state); }, [state.you, state.totalBanked, state.biggestHeist]);

  const openStash = useCallback((amount: number) => {
    setState((prev) => prev.you ? prev : {
      ...prev,
      you: { id: uid("you"), wallet: "You", isYou: true, amount: round(amount), banked: 0, survived: 0, cracked: 0, shieldUntil: 0, bounty: 0 },
    });
  }, []);

  const closeStash = useCallback(() => {
    setState((prev) => prev.you ? { ...prev, you: null } : prev);
  }, []);

  /** Escalating house surcharge for repeatedly hitting the same wallet. */
  const repeatTaxMult = useCallback((targetId: string): number => {
    const ts = raidLog.current.get(targetId) ?? [];
    const recent = ts.filter((t) => now() - t < WAR_CONFIG.REPEAT_WINDOW_MS);
    return Math.min(WAR_CONFIG.REPEAT_TAX_CAP, recent.length * WAR_CONFIG.REPEAT_TAX_STEP);
  }, []);

  // ── Raid ────────────────────────────────────────────────────────────────────
  const raid = useCallback((targetId: string, bidRaw: number): RaidResult | null => {
    const s = stateRef.current;
    if (!s.you) return null;
    if (now() < s.raidCooldownUntil) return null;

    const target = s.stashes.find((t) => t.id === targetId);
    if (!target || now() < target.shieldUntil) return null;
    // Same weight class only.
    if (tierIndexForAmount(target.amount) !== tierIndexForAmount(s.you.amount)) return null;

    // Clamp bid: table-stakes floor, your-stash + odds-cap ceiling.
    const tier   = tierForAmount(s.you.amount);
    const ceil   = Math.min(maxBidFor(target.amount), s.you.amount);
    const bid    = round(Math.max(tier.minBet, Math.min(bidRaw, ceil)));
    if (bid <= 0 || bid > s.you.amount) return null;

    const tax    = round(bid * repeatTaxMult(targetId));
    if (bid + tax > s.you.amount) return null;

    const pWin   = winChance(bid, target.amount);
    const won    = Math.random() < pWin;
    const seizeG = seizeAmount(target.amount);
    const ts     = now();

    // Record for the repeat-tax log.
    const log = raidLog.current.get(targetId) ?? [];
    raidLog.current.set(targetId, [...log.filter((t) => ts - t < WAR_CONFIG.REPEAT_WINDOW_MS), ts]);

    const seizeNet  = round(seizeG * (1 - WAR_CONFIG.HOUSE_RAKE));
    const bountyNet = won && target.bounty > 0 ? round(target.bounty * (1 - WAR_CONFIG.HOUSE_RAKE)) : 0;

    const result: RaidResult = {
      outcome: won ? "win" : "loss",
      pWin, bid, tax,
      seized:  won ? seizeNet : 0,
      bounty:  bountyNet,
      forfeit: won ? 0 : round(bid * (1 - WAR_CONFIG.HOUSE_RAKE)),
      targetWallet: target.wallet, targetId,
      yourStashAfter: 0,
    };

    setState((prev) => {
      if (!prev.you) return prev;
      const tgt = prev.stashes.find((t) => t.id === targetId);
      if (!tgt) return prev;

      const youAmt = won
        ? round(prev.you.amount - tax + seizeNet + bountyNet)        // win: bid returned, +seize +bounty −tax
        : round(prev.you.amount - tax - bid);                        // loss: −bid −tax
      const nextYou = { ...prev.you, amount: youAmt };
      result.yourStashAfter = youAmt;

      const stashes = prev.stashes.map((t) => {
        if (t.id !== targetId) return t;
        if (won) {
          return { ...t, amount: round(Math.max(t.amount - seizeG, 0.01)), bounty: 0, cracked: t.cracked + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
        }
        return { ...t, banked: round(t.banked + bid * (1 - WAR_CONFIG.HOUSE_RAKE)), survived: t.survived + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
      });

      const event: RaidEvent = {
        id: uid("raid"), raider: "You", raiderIsYou: true,
        target: tgt.wallet, targetIsYou: false,
        outcome: won ? "win" : "loss", bid,
        amount: won ? round(seizeNet + bountyNet) : round(bid),
        bounty: bountyNet || undefined, ts,
      };

      return {
        ...prev,
        you: nextYou,
        stashes,
        feed: [event, ...prev.feed].slice(0, 40),
        biggestHeist: won ? Math.max(prev.biggestHeist, seizeNet + bountyNet) : prev.biggestHeist,
        totalBanked: round(prev.totalBanked + (won ? seizeG * WAR_CONFIG.HOUSE_RAKE + (tgt.bounty * WAR_CONFIG.HOUSE_RAKE) : bid * WAR_CONFIG.HOUSE_RAKE) + tax),
        raidCooldownUntil: ts + WAR_CONFIG.RAID_COOLDOWN_MS,
      };
    });

    return result;
  }, [repeatTaxMult]);

  // ── Place a bounty on a target ────────────────────────────────────────────────
  const placeBounty = useCallback((targetId: string, amount: number): boolean => {
    const s = stateRef.current;
    if (!s.you || amount <= 0 || amount > s.you.amount) return false;
    const target = s.stashes.find((t) => t.id === targetId);
    if (!target) return false;
    if (tierIndexForAmount(target.amount) !== tierIndexForAmount(s.you.amount)) return false;

    setState((prev) => {
      if (!prev.you) return prev;
      const ev: RaidEvent = {
        id: uid("bounty"), raider: "You", raiderIsYou: true,
        target: target.wallet, targetIsYou: false,
        outcome: "loss", bid: amount, amount, bounty: amount, ts: now(),
      };
      return {
        ...prev,
        you: { ...prev.you, amount: round(prev.you.amount - amount) },
        stashes: prev.stashes.map((t) => t.id === targetId ? { ...t, bounty: round(t.bounty + amount) } : t),
        feed: [ev, ...prev.feed].slice(0, 40),
      };
    });
    return true;
  }, []);

  // ── Bot simulation (raids within tiers + raids on you) ────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const ts = now();
      setState((prev) => {
        let stashes = prev.stashes;
        const feed: RaidEvent[] = [];
        let totalBanked = prev.totalBanked;
        let biggestHeist = prev.biggestHeist;
        let you = prev.you;

        const raids = 1 + (Math.random() > 0.5 ? 1 : 0);
        for (let r = 0; r < raids; r++) {
          const open = stashes.filter((t) => ts >= t.shieldUntil);
          if (open.length < 2) break;
          const raider = open[Math.floor(Math.random() * open.length)];
          // same-tier targets only
          const ti = tierIndexForAmount(raider.amount);
          const targets = open.filter((t) => t.id !== raider.id && tierIndexForAmount(t.amount) === ti);
          if (targets.length === 0) continue;
          const target = targets[Math.floor(Math.random() * targets.length)];
          const bid = round(Math.min(maxBidFor(target.amount), tierForAmount(raider.amount).minBet * (2 + Math.random() * 10)));
          const won = Math.random() < winChance(bid, target.amount);
          const seizeG = seizeAmount(target.amount);

          if (won) {
            const net = round(seizeG * (1 - WAR_CONFIG.HOUSE_RAKE));
            const bountyNet = target.bounty > 0 ? round(target.bounty * (1 - WAR_CONFIG.HOUSE_RAKE)) : 0;
            stashes = stashes.map((t) => {
              if (t.id === target.id) return { ...t, amount: round(Math.max(t.amount - seizeG, 0.01)), bounty: 0, cracked: t.cracked + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
              if (t.id === raider.id) return { ...t, amount: round(t.amount + net + bountyNet) };
              return t;
            });
            biggestHeist = Math.max(biggestHeist, net + bountyNet);
            totalBanked = round(totalBanked + seizeG * WAR_CONFIG.HOUSE_RAKE + target.bounty * WAR_CONFIG.HOUSE_RAKE);
            feed.push({ id: uid("raid"), raider: raider.wallet, raiderIsYou: false, target: target.wallet, targetIsYou: false, outcome: "win", bid, amount: round(net + bountyNet), bounty: bountyNet || undefined, ts });
          } else {
            stashes = stashes.map((t) => t.id === target.id ? { ...t, banked: round(t.banked + bid * (1 - WAR_CONFIG.HOUSE_RAKE)), survived: t.survived + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS } : t);
            totalBanked = round(totalBanked + bid * WAR_CONFIG.HOUSE_RAKE);
            feed.push({ id: uid("raid"), raider: raider.wallet, raiderIsYou: false, target: target.wallet, targetIsYou: false, outcome: "loss", bid, amount: round(bid), ts });
          }
        }

        // A bot raids YOU (same tier, unshielded)
        if (you && ts >= you.shieldUntil && Math.random() < 0.5) {
          const ti = tierIndexForAmount(you.amount);
          const sameTier = stashes.filter((t) => tierIndexForAmount(t.amount) === ti);
          const attacker = sameTier[Math.floor(Math.random() * sameTier.length)];
          if (attacker) {
            const bid = round(Math.min(maxBidFor(you.amount), tierForAmount(you.amount).minBet * (2 + Math.random() * 10)));
            const won = Math.random() < winChance(bid, you.amount);
            const seizeG = seizeAmount(you.amount);
            if (won) {
              you = { ...you, amount: round(Math.max(you.amount - seizeG, 0.01)), cracked: you.cracked + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
              totalBanked = round(totalBanked + seizeG * WAR_CONFIG.HOUSE_RAKE);
              feed.push({ id: uid("raid"), raider: attacker.wallet, raiderIsYou: false, target: "You", targetIsYou: true, outcome: "win", bid, amount: round(seizeG * (1 - WAR_CONFIG.HOUSE_RAKE)), ts });
            } else {
              you = { ...you, banked: round(you.banked + bid * (1 - WAR_CONFIG.HOUSE_RAKE)), survived: you.survived + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
              totalBanked = round(totalBanked + bid * WAR_CONFIG.HOUSE_RAKE);
              feed.push({ id: uid("raid"), raider: attacker.wallet, raiderIsYou: false, target: "You", targetIsYou: true, outcome: "loss", bid, amount: round(bid), ts });
            }
          }
        }

        // Replenish drained stashes (respect their tier), drop the odd bounty in.
        stashes = stashes.map((t) => (t.amount < Math.max(0.05, tierForAmount(t.amount).min * 0.4) ? makeBotStash(tierForAmount(t.amount)) : t));
        if (Math.random() < 0.08) {
          const t = TIERS[Math.floor(Math.random() * TIERS.length)];
          const idx = stashes.findIndex((x) => !x.isYou);
          if (idx >= 0) stashes = stashes.map((x, i) => i === idx ? { ...x, bounty: round(x.bounty + t.minBet * (3 + Math.random() * 6)) } : x);
        }

        if (feed.length === 0) return prev;
        return { ...prev, stashes, you, feed: [...feed.reverse(), ...prev.feed].slice(0, 40), totalBanked, biggestHeist };
      });
    }, WAR_CONFIG.TICK_MS);

    return () => clearInterval(interval);
  }, []);

  return { state, openStash, closeStash, raid, placeBounty, repeatTaxMult };
}
