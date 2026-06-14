/**
 * YOINK.GG — Wallet Wars (flagship PvP) · "Siege the Vault" economy
 *
 * ECONOMY MODEL (Task 3 rework): asymmetric DEFENDER-vs-RAIDER.
 *   - A player OPENS A VAULT (their stash) and becomes a fee-earning TARGET —
 *     "the house at their own table". Every failed siege banks them a toll.
 *   - A RAIDER pays a small ATTEMPT FEE (a fraction of the target vault, NOT a
 *     matched wager). The fee is the ONLY thing risked per attempt.
 *   - A successful CRACK is low-probability (published per-tier win chance) and
 *     pays a partial SLICE of the target vault (~10× the fee). The vault is then
 *     shielded. On a loss the fee goes mostly to the defender, a cut to the house.
 *
 * NO SILENT FAILURES: `siege()` and `placeBounty()` return discriminated-union
 * resolutions (`SiegeResolution` / `BountyResolution`) carrying a typed,
 * ordered rejection reason — never a bare `null`/`false`. The UI surfaces the
 * reason instead of closing quietly.
 *
 * PROVABLY FAIR: every crack is derived from a revealed seed
 *   (roll = rollFromSeed(seed) ∈ [0,1); win iff roll < tier winChance). The seed
 *   is shown so the result is verifiable. Per-tier odds are FIXED & published
 *   within a tier (never varied by streak, heat, balance, or size).
 *
 * PURE MONEY MATH: every SOL-moving amount comes from `lib/siegeMath.ts` — the
 * engine performs no inline payout arithmetic. The stateful core is split into
 * pure, deterministic functions (`openVaultState`, `resolveSiege`,
 * `resolveBounty`, `cashOutState`, `withdrawBankedState`) that the React hook
 * wraps; this keeps the engine unit-testable without a DOM.
 *
 * `ESCROW_ENABLED` stays false: sieges route through `isEscrowLive()` (sim only).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { randomPoolWallet } from "@/lib/wallets";
import { isEscrowLive } from "@/lib/walletWarsChain";
import {
  tierParamsFor,
  feeMultiplierForStreak,
  computeFee,
  computePrize,
  heatScore,
  STREAK_CFG,
} from "@/lib/siegeMath";

export const WAR_CONFIG = {
  RAID_COOLDOWN_MS: 3_000,
  SHIELD_MS: 6_000,
  TICK_MS: 1_500,
  PER_TIER: 5,
  /** Repeat-target surcharge: + this × baseFee per prior siege within the window. */
  REPEAT_TAX_STEP: 0.3,
  REPEAT_TAX_CAP: 1.2,
  REPEAT_WINDOW_MS: 45_000,
  /**
   * Survival-streak ramp (m_k = 1 + step·min(streak, cap)), aligned with
   * `siegeMath.STREAK_CFG` so the engine and pure math agree; m ∈ [1.0, 2.0].
   */
  STREAK: { STEP: 0.04, CAP: 25 },
  /** Vault corpus never drops below this floor (anti double-spend / negative). */
  CORPUS_FLOOR: 0.01,
  /** Bounty v2 escrow window before an unclaimed bounty is refunded. */
  BOUNTY_EXPIRY_MS: 120_000,
  /** Small house fee withheld on a refunded (unclaimed) bounty. */
  BOUNTY_REFUND_FEE: 0.02,
} as const;

export interface Tier {
  id: string;
  label: string;
  min: number;
  max: number;
  accent: string;
  /** Minimum wager (table stakes) in this tier — retained for legacy UI copy. */
  minBet: number;
}

export const TIERS: Tier[] = [
  { id: "pit",   label: "The Pit",      min: 0.1, max: 1,        accent: "#7000FF", minBet: 0.02 },
  { id: "grind", label: "The Grind",    min: 1,   max: 5,        accent: "#00E676", minBet: 0.05 },
  { id: "arena", label: "The Arena",    min: 5,   max: 20,       accent: "#FFD700", minBet: 0.25 },
  { id: "court", label: "King's Court", min: 20,  max: Infinity, accent: "#FF2200", minBet: 1 },
];

/** Stake presets when opening a vault — one entry point per tier. */
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
 * economy). The corpus (`amount`) is what prizes are sliced from; `banked` is
 * the withdrawable/auto-compoundable fee pile.
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
  /** Auto-fold banked → amount on every settled siege. */
  compound: boolean;
  /** Community prize add-on (Bounty v2), escrowed separately from the corpus. */
  bountyPool: number;
  /** ms — bounty refund window. */
  bountyExpiry: number;
}

