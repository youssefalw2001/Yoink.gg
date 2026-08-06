/**
 * YOINK.GG — ServerVault → client Vault mapping (Phase 2 foundation).
 *
 * This is the trust/type boundary between the Supabase board and the local
 * engine. It is deliberately a separate, pure module because it is where the
 * genuinely dangerous bugs live, and none of them are visible in a type
 * signature:
 *
 * ── 1. POSTGRES NUMERIC ARRIVES AS A STRING ─────────────────────────────────
 * `supabase-js` returns `NUMERIC(20,9)` columns as JS **strings** to avoid
 * precision loss — `amount` comes back as `"1.000000000"`, not `1`. Every money
 * path downstream (`computeFee`, `computePrize`, corpus comparisons) assumes
 * numbers. A string flows through `+` as CONCATENATION, so an un-coerced
 * `amount` turns `0.02 * V` into silent nonsense and `a + b` into `"1.02.0"`.
 * TypeScript cannot catch it because the declared interface claims `number`.
 * Every numeric field is therefore coerced here, once.
 *
 * ── 2. TIMESTAMPS ARRIVE AS ISO STRINGS ─────────────────────────────────────
 * `opened_at` / `shield_until` are `timestamptz` → ISO strings. The engine
 * compares them against `Date.now()` as epoch millis. A raw string comparison
 * would make every vault look permanently shielded (or never shielded).
 *
 * ── 3. TIER IS DERIVED, NEVER TRUSTED ───────────────────────────────────────
 * The server stores a denormalised `tier` column. We ignore it and re-derive
 * from `amount` via the engine's own `tierIndexForAmount`, so the raid-up rules
 * and the displayed economics can never disagree with the client's siegeMath —
 * the same class of client/server divergence that made the settle-siege economy
 * mismatch dangerous.
 *
 * Pure, total, and defensive: a malformed row yields a safe vault rather than
 * throwing, because one bad row must not white-screen the board.
 */

import { DEFAULT_RISK_PROFILE, isRiskProfile, type RiskProfile } from "@/lib/siegeMath";
import { TIERS, tierIndexForAmount, type Vault } from "@/lib/walletWarsState";
import type { ServerVault } from "@/lib/supabaseWar";

/**
 * A row as it ACTUALLY arrives over the wire.
 *
 * `ServerVault` documents the intended shape, but every field is untrusted at
 * runtime: NUMERICs are strings, timestamps are strings, and a partial `select`
 * may omit columns entirely. Typing the boundary loosely is deliberate — a
 * signature that claims `amount: number` here would be a lie that hides the very
 * bug this module exists to prevent.
 */
export type UntrustedRow = Partial<Record<keyof ServerVault, unknown>> & Record<string, unknown>;

/**
 * Coerce a Postgres-or-JSON numeric into a finite number.
 *
 * Handles the `NUMERIC → string` case, plus `null`/`undefined`/`NaN`/`Infinity`
 * from a partial row. Never returns a non-finite value.
 */
export function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return fallback;
    const n = Number(t);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** Coerce an ISO timestamp (or epoch number) to epoch milliseconds. */
export function toEpochMs(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string" && v.trim() !== "") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : fallback;
  }
  return fallback;
}

/** Non-negative integer coercion for counters (survived / cracked / streak). */
export function toCount(v: unknown): number {
  const n = Math.floor(toNum(v, 0));
  return n > 0 ? n : 0;
}

/**
 * Map one server row onto the engine's `Vault`.
 *
 * @param sv        the raw row (typed loosely because the wire shape is untrusted)
 * @param myOwnerId the signed-in user's profile id, used to set `isYou`
 * @param now       clock injection for deterministic tests
 */
export function serverVaultToVault(
  sv: UntrustedRow,
  myOwnerId: string | null,
  now: number = Date.now(),
): Vault {
  const amount = Math.max(0, toNum(sv.amount, 0));
  const ownerId = typeof sv.owner_id === "string" ? sv.owner_id : "";

  return {
    id: typeof sv.id === "string" && sv.id ? sv.id : `server-${ownerId || "unknown"}`,
    // Prefer a chosen display name; fall back to the wallet so the board is never blank.
    wallet: (typeof sv.display_name === "string" && sv.display_name.trim() !== "")
      ? sv.display_name.trim().slice(0, 24)
      : (typeof sv.wallet === "string" && sv.wallet ? sv.wallet : "Unknown"),
    isYou: !!myOwnerId && ownerId === myOwnerId,
    amount,
    banked: Math.max(0, toNum(sv.banked, 0)),
    feesEarned: Math.max(0, toNum(sv.fees_earned, 0)),
    survived: toCount(sv.survived),
    cracked: toCount(sv.cracked),
    streak: toCount(sv.streak),
    openedAt: toEpochMs(sv.opened_at, now),
    shieldUntil: toEpochMs(sv.shield_until, 0),
    // `seq` is the optimistic-concurrency token. The board query may not select
    // it; default to 0 rather than NaN so a comparison never silently fails.
    seq: toCount((sv as { seq?: unknown }).seq),
    compound: sv.compound === true,
    bountyPool: Math.max(0, toNum(sv.bounty_pool, 0)),
    bountyExpiry: toEpochMs(sv.bounty_expiry, 0),
    riskProfile: isRiskProfile(sv.risk_profile) ? sv.risk_profile : DEFAULT_RISK_PROFILE,
  };
}

/**
 * Map a whole board, dropping rows that cannot be made sane.
 *
 * A vault with a non-positive corpus is excluded: it cannot be sieged (the fee is
 * a fraction of the corpus) and it would render as a dead `0.00 SOL` card.
 */
export function serverBoardToStashes(
  rows: ReadonlyArray<UntrustedRow> | null | undefined,
  myOwnerId: string | null,
  now: number = Date.now(),
): Vault[] {
  if (!Array.isArray(rows)) return [];
  const out: Vault[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const v = serverVaultToVault(row, myOwnerId, now);
    if (v.amount <= 0) continue;            // unsiegeable / closed-out
    if (seen.has(v.id)) continue;           // defensive against duplicate rows
    seen.add(v.id);
    out.push(v);
  }
  return out;
}

/**
 * The tier id the CLIENT derives for a corpus. Exposed so callers can assert the
 * server's denormalised `tier` column agrees, and log when it does not, without
 * ever letting the server's value drive game rules.
 */
export function derivedTierId(amount: number): (typeof TIERS)[number]["id"] {
  return TIERS[tierIndexForAmount(amount)].id;
}

/**
 * True when the server's denormalised tier disagrees with the client's own
 * derivation. A mismatch means the server's `trg_vault_tier` trigger and the
 * client's `tierIndexForAmount` thresholds have drifted — worth surfacing loudly,
 * since tier controls raid-up eligibility and the published odds.
 */
export function tierDisagrees(sv: UntrustedRow): boolean {
  if (typeof sv.tier !== "string") return false;
  return sv.tier !== derivedTierId(Math.max(0, toNum(sv.amount, 0)));
}

/** The risk profile actually in force for a row (validated, never undefined). */
export function effectiveRiskProfile(sv: UntrustedRow): RiskProfile {
  return isRiskProfile(sv.risk_profile) ? sv.risk_profile : DEFAULT_RISK_PROFILE;
}
