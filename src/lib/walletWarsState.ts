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
  vaultParamsFor,
  feeMultiplierForStreak,
  computeFee,
  computePrize,
  heatScore,
  STREAK_CFG,
  type RiskProfile,
  DEFAULT_RISK_PROFILE,
  isRiskProfile,
} from "@/lib/siegeMath";
import {
  guaranteedActivityTargets,
  lastActivityFromShield,
  GUARANTEED_ACTIVITY_MS,
} from "@/lib/walletWarsActivity";

export const WAR_CONFIG = {
  RAID_COOLDOWN_MS: 3_000,
  SHIELD_MS: 6_000,
  TICK_MS: 3_500,
  PER_TIER: 5,
  /**
   * Ambient bot cadence (FEEL ONLY — never affects odds or payouts). These gate
   * HOW OFTEN a simulated siege happens; every event that does occur is still
   * settled by the unchanged `settleSiege`/`siegeMath` path, so EV/odds per
   * event are identical.
   */
  BOT_SIEGES_PER_TICK: 1,     // was effectively 1–2 (1 + coinflip)
  BOT_TICK_ACTIVITY: 0.7,     // probability a given tick runs any ambient siege
  BOT_SIEGE_YOU_CHANCE: 0.22, // was 0.5 — being raided is a notable beat, not constant
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
  /**
   * Lifetime tolls banked, monotonic; incremented by `toDefenderOnFail` on every
   * settled siege (win AND loss). NEVER zeroed by auto-compounding or by
   * `withdrawBankedState`, and EXCLUDED from cash-out. Display only — moves no
   * SOL, so it never affects conservation or the money math.
   */
  feesEarned: number;
  /** Community prize add-on (Bounty v2), escrowed separately from the corpus. */
  bountyPool: number;
  /** ms — bounty refund window. */
  bountyExpiry: number;
  /**
   * Published, IMMUTABLE risk profile chosen at open time (Variable-Risk
   * Vaults). Selects this vault's fixed crack odds `p'` and the
   * defender-EV-preserving fee `f'`. Never mutated after creation; defaults to
   * `"standard"` (the base-tier identity) for migrated/legacy vaults.
   */
  riskProfile: RiskProfile;
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
  /**
   * Marks ambient / guaranteed-activity events generated by the simulation
   * layer (vs. a siege the player personally initiated). All Wallet Wars
   * activity is simulated on devnet; this flag lets the war feed transparently
   * tag the auto-generated baseline activity with a subtle indicator. Optional +
   * defaults to undefined (treated as not-simulated) for back-compat.
   */
  simulated?: boolean;
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
 * Provable-fairness verifier (Task 5): recompute the outcome from the public
 * seed and the published per-tier win chance and confirm it matches the claimed
 * outcome. Returns true iff `(rollFromSeed(seed) < pWin) === (claimed === "win")`.
 * The per-tier `pWin` is fixed & published (never varied by streak/heat/size), so
 * any observer can recompute a siege from the `seed`/`roll`/`pWin` on its result.
 */
export function verifySiege(seed: string, pWin: number, claimedOutcome: SiegeOutcome): boolean {
  return (rollFromSeed(seed) < pWin) === (claimedOutcome === "win");
}

// ── Heat-sorted board ─────────────────────────────────────────────────────────

/** Sort vaults hottest-first (visibility only; never affects odds). */
export function sortByHeat(stashes: Stash[], at: number): Stash[] {
  return [...stashes].sort((a, b) => heatScore(b, at) - heatScore(a, at));
}

/**
 * Pure board transition: re-rank the visible board by heat at `at`. A PERMUTATION
 * ONLY — the same multiset of vault ids is returned, with no vault created,
 * destroyed, or economically mutated. Called only at explicit ranking moments
 * (mount / Re-rank / open / cashout) so the board holds position between them.
 */
export function resortBoard(state: WarState, at: number): WarState {
  return { ...state, stashes: sortByHeat(state.stashes, at) };
}

// ── Board generation ──────────────────────────────────────────────────────────

function amountInTier(t: Tier): number {
  const hi = t.max === Infinity ? t.min * 3.5 : t.max;
  return t.min + Math.random() * (hi - t.min);
}

/**
 * Draw a risk profile from a weighted spread spanning all three profiles so the
 * board demonstrates the full range of risk choices (Requirement 12.1). Weights:
 * Fortified 0.34 · Standard 0.40 · Exposed 0.26.
 */
function randomRiskProfile(): RiskProfile {
  const r = Math.random();
  if (r < 0.34) return "fortified";
  if (r < 0.74) return "standard";
  return "exposed";
}

function makeBotVault(tier: Tier, at: number): Stash {
  const amount = amountInTier(tier);
  const survived = Math.floor(Math.random() * 12);
  // Realistic accumulated banked so the board reads as ALIVE, not "0.00"
  // everywhere (Requirement 16.1): roughly a tier-fee toll per survived siege.
  const banked = +(survived * amount * 0.012 * (0.6 + Math.random() * 0.8) + 0.01).toFixed(4);
  return {
    id: uid("vault"),
    wallet: randomPoolWallet(),
    isYou: false,
    amount,
    banked,
    survived,
    cracked: Math.floor(Math.random() * 3),
    streak: Math.floor(Math.random() * STREAK_CFG.cap),
    openedAt: at - Math.floor(Math.random() * 1_800_000),
    shieldUntil: 0,
    seq: 0,
    compound: false,
    bountyPool: 0,
    bountyExpiry: 0,
    riskProfile: randomRiskProfile(),
    // Seed lifetime fees from the already-accumulated banked so a freshly-seeded
    // bot reads as having earned tolls over its life (display only).
    feesEarned: banked,
  };
}
function seedBoard(at: number): Stash[] {
  const board = TIERS.flatMap((t) =>
    Array.from({ length: WAR_CONFIG.PER_TIER }, () => makeBotVault(t, at)),
  );
  return sortByHeat(board, at);
}

/** Seeded house treasury / hall-of-fame defaults for a fresh (or migrated) state. */
const SEED_TOTAL_BANKED = 1_284.6;
const SEED_BIGGEST_HEIST = 12.4;

function initialState(): WarState {
  return {
    stashes: seedBoard(now()),
    you: null,
    feed: [],
    totalBanked: SEED_TOTAL_BANKED,
    biggestHeist: SEED_BIGGEST_HEIST,
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
  const params = vaultParamsFor(defender.amount, defender.riskProfile);
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
    // Lifetime tolls: defender keeps `toDefenderOnFail` on EVERY settled siege
    // (win and loss). Monotonic; independent of the compound fold above.
    feesEarned: defender.feesEarned + feeB.toDefenderOnFail,
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
  simulated = false,
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
    simulated,
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
 *
 * The chosen `profile` is published on the vault and IMMUTABLE for its lifetime
 * (Variable-Risk Vaults). It defaults to `"standard"` (the base-tier identity)
 * so existing call-sites and migrated saves behave exactly as today.
 */
export function openVaultState(
  state: WarState,
  amount: number,
  profile: RiskProfile = DEFAULT_RISK_PROFILE,
  at: number = now(),
): WarState {
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
    compound: false,
    bountyPool: 0,
    bountyExpiry: 0,
    riskProfile: isRiskProfile(profile) ? profile : DEFAULT_RISK_PROFILE,
    feesEarned: 0,
  };
  // Opening is an explicit focus change → present a fresh heat ranking, then hold.
  return { ...state, you, stashes: sortByHeat(state.stashes, at) };
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

  // 5. affordability — fee is the only thing risked. Use the target vault's
  // profile-resolved params so the gate + feed toll match the settlement core.
  const params = vaultParamsFor(target.amount, target.riskProfile);
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
    // Update the sieged target in place — the board does NOT reshuffle when the
    // player acts. Re-ranking happens only at explicit moments (mount / Re-rank /
    // open / cashout) so cards hold position while being read.
    stashes: newStashes,
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
export function cashOutState(state: WarState, at: number = now()): { amount: number; state: WarState } {
  if (!state.you) return { amount: 0, state };
  // Cash-out value is corpus + banked ONLY — `feesEarned` is a display-only
  // lifetime counter and is deliberately excluded (no double-counting).
  const amount = state.you.amount + state.you.banked;
  // Closing the vault is an explicit focus change → re-rank the board, then hold.
  return { amount, state: { ...state, you: null, stashes: sortByHeat(state.stashes, at) } };
}

/** Withdraw banked fees without growing (or closing) the corpus. */
export function withdrawBankedState(state: WarState): { amount: number; state: WarState } {
  if (!state.you || state.you.banked <= 0) return { amount: 0, state };
  const amount = state.you.banked;
  return { amount, state: { ...state, you: { ...state.you, banked: 0 } } };
}

/** Toggle the player's auto-compound flag (folds banked → corpus on settle). */
export function setCompoundState(state: WarState, compound: boolean): WarState {
  if (!state.you || state.you.compound === compound) return state;
  return { ...state, you: { ...state.you, compound } };
}

/**
 * Change the ACTIVE player vault's risk profile (Vault Lord terminal control).
 * Takes effect on the next siege — settlement always resolves a vault's params
 * via `vaultParamsFor(amount, riskProfile)` at siege time, so updating this
 * field now simply selects the published κ for subsequent sieges.
 *
 * IMPORTANT: this touches NO economy math. The κ multipliers, the
 * defender-EV-preserving fee derivation, the published per-tier odds, and the
 * provably-fair roll all live (frozen) in `siegeMath.ts`. Because every profile
 * holds defender EV constant by construction, switching is EV-neutral — it only
 * trades variance (how often you're cracked vs. how big a toll per survival).
 * The settlement-immutability invariant is unchanged: no siege ever mutates the
 * profile; only this explicit owner action does.
 */
export function setRiskProfileState(state: WarState, profile: RiskProfile): WarState {
  if (!state.you) return state;
  const next = isRiskProfile(profile) ? profile : DEFAULT_RISK_PROFILE;
  if (state.you.riskProfile === next) return state;
  return { ...state, you: { ...state.you, riskProfile: next } };
}

// ── Persistence (Task 4: v3 → v4 migration) ───────────────────────────────────

/** Current persisted schema key. */
const STORAGE_KEY = "yoink_walletwars_v4";
/** Legacy schema key migrated forward on first v4 load. */
const LEGACY_STORAGE_KEY_V3 = "yoink_walletwars_v3";

interface PersistedWar { you: Vault | null; totalBanked: number; biggestHeist: number; }

/**
 * The minimal storage surface the loader needs. Injecting it (rather than
 * touching the global `localStorage` directly) keeps `loadWarFromStorage`
 * pure-ish and unit-testable, and lets the hook pass `null` when storage is
 * unavailable so the session simply runs in memory (Requirement 23.5).
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Read `localStorage` defensively — returns null if it is absent or throws. */
function safeLocalStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== "undefined" && localStorage) return localStorage;
  } catch { /* access itself can throw in sandboxed/blocked contexts */ }
  return null;
}

