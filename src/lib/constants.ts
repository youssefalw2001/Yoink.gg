/**
 * YOINK.GG — Network constants (ZERO heavy imports)
 *
 * Extracted from solana.ts so that UI components (Header badge etc.)
 * can reference network labels without pulling in @solana/web3.js.
 */

const ENV_NETWORK = (import.meta.env.VITE_SOLANA_NETWORK as string | undefined)?.toLowerCase();

export type SolanaCluster = "mainnet-beta" | "testnet" | "devnet";

export const SOLANA_NETWORK: SolanaCluster =
  ENV_NETWORK === "mainnet-beta" || ENV_NETWORK === "testnet" || ENV_NETWORK === "devnet"
    ? (ENV_NETWORK as SolanaCluster)
    : "devnet";

/** Human label for the network badge. */
export const NETWORK_LABEL =
  SOLANA_NETWORK === "mainnet-beta" ? "Mainnet" :
  SOLANA_NETWORK === "testnet"      ? "Testnet" :
  "Devnet";
