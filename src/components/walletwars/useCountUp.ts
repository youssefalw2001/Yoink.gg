/**
 * useCountUp — animate a number from its previous value to the next, easing out.
 * Reduced-motion safe (snaps instantly). Shared by the Wallet Wars earnings hero
 * + stat tickers so the "fees piling up" feel is consistent and GPU-cheap (it
 * animates a state number, never layout).
 */

import { useEffect, useRef, useState } from "react";

export function useCountUp(value: number, reduced: boolean, durationMs = 650): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const safe = Number.isFinite(value) ? value : 0;
    if (reduced || safe === fromRef.current) {
      fromRef.current = safe;
      setDisplay(safe);
      return;
    }
    const from = fromRef.current;
    const delta = safe - from;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(from + delta * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = safe;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, reduced, durationMs]);

  return display;
}
