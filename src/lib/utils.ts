import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Truncate a wallet address to `xxxx...xxxx`. Null-safe. */
export function truncateAddress(address?: string | null, head = 4, tail = 4): string {
  if (!address || typeof address !== "string") return "";
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}...${address.slice(-tail)}`;
}

/**
 * Format a SOL amount with fixed precision + thin spacing.
 *
 * TOTAL & crash-proof: a single bad value (undefined / null / NaN / ±Infinity,
 * or a non-number sneaking through from a corrupt persisted record) must never
 * throw during render. `undefined.toLocaleString()` is exactly the kind of
 * unhandled exception that white-screens the PWA / crashes the in-app browser,
 * so we coerce any non-finite input to 0 instead of letting it blow up.
 */
export function formatSol(amount: number, decimals = 3): string {
  const safe = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  const safeDecimals =
    Number.isFinite(decimals) ? Math.min(Math.max(Math.trunc(decimals), 0), 20) : 3;
  return safe.toLocaleString("en-US", {
    minimumFractionDigits: safeDecimals,
    maximumFractionDigits: safeDecimals,
  });
}

/** Clamp helper. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Deterministic hue (0–360) from a string — for generated avatar colors. */
export function hueFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}
