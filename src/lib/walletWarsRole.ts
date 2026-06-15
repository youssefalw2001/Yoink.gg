/**
 * YOINK.GG — Wallet Wars · two-sided role model (Vault Lord ⇄ Siege Runner)
 *
 * Wallet Wars is a two-sided yield marketplace:
 *   - VAULT LORD ("the house")  — opens a vault, becomes a target, earns SOL
 *                                 fees from every failed siege. Yield terminal.
 *   - SIEGE RUNNER ("the action") — pays a small fee for an asymmetric shot at
 *                                 cracking a whale vault for ~10× the fee.
 *
 * This module owns the PURE, side-effect-free role + Siege-Runner progression
 * model (plus a tiny localStorage persistence seam). It NEVER touches the frozen
 * economy in `siegeMath.ts` — odds, EV, rake, tier thresholds, and the provably
 * fair roll are all untouched. Progression here is cosmetic recognition + unlock
 * gating only; it can never change a single SOL-moving number.
 *
 * Pure functions are trivially unit-testable; the hook-side persistence wraps
 * them defensively so a corrupt/absent store never throws.
 */

// ── Role ──────────────────────────────────────────────────────────────────────

/** The side of the marketplace a player is currently playing. */
export type WarRole = "lord" | "runner";

/** The two Wallet Wars sub-tabs, 1:1 with the two roles. */
export type WarTab = "build" | "hunt";

/** Map a role to the tab it lands on after connecting / onboarding. */
export function tabForRole(role: WarRole): WarTab {
  return role === "lord" ? "build" : "hunt";
}

/** Map a tab back to its role (used to default the war-feed filter, etc.). */
export function roleForTab(tab: WarTab): WarRole {
  return tab === "build" ? "lord" : "runner";
}

/** Narrow an arbitrary value to a valid `WarRole`. */
export function isWarRole(x: unknown): x is WarRole {
  return x === "lord" || x === "runner";
}

// ── Siege Runner progression (levels 1 → 5) ────────────────────────────────────

/**
 * Lifetime Siege-Runner activity. Drives XP + level. Display/recognition only —
 * none of these counters feed the economy.
 */
export interface RunnerStats {
  /** Total sieges attempted (win or loss). */
  attempts: number;
  /** Total vaults cracked (wins). */
  cracks: number;
  /** Total SOL won from cracks (net seized). */
  solWon: number;
}

export const EMPTY_RUNNER_STATS: RunnerStats = { attempts: 0, cracks: 0, solWon: 0 };

/** XP weights. Attempts build a floor; cracks are the real climb. Pure constants. */
export const RUNNER_XP_PER_ATTEMPT = 20;
export const RUNNER_XP_PER_CRACK = 100;

/** Total Siege-Runner XP from lifetime stats. Pure + total. */
export function runnerXp(stats: RunnerStats): number {
  const attempts = Math.max(0, Math.floor(stats.attempts || 0));
  const cracks = Math.max(0, Math.floor(stats.cracks || 0));
  return attempts * RUNNER_XP_PER_ATTEMPT + cracks * RUNNER_XP_PER_CRACK;
}

/** Win rate ∈ [0,1] (0 when no attempts). Pure. */
export function runnerWinRate(stats: RunnerStats): number {
  const attempts = Math.max(0, Math.floor(stats.attempts || 0));
  if (attempts === 0) return 0;
  return Math.min(1, Math.max(0, (stats.cracks || 0) / attempts));
}

/** One rung of the progression ladder. */
export interface RunnerLevelSpec {
  level: number;
  /** XP required to reach this level. */
  xpFloor: number;
  /** Short title, e.g. "Initiate". */
  title: string;
  /** What reaching this level unlocks (plain language). */
  unlock: string;
}

/**
 * The five published rungs. Unlocks match the design ladder exactly:
 *   1 entry · 2 early bounty alerts · 3 priority access to new vaults ·
 *   4 roll history (last 10) · 5 syndicate access.
 * Thresholds are tuned so a few cracks + steady attempts move you up.
 */
export const RUNNER_LEVELS: readonly RunnerLevelSpec[] = [
  { level: 1, xpFloor: 0,    title: "Initiate", unlock: "Entry — the board is open. Find your first target." },
  { level: 2, xpFloor: 150,  title: "Raider",   unlock: "Early bounty notifications — see fresh bounties first." },
  { level: 3, xpFloor: 450,  title: "Breacher", unlock: "Priority access to newly opened vaults." },
  { level: 4, xpFloor: 1000, title: "Phantom",  unlock: "Roll history — review your last ten siege attempts." },
  { level: 5, xpFloor: 2000, title: "Warlord",  unlock: "Syndicate access — coordinate sieges with the pack." },
] as const;