/**
 * Backward-compatible alias so existing references (`StashCard`,
 * `YourStashPanel`, `RaidModal`, `WalletWarsExtras`, …) keep compiling while the
 * full UI rename to "Vault" lands in Task 7.
 */
export type Stash = Vault;

export type SiegeOutcome = "win" | "loss";

/** A live event in the war feed (siege bounce/crack or a bounty refund). */
export interface RaidEvent {
  id: string;
  raider: string;
  raiderIsYou: boolean;
  target: string;
  targetIsYou: boolean;
  outcome: SiegeOutcome;
  /** win → raider net take; loss → defender banked toll; refund → amount back. */
  amount: number;
  /** Attempt fee paid (siege events). */
  fee?: number;
  /** Bounty net included on a winning crack. */
  bounty?: number;
  /** Event kind; defaults to a siege. */
  kind?: "siege" | "refund";
  ts: number;
}

/**
 * Outcome of a single SETTLED siege attempt. Returned (inside a `SiegeResolution`
 * with `ok: true`) by the engine's `siege` action. Carries everything an
 * observer needs to verify the provably-fair result.
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

/**
 * Ordered, TOTAL rejection reason for a declined siege. Precedence (the order in
 * which the engine checks preconditions):
 *   cooldown → shielded → self_siege → tier_mismatch → insufficient_funds
 * Returning a typed reason (never a bare `null`) is an explicit requirement so
 * the UI can never fail silently.
 */
export type SiegeRejection =
  | { kind: "cooldown"; remainingMs: number }
  | { kind: "shielded"; shieldRemainingMs: number }
  | { kind: "self_siege" }
  | { kind: "tier_mismatch"; yourTier: number; targetTier: number }
  | { kind: "insufficient_funds"; required: number; available: number };

export type SiegeResolution =
  | { ok: true; result: SiegeResult }
  | { ok: false; reason: SiegeRejection };

/** Typed rejection for a declined bounty placement (never a bare `false`). */
export type BountyRejection =
  | { kind: "invalid_amount" }
  | { kind: "below_tier_min"; tierMin: number; wouldLeave: number };

export type BountyResolution =
  | { ok: true }
  | { ok: false; reason: BountyRejection };

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
const now = () => Date.now();

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

/**
 * Provable-fairness verifier: recompute the outcome from the public seed and the
 * published per-tier win chance and confirm it matches the claimed outcome.
 * (Full UI surfacing is Task 5; defined here so the result shape is verifiable.)
 */
export function verifySiege(seed: string, pWin: number, claimedOutcome: SiegeOutcome): boolean {
  return (rollFromSeed(seed) < pWin) === (claimedOutcome === "win");
}

// ── Heat-sorted board ─────────────────────────────────────────────────────────

/** Sort vaults hottest-first (visibility only; never affects odds). */
export function sortByHeat(stashes: Stash[], at: number): Stash[] {
  return [...stashes].sort((a, b) => heatScore(b, at) - heatScore(a, at));
}

// ── Board generation ──────────────────────────────────────────────────────────

function amountInTier(t: Tier): number {
  const hi = t.max === Infinity ? t.min * 3.5 : t.max;
  return t.min + Math.random() * (hi - t.min);
}
function makeBotVault(tier: Tier, at: number): Stash {
  return {
    id: uid("vault"),
    wallet: randomPoolWallet(),
    isYou: false,
    amount: amountInTier(tier),
    banked: Math.random() * 0.4,
    survived: Math.floor(Math.random() * 12),
    cracked: Math.floor(Math.random() * 3),
    streak: Math.floor(Math.random() * STREAK_CFG.cap),
    openedAt: at - Math.floor(Math.random() * 1_800_000),
    shieldUntil: 0,
    seq: 0,
    compound: true,
    bountyPool: 0,
    bountyExpiry: 0,
  };
}
function seedBoard(at: number): Stash[] {
  const board = TIERS.flatMap((t) =>
    Array.from({ length: WAR_CONFIG.PER_TIER }, () => makeBotVault(t, at)),
  );
  return sortByHeat(board, at);
}

function initialState(): WarState {
  return {
    stashes: seedBoard(now()),
    you: null,
    feed: [],
    totalBanked: 1_284.6,
    biggestHeist: 12.4,
    raidCooldownUntil: 0,
  };
}

