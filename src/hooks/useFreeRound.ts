/**
 * YOINK.GG — Free Round Schedule Engine (Layer 3)
 *
 * A "Free Round" is a 10-minute window that opens every 2 hours
 * on a deterministic wall-clock schedule — no server required.
 * Anyone entering The Pit during an active free round gets their
 * first YOINK at zero cost. The house seeds the bag at 0.3 SOL.
 *
 * Schedule: free round starts at minute 0 of every even UTC hour.
 *   e.g. 00:00, 02:00, 04:00 ... 22:00 UTC
 *   Active window: 10 minutes from the cycle start.
 *
 * The hook re-evaluates every 30 seconds so countdown text stays
 * current without hammering React state. Uses transform-safe
 * CSS via the returned values — no layout-triggering updates.
 */

import { useEffect, useState } from "react";

const CYCLE_MS    = 2 * 60 * 60 * 1_000;  // 2 hours between free rounds
const DURATION_MS = 10 * 60 * 1_000;      // each free round lasts 10 minutes
const WARN_MS     = 30 * 60 * 1_000;      // show "upcoming" badge within 30 min

export interface FreeRoundState {
  /** True while a free round is currently running */
  isActive: boolean;
  /** Minutes remaining while active (0 when inactive) */
  minutesLeft: number;
  /** Minutes until the NEXT free round starts (0 while active) */
  minutesUntilNext: number;
  /** True when a free round starts within WARN_MS — show upcoming badge */
  isUpcoming: boolean;
  /** House-seeded bag amount for free rounds */
  bagSeed: number;
}

export function useFreeRound(): FreeRoundState {
  const [now, setNow] = useState(() => Date.now());

  // Refresh every 30 s — cheap, keeps countdown text accurate
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return computeFreeRound(now);
}

/** Pure computation — exported so components can call it without a hook. */
export function computeFreeRound(now: number): FreeRoundState {
  const cyclePos        = now % CYCLE_MS;                    // ms into current cycle
  const isActive        = cyclePos < DURATION_MS;
  const minutesLeft     = isActive
    ? Math.ceil((DURATION_MS - cyclePos) / 60_000)
    : 0;
  const msUntilNext     = isActive ? 0 : CYCLE_MS - cyclePos;
  const minutesUntilNext = isActive ? 0 : Math.ceil(msUntilNext / 60_000);
  const isUpcoming      = !isActive && msUntilNext <= WARN_MS;

  return { isActive, minutesLeft, minutesUntilNext, isUpcoming, bagSeed: 0.3 };
}
