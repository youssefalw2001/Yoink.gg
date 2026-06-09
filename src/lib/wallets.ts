/**
 * Fake Solana-style wallet address generation + degen aliases.
 * Base58 alphabet, 44 chars — realistic enough for simulation.
 */

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function randomWallet(): string {
  let out = "";
  for (let i = 0; i < 44; i++) {
    out += BASE58[Math.floor(Math.random() * BASE58.length)];
  }
  return out;
}

/** A pool of pre-generated wallets so the simulation feels consistent. */
export const WALLET_POOL: string[] = Array.from({ length: 40 }, randomWallet);

export function randomPoolWallet(exclude?: string): string {
  let pick = WALLET_POOL[Math.floor(Math.random() * WALLET_POOL.length)];
  let guard = 0;
  while (pick === exclude && guard < 10) {
    pick = WALLET_POOL[Math.floor(Math.random() * WALLET_POOL.length)];
    guard++;
  }
  return pick;
}