// ── Pure settlement core (shared by the player siege and the bot tick) ─────────

interface SettleOutput {
  raider: Vault;
  defender: Vault;
  /** SOL routed to the house this settlement (fee cut + repeat tax + prize/bounty rake). */
  houseDelta: number;
  /** Bounty pool consumed on a crack (0 on a loss) — used to clear the placer ledger. */
  bountyConsumed: number;
  result: SiegeResult;
}

/**
 * Settle one siege between a raider and a defender vault. PURE: every SOL amount
 * comes from `siegeMath`; no randomness, time, or storage is read here. The
 * caller supplies the provably-fair `roll` (and `seed` for the result) and the
 * settle-time clock `at`.
 */
function settleSiege(
  raider: Vault,
  defender: Vault,
  taxMult: number,
  roll: number,
  at: number,
  seed: string,
): SettleOutput {
  const params = tierParamsFor(defender.amount);
  const mult = feeMultiplierForStreak(defender.streak, STREAK_CFG);
  const feeB = computeFee(defender.amount, params, mult, taxMult);
  const won = roll < params.winChance;

  let raiderAmount = raider.amount - feeB.fee;
  let defenderBanked = defender.banked + feeB.toDefenderOnFail; // defender keeps the toll always
  let defenderCorpus = defender.amount;
  let houseDelta = feeB.toHouseOnFail; // ρ_fee·baseFee + full repeat tax
  let survived = defender.survived;
  let cracked = defender.cracked;
  let streak = defender.streak;
  let prizeGross = 0;
  let seized = 0;
  let lost = 0;
  let bountyConsumed = 0;

  if (won) {
    const prizeB = computePrize(defender.amount, params, mult); // gross ≤ corpus (siegeMath clamp)
    const bountyNet = defender.bountyPool * (1 - params.housePrizeRake);
    const bountyRake = defender.bountyPool * params.housePrizeRake;
    prizeGross = prizeB.gross;
    raiderAmount = raider.amount - feeB.fee + prizeB.toRaider + bountyNet;
    defenderCorpus = Math.max(defender.amount - prizeB.gross, WAR_CONFIG.CORPUS_FLOOR);
    houseDelta = prizeB.toHouse + feeB.toHouseOnFail + bountyRake;
    seized = prizeB.toRaider + bountyNet;
    cracked = defender.cracked + 1;
    streak = 0;
    bountyConsumed = defender.bountyPool;
  } else {
    lost = feeB.fee;
    survived = defender.survived + 1;
    streak = defender.streak + 1;
  }

  // Auto-compound: fold the defender's banked fees into the corpus (intra-actor,
  // so it never breaks conservation across raider/defender/house/corpus).
  if (defender.compound) {
    defenderCorpus = defenderCorpus + defenderBanked;
    defenderBanked = 0;
  }

  const newDefender: Vault = {
    ...defender,
    amount: defenderCorpus,
    banked: defenderBanked,
    survived,
    cracked,
    streak,
    bountyPool: won ? 0 : defender.bountyPool,
    bountyExpiry: won ? 0 : defender.bountyExpiry,
    shieldUntil: at + WAR_CONFIG.SHIELD_MS,
    seq: defender.seq + 1,
  };
  const newRaider: Vault = { ...raider, amount: raiderAmount };

  const result: SiegeResult = {
    outcome: won ? "win" : "loss",
    pWin: params.winChance,
    fee: feeB.fee,
    repeatTax: feeB.repeatTax,
    seized,
    prizeGross,
    lost,
    streakAtSiege: mult,
    targetWallet: defender.wallet,
    targetId: defender.id,
    yourVaultAfter: raiderAmount,
    roll,
    seed,
  };

  return { raider: newRaider, defender: newDefender, houseDelta, bountyConsumed, result };
}

function siegeFeedEvent(
  result: SiegeResult,
  raiderWallet: string,
  raiderIsYou: boolean,
  targetIsYou: boolean,
  defenderBankedToll: number,
  at: number,
): RaidEvent {
  return {
    id: uid("siege"),
    raider: raiderWallet,
    raiderIsYou,
    target: result.targetWallet,
    targetIsYou,
    outcome: result.outcome,
    // win → raider's net take; loss → the toll the defender just banked.
    amount: result.outcome === "win" ? result.seized : defenderBankedToll,
    fee: result.fee,
    kind: "siege",
    ts: at,
  };
}

