/**
 * YOINK.GG — Wallet Wars · activity + opportunity ranking (pure)
 *
 * Two concerns, both PURE and economy-free:
 *
 *   1. ACTIVITY / IDLE  — detect vaults that have gone quiet so (a) the Hunt
 *      board can flag an "idle" targeting signal for skilled raiders (>30 min)
 *      and (b) the engine's daily guaranteed-activity layer can inject a
 *      simulated siege against vaults idle past a longer threshold (>60 min) so
 *      lords always earn something and the war feed never flatlines.
 *
 *   2. OPPORTUNITY SCORE — a Siege-Runner-facing VALUE ranking for the board.
 *      This is visibility/sort ONLY. It NEVER changes a vault's crack odds, EV,
 *      fees, or any SOL-moving number — those live in the frozen `siegeMath.ts`.
 *      The score just decides which (already economically fixed) opportunities
 *      bubble to the top for a raider hunting the best shot.
 *
 * Nothing here reads time, randomness, storage, or the DOM — callers inject the
 * clock + the last-activity timestamps so every function is deterministic.
 */

/** A vault is an "idle target" for the Hunt board after this much silence. */
export const HUNT_IDLE_SIGNAL_MS = 30 * 60_000; // 30 min
/** The daily guaranteed-activity layer fires against vaults idle past this. */
export const GUARANTEED_ACTIVITY_MS = 60 * 60_000; // 60 min

/** Milliseconds a vault has been idle, given its last-activity clock. */
export function idleMsFor(lastActivityAt: number, now: number): number {
  return Math.max(0, now - lastActivityAt);
}

/**
 * Derive a vault's last-activity timestamp WITHOUT a side-channel: every settled
 * siege stamps `shieldUntil = at + SHIELD_MS`, so `shieldUntil − SHIELD_MS` is
 * exactly when the vault was last sieged. A vault that has never been sieged
 * (`shieldUntil <= 0`) falls back to `openedAt`. Pure + deterministic, so both
 * the engine's guaranteed-activity layer and the Hunt board agree on "idle".
 */
export function lastActivityFromShield(shieldUntil: number, openedAt: number, shieldMs: number): number {
  return shieldUntil > 0 ? shieldUntil - shieldMs : openedAt;
}

/** True iff a vault should show the Hunt "idle target" signal. */
export function isIdleTarget(lastActivityAt: number, now: number, thresholdMs = HUNT_IDLE_SIGNAL_MS): boolean {
  return idleMsFor(lastActivityAt, now) >= thresholdMs;
}

/**
 * Resolve the ids that the daily guaranteed-activity layer should siege this
 * tick: every vault idle past `thresholdMs`, oldest-idle first (so the quietest
 * vaults get attention first), capped at `max`.
 *
 * `lastActivity` maps vault id → last-activity ms. A vault with no recorded
 * activity falls back to `fallbackAt` (typically its `openedAt`), so freshly
 * seeded vaults aren't treated as instantly idle.
 */
export function guaranteedActivityTargets<T extends { id: string; openedAt?: number }>(
  vaults: readonly T[],
  lastActivity: ReadonlyMap<string, number>,
  now: number,
  thresholdMs = GUARANTEED_ACTIVITY_MS,
  max = 1,
): string[] {
  const idle = vaults
    .map((v) => {
      const last = lastActivity.get(v.id) ?? v.openedAt ?? now;
      return { id: v.id, idle: idleMsFor(last, now) };
    })
    .filter((x) => x.idle >= thresholdMs)
    .sort((a, b) => b.idle - a.idle);
  return idle.slice(0, Math.max(0, max)).map((x) => x.id);
}

// ── Opportunity value score (Hunt board sort) ──────────────────────────────────

/**
 * The economic + situational signals a raider weighs when picking a target. All
 * values are READ from the frozen economy (crack chance, fee, slice) by the
 * caller — this module only blends them into a sortable score.
 */
export interface OpportunitySignals {
  /** p — published crack chance for this vault (0–1). */
  crackChance: number;
  /** Net slice a raider wins on a crack (SOL). */
  sliceWon: number;
  /** Fee a raider risks per attempt (SOL). */
  feeRisked: number;
  /** Vault corpus (SOL) — bigger vault = bigger story. */
  sizeSol: number;
  /** Escrowed bounty pool on this vault (SOL); 0 if none. */
  bountyPool: number;
  /** Survival streak — a long streak about to break is a juicy target. */
  streak: number;
  /** Milliseconds the vault owner has been idle (targeting signal). */
  idleMs: number;
  /** True while the vault is shielded (freshly sieged) — deprioritise. */
  shielded: boolean;
}

/** Upside multiple (slice ÷ fee). 0 when the fee is non-positive. */
export function upsideMultiple(sliceWon: number, feeRisked: number): number {
  return feeRisked > 0 ? sliceWon / feeRisked : 0;
}

/**
 * Blend the signals into a single value score (higher = surfaced first). Pure +
 * total. Weights favour: higher crack odds, fatter upside multiple, a live
 * bounty, an idle owner, a long breakable streak, and a bigger vault — while a
 * shield heavily deprioritises (it can't be sieged right now anyway).
 *
 * This is sort order ONLY. It does not, and must not, feed back into the odds or
 * any payout. Two vaults with identical economics differ here only by their
 * situational signals (bounty / idle / streak / shield).
 */
export function opportunityScore(s: OpportunitySignals): number {
  const odds = Math.max(0, Math.min(1, s.crackChance));
  const upside = upsideMultiple(s.sliceWon, s.feeRisked);
  // log-compress the unbounded terms so no single signal dominates.
  const upsideTerm = Math.log10(1 + Math.max(0, upside));
  const sizeTerm = Math.log10(1 + Math.max(0, s.sizeSol));
  const bountyTerm = s.bountyPool > 0 ? Math.log10(1 + s.bountyPool) : 0;
  const idleTerm = Math.min(1, Math.max(0, s.idleMs) / HUNT_IDLE_SIGNAL_MS);
  const streakTerm = Math.min(1, Math.max(0, s.streak) / 25);

  const raw =
    0.30 * (odds / 0.12) + // normalise around the Pit's 12% baseline
    0.26 * upsideTerm +
    0.16 * bountyTerm +
    0.12 * idleTerm +
    0.10 * streakTerm +
    0.06 * sizeTerm;

  // A shield means "not targetable now" → push it down hard but keep it stable.
  return s.shielded ? raw * 0.15 : raw;
}
