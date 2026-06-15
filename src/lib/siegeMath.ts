/**
 * YOINK.GG — Wallet Wars · "Siege the Vault" pure money math.
 *
 * This module is the single source of truth for every SOL-moving calculation in
 * the Siege economy. It is **pure, side-effect-free, and total**: the local
 * simulation (`walletWarsState.ts`) calls these functions today, and the future
 * on-chain Anchor program re-implements the *same* arithmetic. Because the
 * functions are deterministic they form the exact contract the on-chain
 * settlement must honour, and they are trivially property-testable.
 *
 * NOTHING here reads time, randomness, storage, or the DOM. Randomness
 * (`rollFromSeed`) and state live in the engine; this file only does numbers.
 *
 * Symbols (all rates are fractions of the vault corpus `V`):
 *   f        feeRate         — attempt fee as a fraction of V
 *   p        winChance       — crack probability (FIXED & published within a tier)
 *   s        sliceRate       — prize slice as a fraction of V
 *   ρ_fee    houseFeeCut     — house cut of the (base) attempt fee
 *   ρ_prize  housePrizeRake  — house rake on the prize slice
 *   m_k      streak mult     — 1 + step·min(streak, cap); applied to BOTH f and s
 */

import { tierIndexForAmount } from "@/lib/walletWarsState";

// ── Types ───────────────────────────────────────────────────────────────────

/** Immutable economic parameters for a tier. Published + verifiable. */
export interface TierParams {
  id: "pit" | "grind" | "arena" | "court";
  /** f — attempt fee as a fraction of the vault corpus. */
  feeRate: number;
  /** p — crack (win) probability; FIXED within a tier. */
  winChance: number;
  /** s — prize slice as a fraction of the vault corpus. */
  sliceRate: number;
  /** ρ_fee — house cut of the base attempt fee. */
  houseFeeCut: number;
  /** ρ_prize — house rake on the gross prize slice. */
  housePrizeRake: number;
}

/** Survival-streak ramp config: m_k = 1 + step·min(streak, cap). */
export interface StreakConfig {
  /** α per survived siege. */
  step: number;
  /** max k counted → m_max = 1 + step·cap. */
  cap: number;
}

/** Per-attempt fee decomposition (all amounts in SOL). */
export interface FeeBreakdown {
  /** F charged to the raider (base + repeat tax). */
  fee: number;
  /** f·V·m_k — before the repeat-target tax. */
  baseFee: number;
  /** Repeat-target surcharge → routed 100% to the house. */
  repeatTax: number;
  /** Defender's banked share on a failed siege (from the base fee only). */
  toDefenderOnFail: number;
  /** House share on a failed siege (ρ_fee of base fee + the full repeat tax). */
  toHouseOnFail: number;
}

/** Prize (crack) decomposition (all amounts in SOL). */
export interface PrizeBreakdown {
  /** s·V·m_k — the slice that leaves the vault corpus (clamped ≤ V). */
  gross: number;
  /** gross·(1 − ρ_prize) — net to the raider. */
  toRaider: number;
  /** gross·ρ_prize — house rake on the slice. */
  toHouse: number;
}

/**
 * Per-actor SOL deltas for a single settled siege. Excludes bounty (handled by
 * the engine). By construction `raider + defender + house + corpus === 0`.
 */
export interface SettlementDeltas {
  /** Change to the raider's balance. */
  raider: number;
  /** Change to the defender's banked balance. */
  defender: number;
  /** Change to the house balance. */
  house: number;
  /** Change to the defender vault's corpus. */
  corpus: number;
}

/** Minimal vault shape needed for heat ranking (subset of the engine Vault). */
export interface VaultHeatInput {
  amount: number;
  streak: number;
  openedAt: number;
}

// ── Published tier parameters (exact values from the design Tier System table) ─

export const PIT_PARAMS: TierParams = {
  id: "pit",
  feeRate: 0.02,
  winChance: 0.12,
  sliceRate: 0.15,
  houseFeeCut: 0.01,
  housePrizeRake: 0.02,
};

