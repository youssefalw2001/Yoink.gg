/**
 * YOINK.GG — Fuse randomness (commit–reveal) + the real-VRF path
 *
 * WHAT THIS IS (today, devnet/sim):
 *   A genuine commit–reveal. Before the fuse is active we publish a SHA-256
 *   commitment of (round, fuse, secret). At round end we reveal the preimage so
 *   anyone can recompute the hash and confirm the fuse wasn't changed after the
 *   fact. `verifyCommit` does exactly that recomputation.
 *
 * WHAT THIS IS NOT (the honest caveat):
 *   This is NOT trustless VRF. The secret is generated client-side, and in a
 *   pure frontend the fuse value also lives in browser memory — so this proves
 *   "the commitment matches the reveal", not "the house couldn't have known".
 *   TRUE verifiable randomness must come from the chain.
 *
 * THE REAL VRF PATH (mainnet/devnet program):
 *   1. The on-chain program (solana/programs/kings-bag — currently a placeholder
 *      ID, NOT deployed) requests randomness from Switchboard On-Demand at round
 *      start and stores the request pubkey + commitment in the RoundState PDA.
 *   2. The fuse end slot is derived from the revealed randomness on settle; the
 *      program verifies the Switchboard proof on-chain before paying out.
 *   3. The client subscribes to the RoundState account and reads the revealed
 *      value — replacing commitFuse/verifyCommit below with on-chain reads.
 *   Until that program is deployed AND audited, gameplay stakes stay simulated.
 */

const subtleAvailable = typeof crypto !== "undefined" && !!crypto.subtle;

async function sha256Hex(message: string): Promise<string> {
  if (subtleAvailable) {
    const data = new TextEncoder().encode(message);
    const buf  = await crypto.subtle.digest("SHA-256", data);
    return "0x" + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Deterministic fallback (non-crypto) when SubtleCrypto is unavailable.
  let h = 0;
  for (let i = 0; i < message.length; i++) h = (h * 31 + message.charCodeAt(i)) >>> 0;
  return "0x" + h.toString(16).padStart(8, "0").repeat(5);
}

export interface FuseCommitment {
  /** Public commitment hash, published BEFORE the fuse is active. */
  commitHash: string;
  /** Preimage revealed AFTER the round so the commit can be verified. */
  preimage: string;
}

/**
 * Build a commit–reveal commitment for a specific fuse value.
 * The preimage embeds a fresh random secret so the hash can't be brute-forced
 * from the (small) fuse-seconds space.
 */
export async function commitFuse(roundNumber: number, fuseSeconds: number): Promise<FuseCommitment> {
  const secret    = crypto?.getRandomValues
    ? Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("")
    : Math.random().toString(36).slice(2);
  const preimage  = `yoink:round=${roundNumber}:fuse=${fuseSeconds}:secret=${secret}`;
  const commitHash = await sha256Hex(preimage);
  return { commitHash, preimage };
}

/** Recompute the hash of a revealed preimage and check it matches the commit. */
export async function verifyCommit(preimage: string, commitHash: string): Promise<boolean> {
  if (!preimage || !commitHash) return false;
  const recomputed = await sha256Hex(preimage);
  return recomputed === commitHash;
}

/** Short display form of a hash for chips/cards. */
export function shortHash(hash: string, head = 10, tail = 6): string {
  if (hash.length <= head + tail) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