// ── Pure state transitions (testable without React) ────────────────────────────

/** Seed a fresh engine state (exported for tests / migration fallback). */
export function createInitialState(): WarState {
  return initialState();
}

/**
 * Open the player's vault. Corpus = stake; the vault is marked `isYou`, all
 * counters reset, `openedAt` = now, `compound` on. The player's own vault is
 * stored separately from `stashes`, so it is never in the targetable board.
 */
export function openVaultState(state: WarState, amount: number, at: number): WarState {
  if (state.you) return state;
  const you: Vault = {
    id: uid("you"),
    wallet: "You",
    isYou: true,
    amount,
    banked: 0,
    survived: 0,
    cracked: 0,
    streak: 0,
    openedAt: at,
    shieldUntil: 0,
    seq: 0,
    compound: true,
    bountyPool: 0,
    bountyExpiry: 0,
  };
  return { ...state, you };
}

export interface SiegeContext {
  at: number;
  seed: string;
  taxMult: number;
}

/**
 * Resolve a player-initiated siege against `targetId`. PURE & deterministic: the
 * caller injects `at` (clock), `seed` (provably-fair), and `taxMult` (repeat tax).
 * Preconditions are checked in strict precedence order and return a typed
 * rejection with NO state change. On success the returned `state` reflects the
 * settled siege.
 */
export function resolveSiege(
  state: WarState,
  targetId: string,
  ctx: SiegeContext,
): { resolution: SiegeResolution; state: WarState } {
  const you = state.you;
  const reject = (reason: SiegeRejection) => ({ resolution: { ok: false as const, reason }, state });

  // Defensive: no open vault to siege from (UI gates this; keep total).
  if (!you) return reject({ kind: "insufficient_funds", required: 0, available: 0 });

  // 1. cooldown
  if (ctx.at < state.raidCooldownUntil) {
    return reject({ kind: "cooldown", remainingMs: state.raidCooldownUntil - ctx.at });
  }

  const target = state.stashes.find((t) => t.id === targetId);
  // Defensive: target no longer on the board — treat as unavailable (shielded 0).
  if (!target) return reject({ kind: "shielded", shieldRemainingMs: 0 });

  // 2. shielded
  if (ctx.at < target.shieldUntil) {
    return reject({ kind: "shielded", shieldRemainingMs: target.shieldUntil - ctx.at });
  }

  // 3. self-siege (own vault is never targetable, but guard defensively)
  if (target.id === you.id || target.isYou) {
    return reject({ kind: "self_siege" });
  }

  // 4. tier mismatch (same weight class only)
  const yourTier = tierIndexForAmount(you.amount);
  const targetTier = tierIndexForAmount(target.amount);
  if (yourTier !== targetTier) {
    return reject({ kind: "tier_mismatch", yourTier, targetTier });
  }

  // 5. affordability — fee is the only thing risked
  const params = tierParamsFor(target.amount);
  const mult = feeMultiplierForStreak(target.streak, STREAK_CFG);
  const feeB = computeFee(target.amount, params, mult, ctx.taxMult);
  if (feeB.fee > you.amount) {
    return reject({ kind: "insufficient_funds", required: feeB.fee, available: you.amount });
  }

  // Settle (sim path only while escrow is dormant).
  void isEscrowLive(); // single switch: false ⇒ local simulation, no real funds move
  const roll = rollFromSeed(ctx.seed);
  const out = settleSiege(you, target, ctx.taxMult, roll, ctx.at, ctx.seed);

  const event = siegeFeedEvent(out.result, you.wallet, true, false, feeB.toDefenderOnFail, ctx.at);
  if (out.result.outcome === "win" && out.bountyConsumed > 0) {
    event.bounty = out.bountyConsumed * (1 - params.housePrizeRake);
  }

  const newStashes = state.stashes.map((t) => (t.id === targetId ? out.defender : t));
  const newState: WarState = {
    ...state,
    you: out.raider,
    stashes: sortByHeat(newStashes, ctx.at),
    feed: [event, ...state.feed].slice(0, 40),
    totalBanked: state.totalBanked + out.houseDelta,
    biggestHeist:
      out.result.outcome === "win"
        ? Math.max(state.biggestHeist, out.result.seized)
        : state.biggestHeist,
    raidCooldownUntil: ctx.at + WAR_CONFIG.RAID_COOLDOWN_MS,
  };
  return { resolution: { ok: true, result: out.result }, state: newState };
}

