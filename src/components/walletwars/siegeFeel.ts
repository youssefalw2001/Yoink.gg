/**
 * siegeFeel — pure, DOM-free decision logic for the SiegeModal phase machine
 * (`select → strain → result`). Extracted so the "tension arc" rules are
 * unit-testable without a renderer:
 *
 *   - A REJECTED siege never plays the build-up — the modal stays in `select`
 *     and surfaces the typed reason (Property 9).
 *   - An ACCEPTED siege seals its provably-fair result first, then plays the
 *     `strain` build-up — UNLESS Quick Siege or reduced motion is preferred, in
 *     which case it lands on `result` instantly (Property 10).
 *
 * These functions never read time, randomness, storage, or the DOM.
 */

import type { SiegeResolution } from "@/lib/walletWarsState";

export type SiegePhase = "select" | "strain" | "result";

export interface PhaseDecisionOpts {
  /** Quick Siege preference — skip the build-up. */
  quickRaid: boolean;
  /** `prefers-reduced-motion` — skip the build-up (instant outcome). */
  reducedMotion: boolean;
}

/**
 * The phase to enter after a committed siege resolves.
 *
 * - `!ok` (any rejection kind) → `"select"` (NEVER `"strain"`; no fake build-up).
 * - `ok` and (`quickRaid` or `reducedMotion`) → `"result"` (instant).
 * - `ok` otherwise → `"strain"` (the build-up over the already-sealed result).
 */
export function nextPhaseAfterCommit(
  resolution: SiegeResolution,
  opts: PhaseDecisionOpts,
): SiegePhase {
  if (!resolution.ok) return "select";
  if (opts.quickRaid || opts.reducedMotion) return "result";
  return "strain";
}

/** True iff a committed siege should play the `strain` build-up. */
export function shouldPlayStrain(
  resolution: SiegeResolution,
  opts: PhaseDecisionOpts,
): boolean {
  return nextPhaseAfterCommit(resolution, opts) === "strain";
}
