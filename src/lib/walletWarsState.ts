/**
 * YOINK.GG — Wallet Wars (flagship PvP)
 *
 * FAIRNESS MODEL (the make-or-break decision): FIXED ODDS + MATCHED STAKES.
 *   - Every crack is a flat 50/50 — the SAME for a whale and a broke degen.
 *     A bigger balance never buys better odds. It only lets you wager more.
 *   - Matched stakes: you risk a WAGER. Win → you take that wager from them.
 *     Lose → they take it from you. You can only win what you dared to risk,
 *     so a small wallet cracking a whale is fair (no free lottery on the rich).
 *   - The house edge is ENTIRELY the rake on the transferred amount — never a
 *     whale odds advantage. Symmetric: both sides face the same expected rake.
 *
 * PROVABLY FAIR: each raid's outcome is derived from a revealed seed
 *   (roll = hash(seed) ∈ [0,1), win if roll < 0.5). The seed is shown so the
 *   result is verifiable. This is the honest sim of on-chain randomness;
 *   TRUE trustless VRF (Switchboard) still requires the deployed program
 *   (solana/programs/kings-bag — NOT deployed). Not faked.
 *
 * STRUCTURE: tiered boards (weight classes) so fights are same-size.
 * Whale safety: tiers + matched stakes + post-raid shields + repeat-target tax.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { randomPoolWallet } from "@/lib/wallets";

export const WAR_CONFIG = {
  HOUSE_RAKE: 0.15,
  /** Flat win chance for EVERY raid — identical for all players. */
  FIXED_WIN_CHANCE: 0.5,
  RAID_COOLDOWN_MS: 3_000,
  SHIELD_MS: 6_000,
  TICK_MS: 1_500,
  PER_TIER: 5,
  /** Repeat-target surcharge: + this × wager per prior raid within the window. */
  REPEAT_TAX_STEP: 0.3,
  REPEAT_TAX_CAP: 1.2,
  REPEAT_WINDOW_MS: 45_000,
  /**
   * Survival-streak ramp (m_k = 1 + step·min(streak, cap)), aligned with
   * `siegeMath.STREAK_CFG` so the engine and pure math agree. Used by the
   * Task 3 siege rework; m ∈ [1.0, 2.0].
   */
  STREAK: { STEP: 0.04, CAP: 25 },
} as const;