/**
 * Place a Bounty v2 on `targetId`. The bounty is escrowed in the target's
 * `bountyPool` (separate from the target corpus, so it never moves the target
 * between tiers) and funded from the placer's corpus. Rejected if the amount is
 * invalid or would drop the placer below their current tier minimum.
 */
export function resolveBounty(
  state: WarState,
  targetId: string,
  amount: number,
  ctx: { at: number },
): { resolution: BountyResolution; state: WarState } {
  const you = state.you;
  const reject = (reason: BountyRejection) => ({ resolution: { ok: false as const, reason }, state });

  if (!you || !Number.isFinite(amount) || amount <= 0 || amount > you.amount) {
    return reject({ kind: "invalid_amount" });
  }
  const target = state.stashes.find((t) => t.id === targetId);
  if (!target) return reject({ kind: "invalid_amount" });

  const tierMin = TIERS[tierIndexForAmount(you.amount)].min;
  const wouldLeave = you.amount - amount;
  if (wouldLeave < tierMin) {
    return reject({ kind: "below_tier_min", tierMin, wouldLeave });
  }

  const newYou: Vault = { ...you, amount: wouldLeave };
  const newStashes = state.stashes.map((t) =>
    t.id === targetId
      ? { ...t, bountyPool: t.bountyPool + amount, bountyExpiry: ctx.at + WAR_CONFIG.BOUNTY_EXPIRY_MS }
      : t,
  );
  const event: RaidEvent = {
    id: uid("bounty"),
    raider: you.wallet,
    raiderIsYou: true,
    target: target.wallet,
    targetIsYou: false,
    outcome: "loss",
    amount,
    bounty: amount,
    kind: "siege",
    ts: ctx.at,
  };
  return {
    resolution: { ok: true },
    state: { ...state, you: newYou, stashes: newStashes, feed: [event, ...state.feed].slice(0, 40) },
  };
}

/** Cash out: realise corpus + banked fees, clear the player's vault (streak resets with it). */
export function cashOutState(state: WarState): { amount: number; state: WarState } {
  if (!state.you) return { amount: 0, state };
  const amount = state.you.amount + state.you.banked;
  return { amount, state: { ...state, you: null } };
}

/** Withdraw banked fees without growing (or closing) the corpus. */
export function withdrawBankedState(state: WarState): { amount: number; state: WarState } {
  if (!state.you || state.you.banked <= 0) return { amount: 0, state };
  const amount = state.you.banked;
  return { amount, state: { ...state, you: { ...state.you, banked: 0 } } };
}

// ── Persistence (STORAGE_KEY stays v3 for Task 3; v3→v4 migration is Task 4) ────

const STORAGE_KEY = "yoink_walletwars_v3";
interface PersistedWar { you: Stash | null; totalBanked: number; biggestHeist: number; }

