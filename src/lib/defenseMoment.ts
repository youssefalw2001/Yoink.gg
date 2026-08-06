/**
 * YOINK.GG — Defender-side moments (the Vault Lord feel layer).
 *
 * ── THE PROBLEM ─────────────────────────────────────────────────────────────
 *
 * Wallet Wars has its incentives inverted against retention: the RAIDER role is
 * −EV but gets all the drama (a 1.9s strain, a reveal, a near-miss meter, a
 * shareable card), while the DEFENDER role is +EV and gets nothing. On a survived
 * siege the engine correctly bumps `banked`, `feesEarned`, `survived` and
 * `streak` — and the UI reflects it as silently re-rendered numbers plus one calm
 * feed row that is only visible when the "Lords" filter happens to be active.
 *
 * So the profitable role is the boring one. That is backwards: the thing that
 * keeps a player solvent should be the thing that feels good.
 *
 * ── WHY THIS IS NOT JUST "ADD A TOAST" ──────────────────────────────────────
 *
 * `WalletWarsScreen` carries a deliberate decision: "No popup toast (kept calm)."
 * That instinct is RIGHT — the ambient tick attacks the player roughly every 16
 * seconds, so a toast per survival would be a notification firehose that trains
 * the user to ignore the very feedback we are adding.
 *
 * This module therefore CLASSIFIES rather than announces. Routine holds stay
 * quiet (numbers and feed only, exactly as today). Only genuinely notable
 * events escalate:
 *
 *   routine    a hold that was never in danger        → silent
 *   closeCall  the roll came near the crack threshold → announce
 *   milestone  a first toll, a survival count, a
 *              multiplier tier, or being cracked      → announce + sound
 *
 * Pure, total, side-effect free: no time, storage, DOM, randomness or sound.
 * The caller owns presentation and throttling state.
 */

import { STREAK_CFG, feeMultiplierForStreak } from "@/lib/siegeMath";
import { nearMissView } from "@/components/walletwars/nearMiss";

/**
 * One settled siege AGAINST the player's vault.
 *
 * The engine already computes all of this at the settle site; it was previously
 * discarded before reaching React state, which is why no defender-side near-miss
 * was possible. `roll` and `pWin` are what make "they came within X% of cracking
 * you" expressible at all.
 */
export interface DefenseEvent {
  /** Monotonic id so the UI can key/dedupe without comparing floats. */
  id: number;
  /** Did the vault hold? */
  outcome: "held" | "cracked";
  /** Display label for the attacker. */
  attacker: string;
  /** SOL the defender banked from this attempt (the toll — paid win OR lose). */
  toll: number;
  /** SOL taken out of the corpus (0 unless cracked). */
  lost: number;
  /** The provably-fair roll for this attempt. */
  roll: number;
  /** The published crack chance that applied. */
  pWin: number;
  /** The defender's streak AFTER settlement. */
  streakAfter: number;
  /** The defender's lifetime survived count AFTER settlement. */
  survivedAfter: number;
  /** Settlement timestamp (ms). */
  ts: number;
}

/** How loudly the UI should react. */
export type DefenseSignificance = "routine" | "closeCall" | "milestone";

/**
 * A hold counts as a close call when the roll landed within this fraction of the
 * crack threshold. `nearMissView().tension` is 1 at the threshold and decays to 0
 * across the miss zone, so 0.72 is "uncomfortably close" without firing on every
 * ordinary hold.
 */
export const CLOSE_CALL_TENSION = 0.72;

/**
 * Minimum gap between announcements. The ambient tick can attack roughly every
 * 16s; without a floor, a run of close calls would still feel like spam.
 * Milestones bypass this — they are rare and always worth interrupting for.
 */
export const ANNOUNCE_COOLDOWN_MS = 9_000;

/** Survival counts worth calling out. */
export const SURVIVAL_MILESTONES = [1, 5, 10, 25, 50, 100, 250] as const;

/** Multiplier tiers worth calling out, in ascending order. */
export const MULT_MILESTONES = [1.25, 1.5, 1.75, 2.0] as const;

// ── Streak / multiplier progress ─────────────────────────────────────────────

export interface StreakProgress {
  /** m_k currently in force for the NEXT siege against this vault. */
  mult: number;
  /** True once the streak has reached the cap (m = 1 + step·cap). */
  atCap: boolean;
  /** The streak value at which the multiplier stops growing. */
  capStreak: number;
  /** Fraction of the way to the cap, 0…1. */
  pctToCap: number;
  /** The next headline multiplier tier, or null at cap. */
  nextMilestoneMult: number | null;
  /** Survivals needed to reach `nextMilestoneMult`, or 0 at cap. */
  survivalsToNextMilestone: number;
}

/**
 * Everything the UI needs to make a streak feel like progress rather than a
 * number. Each survival adds exactly `step` to the multiplier, so "next
 * multiplier" alone is always one siege away and therefore meaningless as a
 * goal — the useful targets are the headline tiers and the cap.
 */