export const GRIND_PARAMS: TierParams = {
  id: "grind",
  feeRate: 0.015,
  winChance: 0.1,
  sliceRate: 0.13,
  houseFeeCut: 0.06,
  housePrizeRake: 0.08,
};

export const ARENA_PARAMS: TierParams = {
  id: "arena",
  feeRate: 0.01,
  winChance: 0.08,
  sliceRate: 0.11,
  houseFeeCut: 0.12,
  housePrizeRake: 0.15,
};

export const COURT_PARAMS: TierParams = {
  id: "court",
  feeRate: 0.008,
  winChance: 0.06,
  sliceRate: 0.09,
  houseFeeCut: 0.15,
  housePrizeRake: 0.18,
};

/**
 * Tier params indexed to match `tierIndexForAmount`:
 *   0 = pit, 1 = grind, 2 = arena, 3 = court.
 */
export const TIER_PARAMS: readonly TierParams[] = [
  PIT_PARAMS,
  GRIND_PARAMS,
  ARENA_PARAMS,
  COURT_PARAMS,
];

/** Streak ramp: m ∈ [1.0, 2.0] (so s·m_max ≤ 1 for every tier). */
export const STREAK_CFG: StreakConfig = { step: 0.04, cap: 25 };

/** Longevity decay constant for the heat "freshness" term (ms). */
export const SURVIVAL_TAU = 3_600_000;

// ── Tier resolution & streak multiplier ───────────────────────────────────────

/**
 * Resolve the `TierParams` for a vault amount via the engine's existing
 * `tierIndexForAmount` mapping (top-down, inclusive on the tier minimum).
 * Total over all `amount ≥ 0`.
 */
export function tierParamsFor(amount: number): TierParams {
  return TIER_PARAMS[tierIndexForAmount(amount)];
}

/**
 * Survival-streak fee/slice multiplier: `m_k = 1 + step·min(streak, cap)`.
 * Non-decreasing in `streak` and bounded by `[1, 1 + step·cap]` for `streak ≥ 0`.
 */
export function feeMultiplierForStreak(streak: number, cfg: StreakConfig): number {
  return 1 + cfg.step * Math.min(streak, cfg.cap);
}

// ── Fee & prize decomposition ─────────────────────────────────────────────────

/**
 * Compute the attempt-fee breakdown for a siege.
 *
 * `baseFee = f·V·mult`, `repeatTax = baseFee·repeatTaxMult`,
 * `fee = baseFee + repeatTax`, `toDefenderOnFail = baseFee·(1 − ρ_fee)`,
 * `toHouseOnFail = baseFee·ρ_fee + repeatTax`.
 *
 * Invariant: `toDefenderOnFail + toHouseOnFail === fee`.
 *
 * @param corpus         the target vault corpus `V` (SOL); must be > 0
 * @param params         the tier parameters
 * @param mult           the streak multiplier `m_k` (≥ 1)
 * @param repeatTaxMult  the repeat-target tax factor (≥ 0)
 */
export function computeFee(
  corpus: number,
  params: TierParams,
  mult: number,
  repeatTaxMult: number,
): FeeBreakdown {
  const baseFee = params.feeRate * corpus * mult;
  const repeatTax = baseFee * repeatTaxMult;
  const fee = baseFee + repeatTax;
  const toDefenderOnFail = baseFee * (1 - params.houseFeeCut);
  const toHouseOnFail = baseFee * params.houseFeeCut + repeatTax;
  return { fee, baseFee, repeatTax, toDefenderOnFail, toHouseOnFail };
}

/**
 * Compute the prize breakdown for a successful crack.
 *
 * `gross = min(s·V·mult, V)` (the slice never exceeds the corpus),
 * `toRaider = gross·(1 − ρ_prize)`, `toHouse = gross·ρ_prize`.
 *
 * Invariant: `toRaider + toHouse === gross` and `gross ≤ corpus`.
 *
 * @param corpus  the target vault corpus `V` (SOL); must be > 0
 * @param params  the tier parameters
 * @param mult    the streak multiplier `m_k` (≥ 1)
 */