/** Resolved progression snapshot for the current XP total. */
export interface RunnerLevelInfo {
  /** Current level 1–5. */
  level: number;
  /** Total XP. */
  xp: number;
  /** Current level's spec. */
  spec: RunnerLevelSpec;
  /** Next level's spec, or null at max. */
  next: RunnerLevelSpec | null;
  /** XP accumulated inside the current level band. */
  xpIntoLevel: number;
  /** XP span of the current level band (next.floor − current.floor), 0 at max. */
  xpForNextLevel: number;
  /** XP remaining until the next unlock (0 at max). */
  xpToNext: number;
  /** Progress 0→1 toward the next level (1 at max). */
  pctToNext: number;
  /** True at the top rung. */
  isMax: boolean;
}

/** Resolve the level band for an XP total. Pure + total + monotonic in `xp`. */
export function runnerLevelForXp(xp: number): RunnerLevelInfo {
  const safeXp = Math.max(0, Number.isFinite(xp) ? xp : 0);
  // Highest rung whose floor we've reached.
  let idx = 0;
  for (let i = 0; i < RUNNER_LEVELS.length; i++) {
    if (safeXp >= RUNNER_LEVELS[i].xpFloor) idx = i;
  }
  const spec = RUNNER_LEVELS[idx];
  const next = idx < RUNNER_LEVELS.length - 1 ? RUNNER_LEVELS[idx + 1] : null;
  const isMax = next === null;
  const xpIntoLevel = safeXp - spec.xpFloor;
  const xpForNextLevel = next ? next.xpFloor - spec.xpFloor : 0;
  const xpToNext = next ? Math.max(0, next.xpFloor - safeXp) : 0;
  const pctToNext = isMax || xpForNextLevel <= 0 ? 1 : Math.min(1, xpIntoLevel / xpForNextLevel);
  return { level: spec.level, xp: safeXp, spec, next, xpIntoLevel, xpForNextLevel, xpToNext, pctToNext, isMax };
}

/** Convenience: resolve the level band directly from lifetime stats. */
export function runnerLevel(stats: RunnerStats): RunnerLevelInfo {
  return runnerLevelForXp(runnerXp(stats));
}

/** True iff the runner has reached `level` (gates unlock features). */
export function runnerHasReached(stats: RunnerStats, level: number): boolean {
  return runnerLevel(stats).level >= level;
}

// ── Persistence seam (defensive; never throws) ─────────────────────────────────

const ROLE_KEY = "yoink_ww_role_v1";
const RUNNER_STATS_KEY = "yoink_ww_runner_v1";

const fin = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** Read the persisted role, or null. Never throws. */
export function loadRole(): WarRole | null {
  try {
    const raw = localStorage.getItem(ROLE_KEY);
    return isWarRole(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Persist the chosen role. Never throws. */
export function saveRole(role: WarRole): void {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    /* private mode / unavailable — keep in memory only */
  }
}

/** Load lifetime runner stats, defaulting + finite-guarding every field. */
export function loadRunnerStats(): RunnerStats {
  try {
    const raw = localStorage.getItem(RUNNER_STATS_KEY);
    if (!raw) return { ...EMPTY_RUNNER_STATS };
    const parsed = JSON.parse(raw) as Partial<RunnerStats>;
    return {
      attempts: Math.max(0, fin(parsed.attempts, 0)),
      cracks: Math.max(0, fin(parsed.cracks, 0)),
      solWon: Math.max(0, fin(parsed.solWon, 0)),
    };
  } catch {
    return { ...EMPTY_RUNNER_STATS };
  }
}

/** Persist lifetime runner stats. Never throws. */
export function saveRunnerStats(stats: RunnerStats): void {
  try {
    localStorage.setItem(RUNNER_STATS_KEY, JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}

/** Fold a settled siege into the lifetime stats (pure transition). */
export function recordSiege(prev: RunnerStats, outcome: "win" | "loss", seized: number): RunnerStats {
  return {
    attempts: prev.attempts + 1,
    cracks: prev.cracks + (outcome === "win" ? 1 : 0),
    solWon: prev.solWon + (outcome === "win" ? Math.max(0, seized) : 0),
  };
}
