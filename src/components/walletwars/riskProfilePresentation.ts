/**
 * Pure presentation models for Variable-Risk Vaults UI.
 *
 * Extracted from the React components so the selector previews, the VaultCard
 * primary fields, the profile badge, and the reduced-motion suppression logic
 * can be unit-tested in the plain-Node test environment (no DOM runner) —
 * mirroring the pure-presentation pattern used by the prior Siege PRs.
 *
 * NOTHING here touches React, the DOM, time, or randomness; it is pure number +
 * string derivation on top of `siegeMath`'s `vaultParamsFor`.
 */

import {
  type RiskProfile,
  type TierParams,
  RISK_PROFILES,
  RISK_PROFILE_ORDER,
  vaultParamsFor,
  computeFee,
  computePrize,
  feeMultiplierForStreak,
  STREAK_CFG,
} from "@/lib/siegeMath";
import type { Vault } from "@/lib/walletWarsState";

/**
 * Per-profile accent colour, rendered left→right as an explicit
 * low-risk/low-reward → high-risk/high-reward gradient: Fortified (emerald) →
 * Standard (phantom) → Exposed (blood).
 */
export const PROFILE_ACCENT: Record<RiskProfile, string> = {
  fortified: "#00E676",
  standard: "#7000FF",
  exposed: "#FF2200",
};

/** The uppercased badge text for a profile: FORTIFIED / STANDARD / EXPOSED. */
export function profileBadgeLabel(profile: RiskProfile): string {
  return RISK_PROFILES[profile].label.toUpperCase();
}

/** A single profile's preview for an entered stake amount (mult = 1). */
export interface ProfilePreview {
  profile: RiskProfile;
  /** Display label, e.g. "Fortified". */
  label: string;
  /** Uppercased badge text, e.g. "FORTIFIED". */
  badge: string;
  /** Accent colour for this profile. */
  accent: string;
  /** p' — the published crack chance for this stake + profile. */
  crackChance: number;
  /** p' as a rounded whole-percent string, e.g. "7%". */
  crackPct: string;
  /** f' — the effective fee rate. */
  feeRate: number;
  /** f'·amount — the SOL fee a raider risks per attempt (mult = 1). */
  feeSol: number;
  /** Framing copy from RISK_PROFILES[profile].blurb. */
  blurb: string;
}

/** Round a probability to a whole-percent display string. */
function pctString(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

/** Build the preview for one profile at a given stake amount. */
export function profilePreview(amount: number, profile: RiskProfile): ProfilePreview {
  const params: TierParams = vaultParamsFor(amount, profile);
  return {
    profile,
    label: RISK_PROFILES[profile].label,
    badge: profileBadgeLabel(profile),
    accent: PROFILE_ACCENT[profile],
    crackChance: params.winChance,
    crackPct: pctString(params.winChance),
    feeRate: params.feeRate,
    feeSol: params.feeRate * Math.max(0, amount),
    blurb: RISK_PROFILES[profile].blurb,
  };
}

/**
 * Build all three profile previews in render order (low-risk → high-risk) for an
 * entered stake. Used by the open-flow risk-profile selector.
 */
export function profilePreviews(amount: number): ProfilePreview[] {
  return RISK_PROFILE_ORDER.map((p) => profilePreview(amount, p));
}

/**
 * The ~5 primary fields a VaultCard / SiegeModal surfaces for a profiled vault,
 * all derived from `vaultParamsFor(vault.amount, vault.riskProfile)` (and the
 * vault's survival streak multiplier, matching the engine settlement).
 */
export interface VaultEconomics {
  /** The vault corpus V. */
  sizeSol: number;
  /** p' — the vault's own published crack odds. */
  crackChance: number;
  /** p' as a whole-percent string. */
  crackPct: string;
  /** The fee a raider risks for one attempt (with the streak multiplier). */
  feeRisked: number;
  /** The net slice a raider wins on a crack (with the streak multiplier). */
  sliceWon: number;
  /** The profile badge text. */
  badge: string;
  /** The profile accent colour. */
  accent: string;
}

/**
 * Derive a vault's siege economics from its own published profile params. Mirror
 * of the engine's settlement inputs (no repeat tax in the at-a-glance preview).
 */
export function vaultEconomics(vault: Pick<Vault, "amount" | "riskProfile" | "streak">): VaultEconomics {
  const params = vaultParamsFor(vault.amount, vault.riskProfile);
  const mult = feeMultiplierForStreak(vault.streak, STREAK_CFG);
  return {
    sizeSol: vault.amount,
    crackChance: params.winChance,
    crackPct: pctString(params.winChance),
    feeRisked: computeFee(vault.amount, params, mult, 0).fee,
    sliceWon: computePrize(vault.amount, params, mult).toRaider,
    badge: profileBadgeLabel(vault.riskProfile),
    accent: PROFILE_ACCENT[vault.riskProfile],
  };
}

/**
 * Reduced-motion gate for Framer Motion animation props: returns `undefined`
 * (no animation) when reduced motion is preferred, otherwise the given props.
 * Pure helper so suppression is unit-testable without a DOM.
 */
export function animateUnlessReduced<T>(reduced: boolean, animateProps: T): T | undefined {
  return reduced ? undefined : animateProps;
}