export function computePrize(
  corpus: number,
  params: TierParams,
  mult: number,
): PrizeBreakdown {
  const gross = Math.min(params.sliceRate * corpus * mult, corpus);
  const toRaider = gross * (1 - params.housePrizeRake);
  const toHouse = gross * params.housePrizeRake;
  return { gross, toRaider, toHouse };
}

// ── Settlement deltas (zero-sum by construction) ──────────────────────────────

/**
 * Per-actor deltas for a FAILED siege (the common case).
 * Raider loses the whole fee; defender banks the toll; house takes its cut plus
 * the full repeat tax. Corpus is untouched.
 */
export function settleFailure(fee: FeeBreakdown): SettlementDeltas {
  return {
    raider: -fee.fee,
    defender: fee.toDefenderOnFail,
    house: fee.toHouseOnFail,
    corpus: 0,
  };
}

/**
 * Per-actor deltas for a SUCCESSFUL crack.
 * Raider pays the fee but takes the net prize; defender STILL keeps the toll;
 * house takes the prize rake plus its fee cut plus the repeat tax; the corpus
 * shrinks by the gross slice. Bounty is layered on by the engine, not here.
 */
export function settleSuccess(fee: FeeBreakdown, prize: PrizeBreakdown): SettlementDeltas {
  return {
    raider: -fee.fee + prize.toRaider,
    defender: fee.toDefenderOnFail,
    house: prize.toHouse + fee.toHouseOnFail,
    corpus: -prize.gross,
  };
}

// ── Heat / notoriety (visibility ranking only — never affects odds) ───────────

/**
 * Heat score driving board sort order and FOMO badges. Pure ranking: it does
 * NOT change the win chance of any siege.
 *
 *   size    = log10(1 + V)                       — fatter = hotter
 *   streakN = min(streak, cap) / cap             — survival momentum
 *   fresh   = exp(-(now - openedAt) / TAU)       — longevity glow
 *   heat    = 0.5·size + 0.35·streakN + 0.15·(1 − fresh)
 */
export function heatScore(v: VaultHeatInput, now: number): number {
  const size = Math.log10(1 + v.amount);
  const streakN = Math.min(v.streak, STREAK_CFG.cap) / STREAK_CFG.cap;
  const fresh = Math.exp(-(now - v.openedAt) / SURVIVAL_TAU);
  return 0.5 * size + 0.35 * streakN + 0.15 * (1 - fresh);
}

// ── Expected value (per single attempt, as a fraction of V) ───────────────────

/** EV_raider = p·s·(1 − ρ_prize) − f. (Slightly negative by design.) */
export function evRaider(p: TierParams): number {
  return p.winChance * p.sliceRate * (1 - p.housePrizeRake) - p.feeRate;
}

/** EV_defender = (1 − ρ_fee)·f − p·s. (Non-negative by design.) */
export function evDefender(p: TierParams): number {
  return (1 - p.houseFeeCut) * p.feeRate - p.winChance * p.sliceRate;
}

/** EV_house = ρ_fee·f + p·ρ_prize·s. (Strictly positive by design.) */
export function evHouse(p: TierParams): number {
  return p.houseFeeCut * p.feeRate + p.winChance * p.housePrizeRake * p.sliceRate;
}


// ── Variable-Risk Vaults — risk profiles + EV-preserving param resolution ─────

/**
 * The three published risk profiles, chosen at vault-open time and LOCKED to the
 * vault for its entire lifetime. A profile only ever selects a *published, fixed*
 * crack chance `p'` (and the defender-EV-preserving fee `f'` derived from it); it
 * NEVER auto-varies odds by streak, heat, age, or balance. Provable fairness is
 * untouched: the win check stays `roll < p_vault` against this published `p'`.
 */
export type RiskProfile = "fortified" | "standard" | "exposed";

