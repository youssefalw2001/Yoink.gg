/**
 * Anchor migration — runs once after `anchor deploy`.
 * Initializes the GlobalConfig with your treasury and jackpot wallets.
 *
 * Usage:
 *   anchor migrate --provider.cluster devnet
 *
 * Set TREASURY_PUBKEY and JACKPOT_PUBKEY as env vars before running.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

module.exports = async function (provider: anchor.AnchorProvider) {
  anchor.setProvider(provider);

  const program = anchor.workspace.KingsBag;

  const treasury = new PublicKey(
    process.env.TREASURY_PUBKEY ??
      "11111111111111111111111111111111", // replace before mainnet
  );
  const jackpot = new PublicKey(
    process.env.JACKPOT_PUBKEY ??
      "11111111111111111111111111111111", // replace before mainnet
  );

  const [configPubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );

  // Check if already initialised
  try {
    await program.account.globalConfig.fetch(configPubkey);
    console.log("✓ GlobalConfig already exists — skipping init");
    return;
  } catch {
    // not yet initialised
  }

  await program.methods
    .initializeConfig(treasury, jackpot)
    .accounts({
      config: configPubkey,
      authority: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("✓ GlobalConfig initialised");
  console.log("  authority:", provider.wallet.publicKey.toBase58());
  console.log("  treasury: ", treasury.toBase58());
  console.log("  jackpot:  ", jackpot.toBase58());
};
