/**
 * nearMiss — pure presentation for the "near miss" mechanic.
 *
 * A failed siege is FRAMED AS INFORMATION, not a loss: we show exactly how close
 * the provably-fair roll came to the published crack threshold. The closer the
 * roll sat to the line, the higher the tension — which the result screen and the
 * card history render as a meter that draws the raider back in.
 *
 * Provable fairness is untouched: a siege wins iff `roll < pWin` (the published,
 * fixed per-tier/risk-profile crack chance). This module only DESCRIBES that
 * comparison — it never decides it, and it reads no time/storage/DOM.
 */

/** A single provably-fair attempt, described for the near-miss UI. */
export interface NearMissView {
  /** The provably-fair roll ∈ [0,1). */
  roll: number;
  /** p — the crack threshold the roll had to beat (win iff roll < p). */
  threshold: number;
  /** True iff the roll cracked the vault (roll < threshold). */
  cracked: boolean;
  /**
   * How close the (failed) roll came, ∈ [0,1]: 1 = sat right on the line,
   * 0 = as far as possible above it. For a crack this is 1 (you made it).
   */
  tension: number;
  /**
   * "You were X% away from cracking it" — the roll's position across the MISS
   * ZONE (threshold → 1), as a whole percent in [0,100]. 0 = right on the line
   * (or a crack), 100 = the furthest possible miss. Always bounded.
   */
  awayPct: number;
  /** Roll marker position 0→1 on the rendered meter. */
  rollFrac: number;
  /** Threshold marker position 0→1 on the rendered meter. */
  thresholdFrac: number;
  /** Meter's upper bound (SOL-free, probability units) used for both fracs. */
  meterMax: number;
}

/** Clamp helper local to this module. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Describe one roll vs its crack threshold for the near-miss UI.
 *
 * The meter is auto-zoomed (since crack thresholds are small, 6–18%) so both the
 * threshold line and the roll marker are legible and their *gap* reads as
 * tension. `tension` is proportional closeness above the line relative to the
 * threshold; `awayPct` is the roll's bounded [0,100] position across the miss zone.
 */
export function nearMissView(roll: number, pWin: number): NearMissView {
  const r = clamp(Number.isFinite(roll) ? roll : 1, 0, 1);
  const p = clamp(Number.isFinite(pWin) ? pWin : 0, 0, 1);
  const cracked = r < p;

  // Gap above the line, relative to the threshold (0 = on the line).
  const rel = p > 0 ? (r - p) / p : r > 0 ? Infinity : 0;
  const tension = cracked ? 1 : clamp(1 - rel, 0, 1);
  // "% away from cracking" is bounded to [0,100]: the position of the roll across
  // the MISS ZONE (threshold → 1). 0% = right on the line, 100% = the furthest
  // possible miss. (Relative-to-threshold would be unbounded — a 0.5 roll vs a
  // 0.08 line is 525% over — which read as a nonsensical "400%+ loss" on the board.)
  const missZone = Math.max(1 - p, 1e-9);
  const awayPct = cracked ? 0 : Math.round(clamp((r - p) / missZone, 0, 1) * 100);

  // Auto-zoom so threshold + roll are both visible with breathing room.
  const meterMax = clamp(Math.max(p * 4, r * 1.15, 0.05), 0.01, 1);
  return {
    roll: r,
    threshold: p,
    cracked,
    tension,
    awayPct,
    rollFrac: clamp(r / meterMax, 0, 1),
    thresholdFrac: clamp(p / meterMax, 0, 1),
    meterMax,
  };
}

/** "You needed X or lower" copy (threshold to 2 dp). */
export function neededCopy(view: NearMissView): string {
  return `You needed ${view.threshold.toFixed(2)} or lower`;
}

/** "You rolled X" copy (roll to 2 dp). */
export function rolledCopy(view: NearMissView): string {
  return `You rolled ${view.roll.toFixed(2)}`;
}

// ── Synthetic attempt history (for the per-vault Hunt expand) ──────────────────

/** A recorded attempt against a vault, for the expandable history list. */
export interface AttemptRecord extends NearMissView {
  /** Stable key for list rendering. */
  id: string;
}

/** Deterministic [0,1) pseudo-roll from a string seed (FNV-1a, same family as the engine). */
function seededUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

/**
 * Build up to `count` recent attempts against a vault for the expandable
 * "near-miss history" — last attempts and how close each came. Deterministic
 * from `seed` (the vault id) so the same vault always shows the same history,
 * and honest about the published `pWin` (most attempts miss, a few sit close).
 *
 * This is SIMULATED targeting intelligence (all Wallet Wars activity is
 * simulated on devnet) — it never moves SOL and never alters odds.
 */
export function syntheticAttempts(seed: string, pWin: number, count = 5): AttemptRecord[] {
  const n = Math.max(0, Math.floor(count));
  const out: AttemptRecord[] = [];
  for (let i = 0; i < n; i++) {
    const roll = seededUnit(`${seed}:attempt:${i}`);
    out.push({ id: `${seed}-${i}`, ...nearMissView(roll, pWin) });
  }
  return out;
}
