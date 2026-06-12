/**
 * YOINK.GG — Wallet Wars
 *
 * The flagship PvP mode. Replaces Bid Wars.
 *
 * THE LOOP
 *   1. Open a STASH by staking SOL — it's your war chest AND the prize others want.
 *   2. RAID other players: commit a bid (muscle). Bigger bid = better odds.
 *   3. Win  → snatch a slice of their stash (capped, so nobody gets one-shot wiped).
 *      Lose → your bid is forfeited to the target (their "yield" for surviving).
 *   4. While your stash sits on the board, every failed raid on YOU banks fees.
 *
 * ECONOMICS (the money machine)
 *   - The house rakes a cut of EVERY raid outcome, win or lose. Always profitable.
 *   - Win odds:   P(win) = bid / (bid + defense), defense = stash × DEF_FACTOR.
 *     A small bid on a fat stash = lottery odds, jackpot reward (dopamine).
 *     A heavy bid on a small stash = grind odds, small reward.
 *   - Seize:      a fixed % of the target's stash on a win (capped — no wipes).
 *   - Survivors:  a failed raid's bid goes to the target (minus house rake).
 *
 * 100% player-funded — the house never seeds a thing. This is a faithful
 * client-side simulation; on-chain the roll uses the same VRF as the fuse.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { randomPoolWallet } from "@/lib/wallets";

export const WAR_CONFIG = {
  /** House cut on every raid outcome. */
  HOUSE_RAKE: 0.15,
  /** Fraction of a target's stash seized on a successful raid (the cap). */
  SEIZE_PCT: 0.25,
  /** Defence weighting — higher = harder to crack for a given bid. */
  DEF_FACTOR: 0.5,
  /** Stake tiers when opening a stash. */
  STASH_TIERS: [0.1, 0.25, 0.5, 1] as number[],
  /** Muscle presets for a raid bid. */
  BID_PRESETS: [0.02, 0.05, 0.1, 0.2] as number[],
  /** Your raid cooldown. */
  RAID_COOLDOWN_MS: 3_500,
  /** A stash is shielded briefly after being raided (anti chain-drain). */
  SHIELD_MS: 6_000,
  /** Bot simulation tick. */
  TICK_MS: 1_500,
  /** Reference bid used to display a stash "strength %". */
  REF_BID: 0.1,
  /** Board size kept populated with bot stashes. */
  BOARD_SIZE: 9,
} as const;

export interface Stash {
  id: string;
  wallet: string;
  isYou: boolean;
  /** Current stash value — the prize. */
  amount: number;
  /** Fees banked from failed raids on this stash. */
  banked: number;
  /** Failed raids this stash has survived. */
  survived: number;
  /** Times this stash has been cracked. */
  cracked: number;
  /** Timestamp until which this stash can't be raided. */
  shieldUntil: number;
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
  /** SOL moved: seized amount on a win, forfeited bid on a loss. */
  amount: number;
  ts: number;
}

export interface RaidResult {
  outcome: RaidOutcome;
  pWin: number;
  bid: number;
  /** Seized on win. */
  seized: number;
  /** Fee kept by the target on your loss (info only). */
  forfeit: number;
  targetWallet: string;
  targetId: string;
  /** Your stash value after the raid. */
  yourStashAfter: number;
}

export interface WarState {
  /** Bot-owned stashes on the board (never includes you). */
  stashes: Stash[];
  /** Your open stash, or null if you haven't staked. */
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

/** Plausible stash sizes for bots — most small, a few whales. */
function botStashAmount(): number {
  const r = Math.random();
  if (r < 0.6) return round(0.1 + Math.random() * 0.9);   // 0.1–1
  if (r < 0.9) return round(1 + Math.random() * 4);        // 1–5
  return round(5 + Math.random() * 15);                    // 5–20 whale
}

function makeBotStash(): Stash {
  return {
    id: uid("stash"),
    wallet: randomPoolWallet(),
    isYou: false,
    amount: botStashAmount(),
    banked: round(Math.random() * 0.4),
    survived: Math.floor(Math.random() * 12),
    cracked: Math.floor(Math.random() * 3),
    shieldUntil: 0,
  };
}

function seedBoard(): Stash[] {
  return Array.from({ length: WAR_CONFIG.BOARD_SIZE }, makeBotStash)
    .sort((a, b) => b.amount - a.amount);
}

const INITIAL: WarState = {
  stashes: seedBoard(),
  you: null,
  feed: [],
  totalBanked: 1_284.6,
  biggestHeist: 12.4,
  raidCooldownUntil: 0,
};

// ── Persistence — your stash + stats survive navigation/reload ────────────────
const STORAGE_KEY = "yoink_walletwars_v1";

interface PersistedWar {
  you: Stash | null;
  totalBanked: number;
  biggestHeist: number;
}

function loadPersisted(): PersistedWar | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedWar;
  } catch { /* ignore */ }
  return null;
}