const fin = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** Normalise a possibly-legacy persisted vault so missing fields never NaN the math. */
function normalizeVault(v: Partial<Vault> | null, at: number): Vault | null {
  if (!v || typeof v !== "object") return null;
  return {
    id: typeof v.id === "string" && v.id.length > 0 ? v.id : uid("you"),
    wallet: typeof v.wallet === "string" && v.wallet.length > 0 ? v.wallet : "You",
    isYou: typeof v.isYou === "boolean" ? v.isYou : true,
    amount: Math.max(0, fin(v.amount, 0)),
    banked: Math.max(0, fin(v.banked, 0)),
    survived: Math.max(0, fin(v.survived, 0)),
    cracked: Math.max(0, fin(v.cracked, 0)),
    streak: Math.max(0, fin(v.streak, 0)),
    openedAt: fin(v.openedAt, at),
    shieldUntil: fin(v.shieldUntil, 0),
    seq: Math.max(0, fin(v.seq, 0)),
    compound: typeof v.compound === "boolean" ? v.compound : true,
    bountyPool: Math.max(0, fin(v.bountyPool, 0)),
    bountyExpiry: fin(v.bountyExpiry, 0),
    // Lifetime fees: default to the stored banked when absent (a reasonable
    // lower bound), else 0 — never NaN. Display only; never affects money math.
    feesEarned: Math.max(0, fin(v.feesEarned, Math.max(0, fin(v.banked, 0)))),
    // Variable-Risk Vaults: default a missing/invalid profile to Standard (the
    // base-tier identity) so legacy/normalised vaults keep today's economics.
    riskProfile: isRiskProfile(v.riskProfile) ? v.riskProfile : DEFAULT_RISK_PROFILE,
  };
}

