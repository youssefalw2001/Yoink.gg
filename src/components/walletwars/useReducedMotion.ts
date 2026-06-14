/**
 * usePrefersReducedMotion — reactive `prefers-reduced-motion` hook shared by the
 * Wallet Wars "Siege the Vault" UI. Mirrors the inline `matchMedia` guard used
 * elsewhere in the codebase, but as a subscribed hook so components re-render if
 * the OS setting changes mid-session. SSR/no-`matchMedia` safe (defaults false).
 */

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setReduced(mql.matches);
    onChange();
    // Safari < 14 only supports the deprecated addListener signature.
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  return reduced;
}