function savePersisted(s: WarState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ you: s.you, totalBanked: s.totalBanked, biggestHeist: s.biggestHeist }),
    );
  } catch { /* ignore */ }
}

// ── Pure helpers (also used by the UI) ────────────────────────────────────────

/** Defence value of a stash. */
export function defenceOf(stashAmount: number): number {
  return round(stashAmount * WAR_CONFIG.DEF_FACTOR);
}

/** Win probability for a raid of `bid` against `stashAmount`. */
export function winChance(bid: number, stashAmount: number): number {
  const def = defenceOf(stashAmount);
  if (bid <= 0) return 0;
  return Math.min(0.95, Math.max(0.02, bid / (bid + def)));
}

/** SOL seized on a successful raid. */
export function seizeAmount(stashAmount: number): number {
  return round(stashAmount * WAR_CONFIG.SEIZE_PCT);
}

/** Display "strength %" for a stash on the board (survival vs a reference bid). */
export function stashStrengthPct(stashAmount: number): number {
  const def = defenceOf(stashAmount);
  return Math.round((def / (def + WAR_CONFIG.REF_BID)) * 100);
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

  // Persist your stash + stats whenever they change.
  useEffect(() => {
    savePersisted(state);
  }, [state.you, state.totalBanked, state.biggestHeist]);

  // ── Open a stash ─────────────────────────────────────────────────────────
  const openStash = useCallback((amount: number) => {
    setState((prev) => {
      if (prev.you) return prev;
      return {
        ...prev,
        you: {
          id: uid("you"),
          wallet: "You",
          isYou: true,
          amount: round(amount),
          banked: 0,
          survived: 0,
          cracked: 0,
          shieldUntil: 0,
        },
      };
    });
  }, []);

  // ── Close your stash (cash out stash + banked fees) ───────────────────────
  const closeStash = useCallback(() => {
    setState((prev) => (prev.you ? { ...prev, you: null } : prev));
  }, []);

  // ── Raid a target (computes the roll synchronously + returns the result) ──
  const raid = useCallback((targetId: string, bid: number): RaidResult | null => {
    const s = stateRef.current;
    if (!s.you) return null;
    if (now() < s.raidCooldownUntil) return null;
    if (bid <= 0 || bid > s.you.amount) return null;

    const target = s.stashes.find((t) => t.id === targetId);
    if (!target || now() < target.shieldUntil) return null;

    const pWin    = winChance(bid, target.amount);
    const won     = Math.random() < pWin;
    const seized  = seizeAmount(target.amount);
    const ts      = now();

    let result: RaidResult;

    setState((prev) => {
      if (!prev.you) return prev;
      const tgt = prev.stashes.find((t) => t.id === targetId);
      if (!tgt) return prev;

      let nextYou = { ...prev.you };
      let nextStashes = prev.stashes;
      let event: RaidEvent;
      let biggestHeist = prev.biggestHeist;

      if (won) {
        // Win: your bid is returned (collateral only) and you pocket the
        // seized slice minus the house rake.
        const net = round(seized * (1 - WAR_CONFIG.HOUSE_RAKE));
        nextYou.amount = round(prev.you.amount + net);
        nextStashes = prev.stashes.map((t) =>
          t.id === targetId
            ? { ...t, amount: round(Math.max(t.amount - seized, 0.01)), cracked: t.cracked + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS }
            : t,
        );
        biggestHeist = Math.max(biggestHeist, net);
        event = {
          id: uid("raid"), raider: "You", raiderIsYou: true,
          target: tgt.wallet, targetIsYou: false,
          outcome: "win", bid, amount: net, ts,
        };
      } else {
        // Bid forfeited — target banks it (minus house rake).
        const toTarget = round(bid * (1 - WAR_CONFIG.HOUSE_RAKE));
        nextYou.amount = round(prev.you.amount - bid);
        nextStashes = prev.stashes.map((t) =>
          t.id === targetId
            ? { ...t, banked: round(t.banked + toTarget), survived: t.survived + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS }
            : t,
        );
        event = {
          id: uid("raid"), raider: "You", raiderIsYou: true,
          target: tgt.wallet, targetIsYou: false,
          outcome: "loss", bid, amount: round(bid), ts,
        };
      }

      result = {
        outcome: won ? "win" : "loss",
        pWin, bid, seized: won ? round(seized * (1 - WAR_CONFIG.HOUSE_RAKE)) : 0,
        forfeit: won ? 0 : round(bid * (1 - WAR_CONFIG.HOUSE_RAKE)),
        targetWallet: tgt.wallet, targetId,
        yourStashAfter: nextYou.amount,
      };

      return {
        ...prev,
        you: nextYou,
        stashes: nextStashes,
        feed: [event, ...prev.feed].slice(0, 40),
        biggestHeist,
        raidCooldownUntil: ts + WAR_CONFIG.RAID_COOLDOWN_MS,
      };
    });

    // result is assigned synchronously inside the updater above
    return result!;
  }, []);

  // ── Bot simulation — bots raid each other + raid YOU ──────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const ts = now();
      setState((prev) => {
        let stashes = prev.stashes;
        const feed: RaidEvent[] = [];
        let totalBanked = prev.totalBanked;
        let biggestHeist = prev.biggestHeist;
        let you = prev.you;

        // 1–2 bot-vs-bot raids per tick for liveliness
        const raids = 1 + (Math.random() > 0.5 ? 1 : 0);
        for (let r = 0; r < raids; r++) {
          const open = stashes.filter((t) => ts >= t.shieldUntil);
          if (open.length < 2) break;
          const raider = open[Math.floor(Math.random() * open.length)];
          const targets = open.filter((t) => t.id !== raider.id);
          const target = targets[Math.floor(Math.random() * targets.length)];
          const bid = round(WAR_CONFIG.BID_PRESETS[Math.floor(Math.random() * WAR_CONFIG.BID_PRESETS.length)] * (1 + Math.random()));
          const won = Math.random() < winChance(bid, target.amount);
          const seized = seizeAmount(target.amount);

          if (won) {
            const net = round(seized * (1 - WAR_CONFIG.HOUSE_RAKE));
            stashes = stashes.map((t) => {
              if (t.id === target.id) return { ...t, amount: round(Math.max(t.amount - seized, 0.01)), cracked: t.cracked + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
              if (t.id === raider.id) return { ...t, amount: round(t.amount + net) };
              return t;
            });
            biggestHeist = Math.max(biggestHeist, net);
            totalBanked = round(totalBanked + seized * WAR_CONFIG.HOUSE_RAKE);
            feed.push({ id: uid("raid"), raider: raider.wallet, raiderIsYou: false, target: target.wallet, targetIsYou: false, outcome: "win", bid, amount: net, ts });
          } else {
            const toTarget = round(bid * (1 - WAR_CONFIG.HOUSE_RAKE));
            stashes = stashes.map((t) => (t.id === target.id ? { ...t, banked: round(t.banked + toTarget), survived: t.survived + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS } : t));
            totalBanked = round(totalBanked + bid * WAR_CONFIG.HOUSE_RAKE);
            feed.push({ id: uid("raid"), raider: raider.wallet, raiderIsYou: false, target: target.wallet, targetIsYou: false, outcome: "loss", bid, amount: round(bid), ts });
          }
        }

        // A bot raids YOUR stash (if open + unshielded)
        if (you && ts >= you.shieldUntil && Math.random() < 0.5) {
          const attacker = stashes[Math.floor(Math.random() * stashes.length)];
          const bid = round(WAR_CONFIG.BID_PRESETS[Math.floor(Math.random() * WAR_CONFIG.BID_PRESETS.length)] * (1 + Math.random()));
          const won = Math.random() < winChance(bid, you.amount);
          const seized = seizeAmount(you.amount);
          if (won) {
            you = { ...you, amount: round(Math.max(you.amount - seized, 0.01)), cracked: you.cracked + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
            feed.push({ id: uid("raid"), raider: attacker?.wallet ?? randomPoolWallet(), raiderIsYou: false, target: "You", targetIsYou: true, outcome: "win", bid, amount: round(seized * (1 - WAR_CONFIG.HOUSE_RAKE)), ts });
          } else {
            const banked = round(bid * (1 - WAR_CONFIG.HOUSE_RAKE));
            you = { ...you, banked: round(you.banked + banked), survived: you.survived + 1, shieldUntil: ts + WAR_CONFIG.SHIELD_MS };
            feed.push({ id: uid("raid"), raider: attacker?.wallet ?? randomPoolWallet(), raiderIsYou: false, target: "You", targetIsYou: true, outcome: "loss", bid, amount: round(bid), ts });
          }
        }

        // Replenish the board: replace any stash that's been drained too low
        stashes = stashes.map((t) => (t.amount < 0.05 ? makeBotStash() : t));
        // Occasionally rotate in a fresh whale for variety
        if (Math.random() < 0.06) {
          stashes = [...stashes.slice(1), makeBotStash()];
        }

        if (feed.length === 0) return prev;
        return {
          ...prev,
          stashes,
          you,
          feed: [...feed.reverse(), ...prev.feed].slice(0, 40),
          totalBanked,
          biggestHeist,
        };
      });
    }, WAR_CONFIG.TICK_MS);

    return () => clearInterval(interval);
  }, []);

  return { state, openStash, closeStash, raid };
}