export interface Tier {
  id: string;
  label: string;
  min: number;
  max: number;
  accent: string;
  /** Minimum wager (table stakes) in this tier. */
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

/**
 * A Vault = a stash that is also a fee-earning "table" (the "Siege the Vault"
 * economy). Renamed from the former `Stash`; the new fields (`streak`,
 * `openedAt`, `seq`, `compound`, `bountyPool`, `bountyExpiry`) are introduced
 * here as additive state. The legacy `bounty` field is retained so the current
 * raid/bounty logic keeps compiling until the engine rework (Task 3).
 */
export interface Vault {
  id: string;
  wallet: string;
  isYou: boolean;
  /** V — the corpus (prize is sliced from this). */
  amount: number;
  /** Fees earned, withdrawable / auto-compoundable. */
  banked: number;
  /** Lifetime survived sieges. */
  survived: number;
  /** Lifetime cracks suffered. */
  cracked: number;
  /** k — consecutive survivals since last crack/cashout → m_k. */
  streak: number;
  /** ms — for the longevity leaderboard. */
  openedAt: number;
  shieldUntil: number;
  /** Optimistic-concurrency version (anti double-spend). */
  seq: number;
  /** Auto-fold banked → amount. */
  compound: boolean;
  /** Community prize add-on (Bounty v2). */
  bountyPool: number;
  /** ms — bounty refund window. */
  bountyExpiry: number;
  /** @deprecated Legacy single-bounty field; retained until the Task 3 rework. */
  bounty: number;
}

/**
 * Backward-compatible alias so existing references (`StashCard`,
 * `YourStashPanel`, `RaidModal`, `WalletWarsExtras`, …) keep compiling while the
 * engine migrates to the Vault model.
 */
export type Stash = Vault;

export type RaidOutcome = "win" | "loss";

export type SiegeOutcome = "win" | "loss";

export interface RaidEvent {
  id: string;
  raider: string;
  raiderIsYou: boolean;
  target: string;
  targetIsYou: boolean;
  outcome: RaidOutcome;
  bid: number;
  amount: number;
  bounty?: number;
  ts: number;
}

export interface RaidResult {
  outcome: RaidOutcome;
  pWin: number;
  /** The wager you risked. */
  bid: number;
  tax: number;
  /** Amount won (net of rake) on a win. */
  seized: number;
  bounty: number;
  forfeit: number;
  targetWallet: string;
  targetId: string;
  yourStashAfter: number;
  /** Provably-fair roll ∈ [0,1) and the seed it came from. */
  roll: number;
  seed: string;
}

/**
 * Outcome of a single siege attempt in the "Siege the Vault" economy. Returned
 * by the `siege` engine action (Task 3); defined here so callers and tests can
 * reference the shape ahead of the engine rework.
 */
export interface SiegeResult {
  outcome: SiegeOutcome;
  /** p — the published crack probability for the tier. */
  pWin: number;
  /** F — the attempt fee the raider paid (base + repeat tax). */
  fee: number;
  /** The repeat-target surcharge portion of the fee (routed 100% to house). */
  repeatTax: number;
  /** Prize net to the raider on a win (incl. bounty), else 0. */
  seized: number;
  /** s·V·m_k — the gross slice that left the corpus on a win, else 0. */
  prizeGross: number;
  /** The fee (+ tax) lost on a losing siege, else 0. */
  lost: number;
  /** m_k — the streak multiplier applied at siege time. */
  streakAtSiege: number;
  targetWallet: string;
  targetId: string;
  /** The raider's own vault corpus after the siege settled. */
  yourVaultAfter: number;
  /** Provably-fair roll ∈ [0,1). */
  roll: number;
  /** The seed revealed for verification. */
  seed: string;
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
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// ── Provably-fair primitives ──────────────────────────────────────────────────

function randomHex(bytes = 16): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(16).slice(2).padEnd(bytes * 2, "0");
}

/** Deterministic [0,1) from a seed — anyone can recompute it to verify. */
export function rollFromSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

// ── Pure helpers (shared with the UI) ─────────────────────────────────────────

/** Win chance — FIXED for everyone, regardless of balance or wager. */
export function winChance(): number {
  return WAR_CONFIG.FIXED_WIN_CHANCE;
}

/**
 * Largest wager allowed: you can't risk more than your stash (leaving room for
 * the repeat-tax) and you can't take more than the target actually holds.
 */
export function maxWagerFor(targetAmount: number, yourStash: number, taxMult = 0): number {
  return round(Math.max(0, Math.min(targetAmount, yourStash / (1 + taxMult))));
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
    streak: 0,
    openedAt: now(),
    shieldUntil: 0,
    seq: 0,
    compound: true,
    bountyPool: 0,
    bountyExpiry: 0,
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

const STORAGE_KEY = "yoink_walletwars_v3";
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

  const raidLog = useRef<Map<string, number[]>>(new Map());

  useEffect(() => { savePersisted(state); }, [state.you, state.totalBanked, state.biggestHeist]);

  const openStash = useCallback((amount: number) => {
    setState((prev) => prev.you ? prev : {
      ...prev,
      you: { id: uid("you"), wallet: "You", isYou: true, amount: round(amount), banked: 0, survived: 0, cracked: 0, streak: 0, openedAt: now(), shieldUntil: 0, seq: 0, compound: true, bountyPool: 0, bountyExpiry: 0, bounty: 0 },
    });
  }, []);

  const closeStash = useCallback(() => {
    setState((prev) => prev.you ? { ...prev, you: null } : prev);
  }, []);

  const repeatTaxMult = useCallback((targetId: string): number => {
    const ts = raidLog.current.get(targetId) ?? [];
    const recent = ts.filter((t) => now() - t < WAR_CONFIG.REPEAT_WINDOW_MS);
    return Math.min(WAR_CONFIG.REPEAT_TAX_CAP, recent.length * WAR_CONFIG.REPEAT_TAX_STEP);
  }, []);

  // ── Raid (fixed 50/50, matched stakes, provably-fair seed) ───────────────────
  const raid = useCallback((targetId: string, wagerRaw: number): RaidResult | null => {
    const s = stateRef.current;
    if (!s.you) return null;
    if (now() < s.raidCooldownUntil) return null;

    const target = s.stashes.find((t) => t.id === targetId);
    if (!target || now() < target.shieldUntil) return null;
    if (tierIndexForAmount(target.amount) !== tierIndexForAmount(s.you.amount)) return null;

    const tier   = tierForAmount(s.you.amount);
    const taxMult = repeatTaxMult(targetId);
    const maxW   = maxWagerFor(target.amount, s.you.amount, taxMult);
    const wager  = round(clamp(wagerRaw, tier.minBet, maxW));
    const tax    = round(wager * taxMult);
    if (wager <= 0 || wager + tax > s.you.amount) return null;

    // Provably-fair outcome.
    const seed = randomHex(16);
    const roll = rollFromSeed(seed);
    const won  = roll < WAR_CONFIG.FIXED_WIN_CHANCE;
    const ts   = now();

    const log = raidLog.current.get(targetId) ?? [];
    raidLog.current.set(targetId, [...log.filter((t) => ts - t < WAR_CONFIG.REPEAT_WINDOW_MS), ts]);

    const winNet    = round(wager * (1 - WAR_CONFIG.HOUSE_RAKE));
    const bountyNet = won && target.bounty > 0 ? round(target.bounty * (1 - WAR_CONFIG.HOUSE_RAKE)) : 0;

    const result: RaidResult = {
      outcome: won ? "win" : "loss",
      pWin: WAR_CONFIG.FIXED_WIN_CHANCE,
      bid: wager, tax,
      seized:  won ? winNet : 0,
      bounty:  bountyNet,
      forfeit: won ? 0 : winNet,
      targetWallet: target.wallet, targetId,
      yourStashAfter: 0,
      roll, seed,
    };

    setState((prev) => {
      if (!prev.you) return prev;
      const tgt = prev.stashes.find((t) => t.id === targetId);
      if (!tgt) return prev;

      const youAmt = won
        ? round(prev.you.amount - tax + winNet + bountyNet) // win: take matched wager (net) + bounty, pay tax
        : round(prev.you.amount - tax - wager);              // loss: forfeit your wager + tax
      const nextYou = { ...prev.you, amount: youAmt };
      result.yourStashAfter = youAmt;

      const stashes = prev.stashes.map((t) => {
        if (t.id !== targetId) return t;
        if (won) return { ...t, amount: round(Math.max(t.amount - wager, 0.01)), bounty: 0, cracked: t.cracked + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
        return { ...t, banked: round(t.banked + winNet), survived: t.survived + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
      });

      const event: RaidEvent = {
        id: uid("raid"), raider: "You", raiderIsYou: true,
        target: tgt.wallet, targetIsYou: false,
        outcome: won ? "win" : "loss", bid: wager,
        amount: won ? round(winNet + bountyNet) : round(wager),
        bounty: bountyNet || undefined, ts,
      };

      return {
        ...prev,
        you: nextYou,
        stashes,
        feed: [event, ...prev.feed].slice(0, 40),
        biggestHeist: won ? Math.max(prev.biggestHeist, winNet + bountyNet) : prev.biggestHeist,
        totalBanked: round(prev.totalBanked + wager * WAR_CONFIG.HOUSE_RAKE + (won ? tgt.bounty * WAR_CONFIG.HOUSE_RAKE : 0) + tax),
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

  // ── Bot simulation (matched-stakes, same tiers) ───────────────────────────────
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
          const ti = tierIndexForAmount(raider.amount);
          const targets = open.filter((t) => t.id !== raider.id && tierIndexForAmount(t.amount) === ti);
          if (targets.length === 0) continue;
          const target = targets[Math.floor(Math.random() * targets.length)];
          const wager = round(Math.min(maxWagerFor(target.amount, raider.amount), tierForAmount(raider.amount).minBet * (2 + Math.random() * 10)));
          if (wager <= 0) continue;
          const won = Math.random() < WAR_CONFIG.FIXED_WIN_CHANCE;
          const winNet = round(wager * (1 - WAR_CONFIG.HOUSE_RAKE));
          const bountyNet = won && target.bounty > 0 ? round(target.bounty * (1 - WAR_CONFIG.HOUSE_RAKE)) : 0;

          if (won) {
            stashes = stashes.map((t) => {
              if (t.id === target.id) return { ...t, amount: round(Math.max(t.amount - wager, 0.01)), bounty: 0, cracked: t.cracked + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
              if (t.id === raider.id) return { ...t, amount: round(t.amount + winNet + bountyNet) };
              return t;
            });
            biggestHeist = Math.max(biggestHeist, winNet + bountyNet);
            totalBanked = round(totalBanked + wager * WAR_CONFIG.HOUSE_RAKE + target.bounty * WAR_CONFIG.HOUSE_RAKE);
            feed.push({ id: uid("raid"), raider: raider.wallet, raiderIsYou: false, target: target.wallet, targetIsYou: false, outcome: "win", bid: wager, amount: round(winNet + bountyNet), bounty: bountyNet || undefined, ts });
          } else {
            stashes = stashes.map((t) => {
              if (t.id === target.id) return { ...t, banked: round(t.banked + winNet), survived: t.survived + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
              if (t.id === raider.id) return { ...t, amount: round(Math.max(t.amount - wager, 0.01)) };
              return t;
            });
            totalBanked = round(totalBanked + wager * WAR_CONFIG.HOUSE_RAKE);
            feed.push({ id: uid("raid"), raider: raider.wallet, raiderIsYou: false, target: target.wallet, targetIsYou: false, outcome: "loss", bid: wager, amount: round(wager), ts });
          }
        }

        // A bot raids YOU (same tier, unshielded)
        if (you && ts >= you.shieldUntil && Math.random() < 0.5) {
          const ti = tierIndexForAmount(you.amount);
          const sameTier = stashes.filter((t) => tierIndexForAmount(t.amount) === ti);
          const attacker = sameTier[Math.floor(Math.random() * sameTier.length)];
          if (attacker) {
            const wager = round(Math.min(maxWagerFor(you.amount, attacker.amount), tierForAmount(you.amount).minBet * (2 + Math.random() * 10)));
            if (wager > 0) {
              const won = Math.random() < WAR_CONFIG.FIXED_WIN_CHANCE; // attacker wins?
              const winNet = round(wager * (1 - WAR_CONFIG.HOUSE_RAKE));
              if (won) {
                you = { ...you, amount: round(Math.max(you.amount - wager, 0.01)), cracked: you.cracked + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
                feed.push({ id: uid("raid"), raider: attacker.wallet, raiderIsYou: false, target: "You", targetIsYou: true, outcome: "win", bid: wager, amount: round(wager), ts });
              } else {
                you = { ...you, banked: round(you.banked + winNet), survived: you.survived + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
                feed.push({ id: uid("raid"), raider: attacker.wallet, raiderIsYou: false, target: "You", targetIsYou: true, outcome: "loss", bid: wager, amount: round(wager), ts });
              }
              totalBanked = round(totalBanked + wager * WAR_CONFIG.HOUSE_RAKE);
            }
          }
        }

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
