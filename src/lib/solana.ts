/**
 * YOINK.GG — Solana network config (HEAVY — imports @solana/web3.js)
 *
 * Only imported by wallet-solana.tsx and other chain-interaction modules.
 * UI components should import from @/lib/constants instead to avoid
 * pulling the Solana vendor chunk into the critical path.
 */

import { clusterApiUrl, Connection } from "@solana/web3.js";
import { SOLANA_NETWORK, NETWORK_LABEL } from "@/lib/constants";

// Re-export for backward compat with any module that already imports from here
export { SOLANA_NETWORK, NETWORK_LABEL };

/** Optional custom RPC (e.g. Helius/QuickNode) via env, else public cluster RPC. */
export const RPC_ENDPOINT =
  (import.meta.env.VITE_SOLANA_RPC as string | undefined) || clusterApiUrl(SOLANA_NETWORK);

/** Shared read-only connection used for balance lookups. */
export const connection = new Connection(RPC_ENDPOINT, "confirmed");

export const LAMPORTS_PER_SOL = 1_000_000_000;