/**
 * Map a legacy `yoink_walletwars_v3` record to the v4 `PersistedWar` shape
 * (Requirement 23.1–23.2). Each legacy `Stash` becomes a `Vault`: `streak`,
 * `seq`, and `bountyExpiry` reset to 0, `compound` enabled, `openedAt` set to
 * `at`, and the prior `bounty` carried over as the `bountyPool`. The corpus
 * `amount`, `banked`, house `totalBanked`, and `biggestHeist` are preserved.
 * Pure & total: any malformed input degrades to the seeded defaults.
 */
export function migrateV3ToV4(raw: unknown, at: number): PersistedWar {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const youRaw =
    rec.you && typeof rec.you === "object" ? (rec.you as Record<string, unknown>) : null;

  let you: Vault | null = null;
  if (youRaw) {
    const priorBounty = fin(youRaw.bounty ?? youRaw.bountyPool, 0);
    you = {
      id: typeof youRaw.id === "string" ? youRaw.id : uid("you"),
      wallet: typeof youRaw.wallet === "string" ? youRaw.wallet : "You",
      isYou: true,
      amount: fin(youRaw.amount, 0),
      banked: fin(youRaw.banked, 0),
      survived: fin(youRaw.survived, 0),
      cracked: fin(youRaw.cracked, 0),
      streak: 0,
      openedAt: at,
      shieldUntil: 0,
      seq: 0,
      compound: true,
      bountyPool: priorBounty,
      bountyExpiry: 0,
      // Legacy v3 vaults predate the lifetime-fees counter → seed from banked
      // (a safe lower bound), never NaN.
      feesEarned: Math.max(0, fin(youRaw.feesEarned, Math.max(0, fin(youRaw.banked, 0)))),
      // Legacy v3 vaults predate risk profiles → default to Standard (identity),
      // honouring any already-valid profile carried on the record.
      riskProfile: isRiskProfile(youRaw.riskProfile) ? youRaw.riskProfile : DEFAULT_RISK_PROFILE,
    };
  }

  return {
    you,
    totalBanked: fin(rec.totalBanked, SEED_TOTAL_BANKED),
    biggestHeist: fin(rec.biggestHeist, SEED_BIGGEST_HEIST),
  };
}