/** Static description of a risk profile (the single source of truth for κ). */
export interface RiskProfileSpec {
  id: RiskProfile;
  /** Display label: "Fortified" | "Standard" | "Exposed". */
  label: string;
  /** κ — multiplier applied to the tier's base crack odds p. */
  oddsFactor: number;
  /** UI framing copy: low risk/low reward → high risk/high reward. */
  blurb: string;
}

/**
 * The published risk profiles. κ = 0.6 (Fortified) · 1.0 (Standard) · 1.5
 * (Exposed). Standard's κ MUST stay exactly 1.0 — it is the algebraic identity
 * of the base tier params and the migration target (see `resolveVaultParams`).
 */
export const RISK_PROFILES: Record<RiskProfile, RiskProfileSpec> = {
  fortified: {
    id: "fortified",
    label: "Fortified",
    oddsFactor: 0.6,
    blurb: "Low risk · low reward — cracked rarely, bank small steady tolls over a long life.",
  },
  standard: {
    id: "standard",
    label: "Standard",
    oddsFactor: 1.0,
    blurb: "Balanced — the house baseline odds and toll for your tier.",
  },
  exposed: {
    id: "exposed",
    label: "Exposed",
    oddsFactor: 1.5,
    blurb: "High risk · high reward — cracked fast, but collect a big toll per survived siege.",
  },
};

/** Render/selector order: low-risk → high-risk, left to right. */
export const RISK_PROFILE_ORDER: readonly RiskProfile[] = ["fortified", "standard", "exposed"];

/** The default profile applied by callers and by migration/normalisation. */
export const DEFAULT_RISK_PROFILE: RiskProfile = "standard";

/** Defensive clamp epsilon so effective odds stay strictly inside (0, 1). */
const RISK_ODDS_EPS = 1e-9;

/** True iff `x` is a valid `RiskProfile`. Used by migration/normalisation. */
export function isRiskProfile(x: unknown): x is RiskProfile {
  return x === "fortified" || x === "standard" || x === "exposed";
}

/**
 * Resolve the EFFECTIVE `TierParams` for a base tier + risk profile.
 *
 * Adjusts ONLY `winChance (p)` and `feeRate (f)`; `sliceRate`, both house rakes,
 * and `id` are carried through from `base`. Holds defender EV constant by
 * construction: with `D = evDefender(base) = (1 − ρ_fee)·f − p·s`, the effective
 * odds are `p' = clamp(p·κ, ε, 1−ε)` and the fee is `f' = (D + p'·s)/(1 − ρ_fee)`,
 * so `evDefender(result) === D` whenever no clamp is applied.
 *
 * Standard (κ = 1) short-circuits to `base` exactly — the migration-safety
 * identity. Pure, total, side-effect free.
 */
export function resolveVaultParams(base: TierParams, profile: RiskProfile): TierParams {
  const kappa = RISK_PROFILES[profile].oddsFactor;
  if (kappa === 1) return base; // Standard is the exact identity of the base tier.

  const D = (1 - base.houseFeeCut) * base.feeRate - base.winChance * base.sliceRate; // evDefender(base)
  const pRaw = base.winChance * kappa;
  const p2 = Math.min(1 - RISK_ODDS_EPS, Math.max(RISK_ODDS_EPS, pRaw));
  const f2 = (D + p2 * base.sliceRate) / (1 - base.houseFeeCut); // hold D constant
  return {
    id: base.id,
    winChance: p2,
    feeRate: f2,
    sliceRate: base.sliceRate,
    houseFeeCut: base.houseFeeCut,
    housePrizeRake: base.housePrizeRake,
  };
}

/**
 * Convenience: resolve the effective params for a vault `amount` and `profile`.
 * `= resolveVaultParams(tierParamsFor(amount), profile)`. Total for `amount ≥ 0`.
 */
export function vaultParamsFor(amount: number, profile: RiskProfile): TierParams {
  return resolveVaultParams(tierParamsFor(amount), profile);
}
