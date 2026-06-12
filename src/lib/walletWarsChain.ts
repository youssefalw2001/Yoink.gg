/**
 * YOINK.GG — Wallet Wars on-chain client (escrow + Switchboard VRF)
 *
 * ⚠️  ESCROW_ENABLED is FALSE. The on-chain program (solana/programs/wallet-wars)
 *     is NOT deployed or audited, so the live app stays on the simulation in
 *     useWalletWars(). This module is the wiring that lights up once the program
 *     is deployed to devnet and audited — flip ESCROW_ENABLED and fill the
 *     program ID + IDL-based instruction encoding below.
 *
 * RAID FLOW (two transactions, because VRF reveals across slots):
 *   1. Commit a Switchboard On-Demand randomness account (client SDK).
 *   2. request_raid(wager) — locks the wager + binds the randomness account.
 *   3. Wait for Switchboard to reveal (a slot or two).
 *   4. settle_raid() — program reads the revealed value, derives the 50/50
 *      outcome, moves matched stakes + bounty, takes the 15% rake.
 *
 * Nothing here moves real SOL while ESCROW_ENABLED is false.
 */

import { PublicKey } from "@solana/web3.js";

/** Master switch — keep FALSE until the program is deployed AND audited. */
export const ESCROW_ENABLED = false;

/** Filled in after `anchor deploy` writes the real program id. */
export const WALLET_WARS_PROGRAM_ID = "WWarsXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

/** True only when real-money escrow is live. The UI checks this to decide
 *  whether to route raids on-chain or through the local simulation. */
export function isEscrowLive(): boolean {
  return ESCROW_ENABLED;
}

function programId(): PublicKey {
  if (!ESCROW_ENABLED) {
    throw new Error("Wallet Wars escrow is disabled — program not deployed/audited.");
  }
  return new PublicKey(WALLET_WARS_PROGRAM_ID);
}

// ── PDA derivation (matches the on-chain seeds) ───────────────────────────────

export function configPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId())[0];
}
export function stashPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("stash"), owner.toBuffer()], programId())[0];
}
export function ticketPda(raiderStash: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("ticket"), raiderStash.toBuffer()], programId())[0];
}

// ── Instruction builders ──────────────────────────────────────────────────────
// These need the deployed program's IDL (via @coral-xyz/anchor) to encode the
// instruction data correctly. Left as guarded stubs so the bundle never ships
// an inert anchor client; implement during the devnet integration pass.

const NOT_READY = "Wallet Wars on-chain program is not deployed yet.";

export function buildOpenStashTx(): never { throw new Error(NOT_READY); }
export function buildCloseStashTx(): never { throw new Error(NOT_READY); }
export function buildPlaceBountyTx(): never { throw new Error(NOT_READY); }
export function buildRequestRaidTx(): never { throw new Error(NOT_READY); }
export function buildSettleRaidTx(): never { throw new Error(NOT_READY); }
