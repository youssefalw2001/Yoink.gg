/**
 * useEarningsLedger — buckets a Vault Lord's banked fee income over time so the
 * BUILD-tab earnings hero can show TODAY / THIS WEEK / LIFETIME totals.
 *
 * The engine's `Vault.feesEarned` is a monotonic lifetime-tolls counter for the
 * CURRENT vault (it resets to 0 when a vault is cashed out and a new one opens).
 * This hook watches positive deltas in that counter and accumulates them into a
 * persistent ledger keyed by UTC day, so the account-level totals survive a
 * vault close/reopen. It moves no SOL — pure bookkeeping over a value the engine
 * already produces.
 */

import { useEffect, useRef, useState } from "react";

const LEDGER_KEY = "yoink_ww_earnings_v1";
const DAY_MS = 24 * 60 * 60 * 1_000;
/** Keep ~2 weeks of day buckets so "this week" is always covered. */
const KEEP_DAYS = 16;

interface Ledger {
  /** Account-level lifetime fees banked (SOL). */
  lifetime: number;
  /** UTC-day-index → fees banked that day (SOL). */
  days: Record<string, number>;
}

export interface EarningsTotals {
  today: number;
  week: number;
  lifetime: number;
}

function utcDayIndex(now: number): number {
  return Math.floor(now / DAY_MS);
}

function loadLedger(): Ledger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return { lifetime: 0, days: {} };
    const parsed = JSON.parse(raw) as Partial<Ledger>;
    const lifetime = typeof parsed.lifetime === "number" && Number.isFinite(parsed.lifetime) ? parsed.lifetime : 0;
    const days: Record<string, number> = {};
    if (parsed.days && typeof parsed.days === "object") {
      for (const [k, v] of Object.entries(parsed.days)) {
        if (typeof v === "number" && Number.isFinite(v)) days[k] = v;
      }
    }
    return { lifetime, days };
  } catch {
    return { lifetime: 0, days: {} };
  }
}

function saveLedger(l: Ledger): void {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(l));
  } catch {
    /* ignore */
  }
}

/** Prune day buckets older than KEEP_DAYS relative to `today`. */
function prune(days: Record<string, number>, today: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(days)) {
    const day = Number(k);
    if (Number.isFinite(day) && today - day < KEEP_DAYS) out[k] = v;
  }
  return out;
}

/** Sum the buckets for the trailing 7 days (inclusive of today). */
function weekTotal(days: Record<string, number>, today: number): number {
  let sum = 0;
  for (let d = today - 6; d <= today; d++) sum += days[String(d)] ?? 0;
  return sum;
}

/**
 * Track the active vault's `feesEarned` and roll positive deltas into the
 * persistent ledger. `vaultId` lets us reset the delta baseline when a new vault
 * opens (so a reset-to-0 feesEarned is never counted as negative income).
 */
export function useEarningsLedger(vaultId: string | null, feesEarned: number): EarningsTotals {
  const [totals, setTotals] = useState<EarningsTotals>(() => {
    const l = loadLedger();
    const today = utcDayIndex(Date.now());
    return { today: l.days[String(today)] ?? 0, week: weekTotal(l.days, today), lifetime: l.lifetime };
  });

  const prevVaultId = useRef<string | null>(vaultId);
  const prevFees = useRef<number>(vaultId ? feesEarned : 0);

  useEffect(() => {
    const safe = Number.isFinite(feesEarned) ? feesEarned : 0;

    // New vault (or first mount with a vault) → reset the delta baseline, no income recorded.
    if (vaultId !== prevVaultId.current) {
      prevVaultId.current = vaultId;
      prevFees.current = vaultId ? safe : 0;
      return;
    }

    const delta = safe - prevFees.current;
    prevFees.current = safe;
    if (delta <= 1e-9) return; // no new income this update

    const ledger = loadLedger();
    const today = utcDayIndex(Date.now());
    const key = String(today);
    const days = prune({ ...ledger.days, [key]: (ledger.days[key] ?? 0) + delta }, today);
    const next: Ledger = { lifetime: ledger.lifetime + delta, days };
    saveLedger(next);
    setTotals({ today: next.days[key] ?? 0, week: weekTotal(next.days, today), lifetime: next.lifetime });
  }, [vaultId, feesEarned]);

  return totals;
}