/** Normalise a possibly-legacy persisted vault so missing fields never NaN the math. */
function normalizeVault(v: Partial<Vault> | null, at: number): Vault | null {
  if (!v) return null;
  return {
    id: v.id ?? uid("you"),
    wallet: v.wallet ?? "You",
    isYou: v.isYou ?? true,
    amount: Number.isFinite(v.amount) ? (v.amount as number) : 0,
    banked: Number.isFinite(v.banked) ? (v.banked as number) : 0,
    survived: v.survived ?? 0,
    cracked: v.cracked ?? 0,
    streak: v.streak ?? 0,
    openedAt: v.openedAt ?? at,
    shieldUntil: v.shieldUntil ?? 0,
    seq: v.seq ?? 0,
    compound: v.compound ?? true,
    bountyPool: v.bountyPool ?? 0,
    bountyExpiry: v.bountyExpiry ?? 0,
  };
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

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWalletWars() {
  const [state, setState] = useState<WarState>(() => {
    const base = initialState();
    const p = loadPersisted();
    if (!p) return base;
    return {
      ...base,
      you: normalizeVault(p.you as Partial<Vault> | null, Date.now()),
      totalBanked: p.totalBanked ?? base.totalBanked,
      biggestHeist: p.biggestHeist ?? base.biggestHeist,
    };
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Repeat-target siege log (timestamps per target) → escalating tax.
  const raidLog = useRef<Map<string, number[]>>(new Map());
  // Player bounty placements (targetId → placer vault id) for refund routing.
  const bountyPlacers = useRef<Map<string, string>>(new Map());

  useEffect(() => { savePersisted(state); }, [state.you, state.totalBanked, state.biggestHeist]);

  const repeatTaxMult = useCallback((targetId: string): number => {
    const ts = raidLog.current.get(targetId) ?? [];
    const recent = ts.filter((t) => now() - t < WAR_CONFIG.REPEAT_WINDOW_MS);
    return Math.min(WAR_CONFIG.REPEAT_TAX_CAP, recent.length * WAR_CONFIG.REPEAT_TAX_STEP);
  }, []);

  const openVault = useCallback((amount: number) => {
    setState((prev) => openVaultState(prev, amount, now()));
  }, []);

  const cashOut = useCallback((): number => {
    const { amount, state: next } = cashOutState(stateRef.current);
    bountyPlacers.current.clear();
    setState(next);
    return amount;
  }, []);

  const withdrawBanked = useCallback((): number => {
    const { amount, state: next } = withdrawBankedState(stateRef.current);
    if (amount > 0) setState(next);
    return amount;
  }, []);

  /** Siege a target. Returns a typed resolution — never a bare null. */
  const siege = useCallback((targetId: string): SiegeResolution => {
    const at = now();
    const seed = randomHex(16);
    const taxMult = repeatTaxMult(targetId);
    const { resolution, state: next } = resolveSiege(stateRef.current, targetId, { at, seed, taxMult });
    if (resolution.ok) {
      // Record the siege for repeat-tax accounting (outside the setState updater).
      const log = raidLog.current.get(targetId) ?? [];
      raidLog.current.set(targetId, [...log.filter((t) => at - t < WAR_CONFIG.REPEAT_WINDOW_MS), at]);
      if (resolution.result.outcome === "win") bountyPlacers.current.delete(targetId);
      setState(next);
    }
    return resolution;
  }, [repeatTaxMult]);

  /** Place a bounty. Returns a typed resolution — never a bare false. */
  const placeBounty = useCallback((targetId: string, amount: number): BountyResolution => {
    const at = now();
    const you = stateRef.current.you;
    const { resolution, state: next } = resolveBounty(stateRef.current, targetId, amount, { at });
    if (resolution.ok && you) {
      bountyPlacers.current.set(targetId, you.id);
      setState(next);
    }
    return resolution;
  }, []);

  // ── Bot simulation (siege semantics: fee paid, defender banks, corpus sliced) ──
  useEffect(() => {
    const interval = setInterval(() => {
      const ts = now();

      // Pre-compute expired-bounty refunds (placer ledger read read-only here).
      const cur = stateRef.current;
      const refundIds = new Set<string>();
      const refunds = cur.stashes
        .filter((v) => v.bountyPool > 0 && v.bountyExpiry > 0 && v.bountyExpiry <= ts)
        .map((v) => {
          const placerId = bountyPlacers.current.get(v.id) ?? null;
          const fee = v.bountyPool * WAR_CONFIG.BOUNTY_REFUND_FEE;
          refundIds.add(v.id);
          return { targetId: v.id, placerId, refund: v.bountyPool - fee, fee, eventId: uid("refund") };
        });

      setState((prev) => {
        let stashes = prev.stashes;
        let you = prev.you;
        let totalBanked = prev.totalBanked;
        let biggestHeist = prev.biggestHeist;
        const events: RaidEvent[] = [];

        const siegeCount = 1 + (Math.random() > 0.5 ? 1 : 0);
        for (let r = 0; r < siegeCount; r++) {
          const open = stashes.filter((t) => ts >= t.shieldUntil && t.amount > WAR_CONFIG.CORPUS_FLOOR);
          if (open.length < 2) break;
          const raider = open[Math.floor(Math.random() * open.length)];
          const ti = tierIndexForAmount(raider.amount);
          const targets = open.filter((t) => t.id !== raider.id && tierIndexForAmount(t.amount) === ti);
          if (targets.length === 0) continue;
          const target = targets[Math.floor(Math.random() * targets.length)];

          const params = tierParamsFor(target.amount);
          const mult = feeMultiplierForStreak(target.streak, STREAK_CFG);
          const feeB = computeFee(target.amount, params, mult, 0);
          if (feeB.fee > raider.amount) continue;

          const out = settleSiege(raider, target, 0, rollFromSeed(randomHex(8)), ts, "");
          stashes = stashes.map((t) =>
            t.id === raider.id ? out.raider : t.id === target.id ? out.defender : t,
          );
          totalBanked += out.houseDelta;
          if (out.result.outcome === "win") biggestHeist = Math.max(biggestHeist, out.result.seized);
          events.push(
            siegeFeedEvent(out.result, raider.wallet, false, false, feeB.toDefenderOnFail, ts),
          );
        }

        // A bot sieges YOU (same tier, unshielded).
        if (you && ts >= you.shieldUntil && you.amount > WAR_CONFIG.CORPUS_FLOOR && Math.random() < 0.5) {
          const ti = tierIndexForAmount(you.amount);
          const sameTier = stashes.filter((t) => tierIndexForAmount(t.amount) === ti && ts >= t.shieldUntil);
          const attacker = sameTier[Math.floor(Math.random() * sameTier.length)];
          if (attacker) {
            const params = tierParamsFor(you.amount);
            const mult = feeMultiplierForStreak(you.streak, STREAK_CFG);
            const feeB = computeFee(you.amount, params, mult, 0);
            if (feeB.fee <= attacker.amount) {
              const out = settleSiege(attacker, you, 0, rollFromSeed(randomHex(8)), ts, "");
              you = out.defender;
              stashes = stashes.map((t) => (t.id === attacker.id ? out.raider : t));
              totalBanked += out.houseDelta;
              events.push(
                siegeFeedEvent(out.result, attacker.wallet, false, true, feeB.toDefenderOnFail, ts),
              );
            }
          }
        }

        // Refund expired unclaimed bounties (placer minus a small house fee).
        if (refunds.length > 0) {
          stashes = stashes.map((t) =>
            refundIds.has(t.id) ? { ...t, bountyPool: 0, bountyExpiry: 0 } : t,
          );
          for (const rf of refunds) {
            totalBanked += rf.fee;
            let refundedTo = "house";
            if (rf.placerId && you && you.id === rf.placerId) {
              you = { ...you, amount: you.amount + rf.refund };
              refundedTo = you.wallet;
            } else if (rf.placerId) {
              const idx = stashes.findIndex((t) => t.id === rf.placerId);
              if (idx >= 0) {
                stashes = stashes.map((t, i) => (i === idx ? { ...t, amount: t.amount + rf.refund } : t));
                refundedTo = stashes[idx].wallet;
              } else {
                totalBanked += rf.refund; // placer gone → unclaimed bounty escheats to house
              }
            } else {
              totalBanked += rf.refund; // house-funded promo bounty returns to house
            }
            events.push({
              id: rf.eventId,
              raider: "House",
              raiderIsYou: false,
              target: refundedTo,
              targetIsYou: you ? refundedTo === you.wallet : false,
              outcome: "loss",
              amount: rf.refund,
              kind: "refund",
              ts,
            });
          }
        }

        // Occasionally seed a house-funded community bounty (no specific placer).
        if (Math.random() < 0.08) {
          const candidates = stashes.filter((t) => !t.isYou && t.bountyPool === 0);
          if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            const tier = tierForAmount(pick.amount);
            const amt = tier.minBet * (3 + Math.random() * 6);
            stashes = stashes.map((t) =>
              t.id === pick.id
                ? { ...t, bountyPool: t.bountyPool + amt, bountyExpiry: ts + WAR_CONFIG.BOUNTY_EXPIRY_MS }
                : t,
            );
          }
        }

        // Replenish depleted vaults so the board stays populated.
        stashes = stashes.map((t) =>
          t.amount < Math.max(WAR_CONFIG.CORPUS_FLOOR, tierForAmount(t.amount).min * 0.4) && !t.isYou
            ? makeBotVault(tierForAmount(t.amount), ts)
            : t,
        );

        // Hottest-first board sort (visibility only — never changes odds).
        stashes = sortByHeat(stashes, ts);

        const changed =
          events.length > 0 || stashes !== prev.stashes || you !== prev.you;
        if (!changed) return prev;
        return {
          ...prev,
          stashes,
          you,
          feed: [...events.reverse(), ...prev.feed].slice(0, 40),
          totalBanked,
          biggestHeist,
        };
      });

      // Clean up the placer ledger for refunded bounties (outside the updater).
      for (const id of refundIds) bountyPlacers.current.delete(id);
    }, WAR_CONFIG.TICK_MS);

    return () => clearInterval(interval);
  }, []);

  return { state, openVault, cashOut, withdrawBanked, siege, placeBounty, repeatTaxMult };
}
