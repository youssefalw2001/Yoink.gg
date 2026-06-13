/**
 * YOINK.GG — Solana network config
 *
 * SAFETY: defaults to DEVNET. Wallet connection + balance reads are the only
 * on-chain actions wired today — these move ZERO funds.
 */

import { clusterApiUrl, Connection, type Cluster } from "@solana/web3.js";

const ENV_NETWORK = (import.meta.env.VITE_SOLANA_NETWORK as string | undefined)?.toLowerCase();

export const SOLANA_NETWORK: Cluster =
  ENV_NETWORK === "mainnet-beta" || ENV_NETWORK === "testnet" || ENV_NETWORK === "devnet"
    ? (ENV_NETWORK as Cluster)
    : "devnet";

/** Optional custom RPC via env, else public cluster RPC. */
export const RPC_ENDPOINT =
  (import.meta.env.VITE_SOLANA_RPC as string | undefined) || clusterApiUrl(SOLANA_NETWORK);

/** Human label for the network badge. */
export const NETWORK_LABEL =
  SOLANA_NETWORK === "mainnet-beta" ? "Mainnet" :
  SOLANA_NETWORK === "testnet"      ? "Testnet" :
  "Devnet";

/** Shared read-only connection used for balance lookups. */
export const connection = new Connection(RPC_ENDPOINT, "confirmed");

export const LAMPORTS_PER_SOL = 1_000_000_000;
