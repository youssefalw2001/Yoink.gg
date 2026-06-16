/**
 * YOINK.GG — Client-side siege verification (provable fairness)
 *
 * After the server settles a siege via commit-reveal, the client can
 * independently verify the result using this module. The verification is:
 *
 *   1. SHA-256(seed) === seed_hash   (server didn't change the seed post-commit)
 *   2. rollFromSeed(seed) === roll   (the roll is deterministic)
 *   3. (roll < p_win) === outcome    (the outcome follows from the roll)
 *
 * This module uses the SAME `rollFromSeed` function from walletWarsState.ts
 * (re-exported here for clarity) and a browser-native SHA-256 for the hash.
 *
 * RULE: this module is READ-ONLY verification. It never computes outcomes for
 * settlement — that's the server's job. It only confirms the server was honest.
 */

import { rollFromSeed } from "@/lib/walletWarsState";

export { rollFromSeed };

/** Server-provided verification payload from the settle-siege response. */
export interface SiegeVerification {
  seed: string;
  seed_hash: string;
  roll: number;
  threshold: number; // p_win
  pass: boolean;     // roll < threshold
  outcome_matches: boolean;
}

/**
 * Compute SHA-256 of a string using the Web Crypto API.
 * Returns the hex-encoded hash. Works in all modern browsers + Deno.
 */
export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Full client-side verification of a settled siege. Returns a typed result
 * with individual check outcomes — the UI can show each step.
 *
 * All three checks must pass for the siege to be provably fair:
 *   1. hash_valid:    SHA-256(seed) === seed_hash
 *   2. roll_valid:    rollFromSeed(seed) matches the claimed roll (within ε)
 *   3. outcome_valid: (roll < threshold) matches the claimed outcome
 */
export interface VerificationResult {
  /** All three checks passed — the server was honest. */
  valid: boolean;
  /** SHA-256(seed) === seed_hash */
  hash_valid: boolean;
  /** rollFromSeed(seed) ≈ claimed roll (within floating-point ε) */
  roll_valid: boolean;
  /** (roll < threshold) === claimed_outcome */
  outcome_valid: boolean;
  /** The recomputed values for display. */
  computed: {
    hash: string;
    roll: number;
    pass: boolean;
  };
}

/**
 * Verify a siege outcome from the server's response.
 *
 * @param seed       The revealed seed (hex string)
 * @param seedHash   The pre-committed hash (published before the siege)
 * @param claimedRoll The roll the server claims
 * @param threshold  The published crack chance (p_win)
 * @param claimedWon Whether the server claims the siege was a win
 */
export async function verifySiegeResult(
  seed: string,
  seedHash: string,
  claimedRoll: number,
  threshold: number,
  claimedWon: boolean,
): Promise<VerificationResult> {
  // 1. Hash check: server committed to this seed before the siege
  const computedHash = await sha256(seed);
  const hash_valid = computedHash === seedHash;

  // 2. Roll check: the roll is deterministically derived from the seed
  const computedRoll = rollFromSeed(seed);
  // Allow a tiny floating-point epsilon (the server and client use the same
  // integer FNV-1a → unsigned division, so they should match exactly, but
  // guard against cross-platform float differences)
  const roll_valid = Math.abs(computedRoll - claimedRoll) < 1e-9;

  // 3. Outcome check: did the roll actually beat the threshold?
  const computedPass = computedRoll < threshold;
  const outcome_valid = computedPass === claimedWon;

  return {
    valid: hash_valid && roll_valid && outcome_valid,
    hash_valid,
    roll_valid,
    outcome_valid,
    computed: {
      hash: computedHash,
      roll: computedRoll,
      pass: computedPass,
    },
  };
}