/**
 * Load persisted war state, migrating `v3 → v4` on first encounter. Returns the
 * loaded `PersistedWar` or `null` when nothing valid is stored (the caller then
 * falls back to the seeded `INITIAL` state — Requirement 23.4). When `storage`
 * is `null` (unavailable), returns `null` without throwing (Requirement 23.5).
 */
export function loadWarFromStorage(storage: StorageLike | null, at: number): PersistedWar | null {
  if (!storage) return null;

  // 1. Prefer the current v4 record.
  try {
    const rawV4 = storage.getItem(STORAGE_KEY);
    if (rawV4) {
      const parsed = JSON.parse(rawV4) as Partial<PersistedWar>;
      return {
        you: normalizeVault((parsed.you ?? null) as Partial<Vault> | null, at),
        totalBanked: fin(parsed.totalBanked, SEED_TOTAL_BANKED),
        biggestHeist: fin(parsed.biggestHeist, SEED_BIGGEST_HEIST),
      };
    }
  } catch { /* corrupt v4 → try a legacy record, then fall back to seeded */ }

  // 2. Migrate a legacy v3 record forward and write it back under v4.
  try {
    const rawV3 = storage.getItem(LEGACY_STORAGE_KEY_V3);
    if (rawV3) {
      const migrated = migrateV3ToV4(JSON.parse(rawV3), at);
      try { storage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch { /* ignore */ }
      return migrated;
    }
  } catch { /* corrupt v3 → seeded fallback */ }

  return null;
}

function savePersisted(s: WarState): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ you: s.you, totalBanked: s.totalBanked, biggestHeist: s.biggestHeist }),
    );
  } catch { /* ignore */ }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWalletWars() {
  const [state, setState] = useState<WarState>(() => {
    const base = initialState();
    // Fully defensive: a malformed/legacy persisted record must never throw on
    // mount and white-screen the app — fall back to the seeded INITIAL state.
    try {
      const p = loadWarFromStorage(safeLocalStorage(), Date.now());
      if (!p) return base;
      return {
        ...base,
        you: p.you,
        totalBanked: Number.isFinite(p.totalBanked) ? p.totalBanked : base.totalBanked,
        biggestHeist: Number.isFinite(p.biggestHeist) ? p.biggestHeist : base.biggestHeist,
      };
    } catch {
      return base;
    }
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

  const openVault = useCallback((amount: number, profile: RiskProfile = DEFAULT_RISK_PROFILE) => {
    setState((prev) => openVaultState(prev, amount, profile, now()));
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

  /** Toggle auto-compounding of banked fees into the corpus (Requirement 11.1). */
  const setCompound = useCallback((compound: boolean) => {
    setState((prev) => setCompoundState(prev, compound));
  }, []);

  /**
   * Change the active vault's risk profile (Vault Lord terminal). Takes effect
   * on the next siege. Economy-neutral: settlement reads the profile's published
   * κ via `vaultParamsFor` at siege time; no economy math changes here.
   */
  const setRiskProfile = useCallback((profile: RiskProfile) => {
    setState((prev) => setRiskProfileState(prev, profile));
  }, []);

  /**
   * Re-rank the visible board by heat NOW (explicit "Re-rank board" affordance).
   * A permutation only — no vault is mutated. The board otherwise holds position.
   */
  const resortBoardAction = useCallback(() => {
    setState((prev) => resortBoard(prev, now()));
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
      // Defensive: an uncaught throw inside a timer escapes React's error
      // boundaries and can crash the whole tab/PWA. A single bad tick must
      // never take down the app — log and skip to the next tick instead.
      try {
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

        // Ambient cadence (feel only): ~BOT_TICK_ACTIVITY chance to run
        // BOT_SIEGES_PER_TICK ambient siege(s). Each settled siege still routes
        // through the unchanged settleSiege/siegeMath path (odds/EV unchanged).
        const siegeCount =
          Math.random() < WAR_CONFIG.BOT_TICK_ACTIVITY ? WAR_CONFIG.BOT_SIEGES_PER_TICK : 0;
        for (let r = 0; r < siegeCount; r++) {
          const open = stashes.filter((t) => ts >= t.shieldUntil && t.amount > WAR_CONFIG.CORPUS_FLOOR);
          if (open.length < 2) break;
          const raider = open[Math.floor(Math.random() * open.length)];
          const ti = tierIndexForAmount(raider.amount);
          const targets = open.filter((t) => t.id !== raider.id && tierIndexForAmount(t.amount) === ti);
          if (targets.length === 0) continue;
          const target = targets[Math.floor(Math.random() * targets.length)];

          const params = vaultParamsFor(target.amount, target.riskProfile);
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
            siegeFeedEvent(out.result, raider.wallet, false, false, feeB.toDefenderOnFail, ts, true),
          );
        }

        // A bot sieges YOU (same tier, unshielded) — a notable beat, not constant.
        if (you && ts >= you.shieldUntil && you.amount > WAR_CONFIG.CORPUS_FLOOR && Math.random() < WAR_CONFIG.BOT_SIEGE_YOU_CHANCE) {
          const ti = tierIndexForAmount(you.amount);
          const sameTier = stashes.filter((t) => tierIndexForAmount(t.amount) === ti && ts >= t.shieldUntil);
          const attacker = sameTier[Math.floor(Math.random() * sameTier.length)];
          if (attacker) {
            const params = vaultParamsFor(you.amount, you.riskProfile);
            const mult = feeMultiplierForStreak(you.streak, STREAK_CFG);
            const feeB = computeFee(you.amount, params, mult, 0);
            if (feeB.fee <= attacker.amount) {
              const out = settleSiege(attacker, you, 0, rollFromSeed(randomHex(8)), ts, "");
              you = out.defender;
              stashes = stashes.map((t) => (t.id === attacker.id ? out.raider : t));
              totalBanked += out.houseDelta;
              events.push(
                siegeFeedEvent(out.result, attacker.wallet, false, true, feeB.toDefenderOnFail, ts, true),
              );
            }
          }
        }

        // ── Daily guaranteed-activity layer ──────────────────────────────────
        // Any vault that has gone quiet past GUARANTEED_ACTIVITY_MS receives a
        // simulated siege so lords always earn a baseline of tolls and the war
        // feed never flatlines on a quiet day. "Last activity" is derived purely
        // from each vault's shield stamp (no side-channel). All Wallet Wars
        // activity is already simulated on devnet — every settled siege still
        // routes through the unchanged settleSiege/siegeMath path, so odds/EV
        // are identical; these events are simply tagged `simulated` for the feed.
        {
          const lastActivity = new Map(
            stashes.map((t) => [t.id, lastActivityFromShield(t.shieldUntil, t.openedAt, WAR_CONFIG.SHIELD_MS)] as const),
          );
          const idleIds = guaranteedActivityTargets(stashes, lastActivity, ts, GUARANTEED_ACTIVITY_MS, 2);
          for (const idleId of idleIds) {
            const target = stashes.find((t) => t.id === idleId);
            if (!target || ts < target.shieldUntil || target.amount <= WAR_CONFIG.CORPUS_FLOOR) continue;
            const ti = tierIndexForAmount(target.amount);
            const raiders = stashes.filter(
              (t) => t.id !== target.id && tierIndexForAmount(t.amount) === ti && ts >= t.shieldUntil,
            );
            if (raiders.length === 0) continue;
            const raider = raiders[Math.floor(Math.random() * raiders.length)];
            const params = vaultParamsFor(target.amount, target.riskProfile);
            const mult = feeMultiplierForStreak(target.streak, STREAK_CFG);
            const feeB = computeFee(target.amount, params, mult, 0);
            if (feeB.fee > raider.amount) continue;
            const out = settleSiege(raider, target, 0, rollFromSeed(randomHex(8)), ts, "");
            stashes = stashes.map((t) =>
              t.id === raider.id ? out.raider : t.id === target.id ? out.defender : t,
            );
            totalBanked += out.houseDelta;
            if (out.result.outcome === "win") biggestHeist = Math.max(biggestHeist, out.result.seized);
            events.push(siegeFeedEvent(out.result, raider.wallet, false, false, feeB.toDefenderOnFail, ts, true));
          }

          // Your vault also gets the guarantee: if it has gone quiet past the
          // threshold and is unshielded, a simulated raider bounces off it so
          // you bank a toll even on a dead-quiet session.
          if (you && ts >= you.shieldUntil && you.amount > WAR_CONFIG.CORPUS_FLOOR) {
            const youLast = lastActivityFromShield(you.shieldUntil, you.openedAt, WAR_CONFIG.SHIELD_MS);
            if (ts - youLast >= GUARANTEED_ACTIVITY_MS) {
              const ti = tierIndexForAmount(you.amount);
              const raiders = stashes.filter((t) => tierIndexForAmount(t.amount) === ti && ts >= t.shieldUntil);
              const attacker = raiders[Math.floor(Math.random() * raiders.length)];
              if (attacker) {
                const params = vaultParamsFor(you.amount, you.riskProfile);
                const mult = feeMultiplierForStreak(you.streak, STREAK_CFG);
                const feeB = computeFee(you.amount, params, mult, 0);
                if (feeB.fee <= attacker.amount) {
                  const out = settleSiege(attacker, you, 0, rollFromSeed(randomHex(8)), ts, "");
                  you = out.defender;
                  stashes = stashes.map((t) => (t.id === attacker.id ? out.raider : t));
                  totalBanked += out.houseDelta;
                  events.push(siegeFeedEvent(out.result, attacker.wallet, false, true, feeB.toDefenderOnFail, ts, true));
                }
              }
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

        // Board order is SETTLED — no per-tick re-sort. Vault updates and
        // depleted-vault replacement happen in place (same index), so every
        // card holds its position between explicit ranking moments (mount /
        // Re-rank / open / cashout). Heat BADGES still update live per card.
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
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Wallet Wars sim tick skipped after error:", err);
      }
    }, WAR_CONFIG.TICK_MS);

    return () => clearInterval(interval);
  }, []);

  return { state, openVault, cashOut, withdrawBanked, setCompound, setRiskProfile, siege, placeBounty, repeatTaxMult, resortBoard: resortBoardAction };
}