export function streakProgress(streak: number, cfg = STREAK_CFG): StreakProgress {
  const s = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
  const capStreak = cfg.cap;
  const mult = feeMultiplierForStreak(s, cfg);
  const atCap = s >= capStreak;
  const maxMult = feeMultiplierForStreak(capStreak, cfg);

  let nextMilestoneMult: number | null = null;
  let survivalsToNextMilestone = 0;
  if (!atCap) {
    for (const target of MULT_MILESTONES) {
      // Only offer targets that are actually reachable and not yet achieved.
      if (target > maxMult + 1e-9) continue;
      if (mult + 1e-9 >= target) continue;
      nextMilestoneMult = target;
      const needStreak = Math.ceil((target - 1) / cfg.step - 1e-9);
      survivalsToNextMilestone = Math.max(1, needStreak - s);
      break;
    }
  }

  return {
    mult,
    atCap,
    capStreak,
    pctToCap: capStreak > 0 ? Math.min(1, s / capStreak) : 1,
    nextMilestoneMult,
    survivalsToNextMilestone,
  };
}

// ── Milestones ───────────────────────────────────────────────────────────────

/**
 * A short, human milestone label for this event, or null when it is not one.
 *
 * Being CRACKED is treated as a milestone: it is the single most consequential
 * thing that can happen to a defender, it resets the streak, and staying silent
 * about it would be the worst omission of all.
 */
export function defenseMilestone(ev: DefenseEvent, cfg = STREAK_CFG): string | null {
  if (ev.outcome === "cracked") return "Vault cracked — streak reset";

  /*
   * PRECEDENCE: a multiplier-tier crossing outranks a survival count.
   *
   * Both can legitimately fire on the same siege (e.g. streak 25 is both the 25th
   * survival AND the cap), and the tier is the rarer, mechanically meaningful
   * event — it changes what every future raider pays. Reporting "25 sieges
   * repelled" there would bury the fact that the vault just hit max toll.
   *
   * Note `survivedAfter` and `streakAfter` diverge after a crack (survived is
   * lifetime, streak resets), so these are genuinely independent triggers.
   */
  const before = feeMultiplierForStreak(Math.max(0, ev.streakAfter - 1), cfg);
  const after = feeMultiplierForStreak(ev.streakAfter, cfg);
  for (const target of MULT_MILESTONES) {
    if (before + 1e-9 < target && after + 1e-9 >= target) {
      const maxMult = feeMultiplierForStreak(cfg.cap, cfg);
      return Math.abs(target - maxMult) < 1e-9
        ? `Max toll reached — x${target.toFixed(2)}`
        : `Toll multiplier x${target.toFixed(2)}`;
    }
  }

  if ((SURVIVAL_MILESTONES as readonly number[]).includes(ev.survivedAfter)) {
    if (ev.survivedAfter === 1) return "First siege repelled";
    return `${ev.survivedAfter} sieges repelled`;
  }
  return null;
}

// ── Significance + announcement policy ───────────────────────────────────────

/** Classify how loudly the UI should react to one defence. */
export function defenseSignificance(ev: DefenseEvent, cfg = STREAK_CFG): DefenseSignificance {
  if (defenseMilestone(ev, cfg)) return "milestone";
  const view = nearMissView(ev.roll, ev.pWin);
  return view.tension >= CLOSE_CALL_TENSION ? "closeCall" : "routine";
}

/**
 * Should this event interrupt the player?
 *
 * Milestones always do. Close calls do, subject to a cooldown. Routine holds
 * never do — they remain the calm numeric update the original design intended.
 *
 * @param lastAnnouncedAt timestamp of the previous announcement (0 if none)
 */
export function shouldAnnounce(
  ev: DefenseEvent,
  lastAnnouncedAt: number,
  cfg = STREAK_CFG,
): boolean {
  const sig = defenseSignificance(ev, cfg);
  if (sig === "milestone") return true;
  if (sig === "routine") return false;
  return ev.ts - lastAnnouncedAt >= ANNOUNCE_COOLDOWN_MS;
}

// ── Copy ─────────────────────────────────────────────────────────────────────

/**
 * How close the attacker came, from the DEFENDER's side.
 *
 * `nearMissView` is deliberately perspective-agnostic — it only knows a roll and
 * a threshold — so the raider's "you were 4% away" and the defender's "they came
 * within 4%" are the same computation read from opposite ends. Reusing it keeps
 * the two sides of a single settled siege numerically consistent.
 */
export function defenseNearMissCopy(ev: DefenseEvent): string | null {
  if (ev.outcome === "cracked") return null;
  const view = nearMissView(ev.roll, ev.pWin);
  if (view.tension < CLOSE_CALL_TENSION) return null;
  return `They came within ${view.awayPct}% of cracking you`;
}

/** Headline for an announced defence. */
export function defenseHeadline(ev: DefenseEvent, cfg = STREAK_CFG): string {
  const milestone = defenseMilestone(ev, cfg);
  if (milestone) return milestone;
  return ev.outcome === "held" ? "Vault held" : "Vault cracked";
}
