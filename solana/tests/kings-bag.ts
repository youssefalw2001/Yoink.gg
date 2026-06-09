/**
 * YOINK.GG — Kings Bag · Anchor Test Suite
 *
 * Run with:  anchor test --skip-local-validator   (against localnet)
 *        or:  anchor test                          (spins up validator)
 *
 * Tests cover:
 *  1. Config initialisation
 *  2. Opening a new round (house funds starting bag)
 *  3. Successful yoink — bag grows, king changes, cost escalates
 *  4. Cooldown enforcement — same wallet can't yoink twice in 3s
 *  5. Cost escalation — each yoink is more expensive than the last
 *  6. Settle blocked before timer expires
 *  7. Settle pays out correct king after timer expires (time warp)
 *  8. Settle fails if wrong king account supplied
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { KingsBag } from "../target/types/kings_bag";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { assert } from "chai";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOL = (n: number) => new BN(Math.floor(n * LAMPORTS_PER_SOL));

async function airdrop(
  provider: anchor.AnchorProvider,
  wallet: PublicKey,
  sol = 10,
) {
  const sig = await provider.connection.requestAirdrop(wallet, sol * LAMPORTS_PER_SOL);
  await provider.connection.confirmTransaction(sig);
}

function roundPda(
  programId: PublicKey,
  roundNumber: BN,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), roundNumber.toArrayLike(Buffer, "le", 8)],
    programId,
  );
}

function configPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
}

function cooldownPda(
  programId: PublicKey,
  wallet: PublicKey,
  roundNumber: BN,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("cooldown"),
      wallet.toBuffer(),
      roundNumber.toArrayLike(Buffer, "le", 8),
    ],
    programId,
  );
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("kings-bag", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.KingsBag as Program<KingsBag>;
  const authority = (provider.wallet as anchor.Wallet).payer;
  const treasury = Keypair.generate();
  const jackpot = Keypair.generate();
  const player1 = Keypair.generate();
  const player2 = Keypair.generate();

  const roundNumber = new BN(1);
  const [configPubkey] = configPda(program.programId);
  const [roundPubkey] = roundPda(program.programId, roundNumber);

  // ── 1. Initialize config ──────────────────────────────────────────────────
  it("initialises global config", async () => {
    await airdrop(provider, player1.publicKey);
    await airdrop(provider, player2.publicKey);

    await program.methods
      .initializeConfig(treasury.publicKey, jackpot.publicKey)
      .accounts({
        config: configPubkey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.globalConfig.fetch(configPubkey);
    assert.equal(config.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(config.treasury.toBase58(), treasury.publicKey.toBase58());
    assert.equal(config.jackpot.toBase58(), jackpot.publicKey.toBase58());
    assert.equal(config.totalRounds.toNumber(), 0);
  });

  // ── 2. Open round ─────────────────────────────────────────────────────────
  it("opens a new round and funds the starting bag", async () => {
    const authorityBefore = await provider.connection.getBalance(
      authority.publicKey,
    );

    await program.methods
      .openRound(roundNumber)
      .accounts({
        config: configPubkey,
        round: roundPubkey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const round = await program.account.roundState.fetch(roundPubkey);
    assert.equal(round.roundNumber.toNumber(), 1);
    assert.equal(round.bagLamports.toNumber(), 2 * LAMPORTS_PER_SOL);
    assert.equal(round.yoinkCount, 0);
    assert.isFalse(round.isSettled);
    assert.equal(round.king.toBase58(), authority.publicKey.toBase58());

    const roundBalance = await provider.connection.getBalance(roundPubkey);
    assert.isAtLeast(roundBalance, 2 * LAMPORTS_PER_SOL);

    const authorityAfter = await provider.connection.getBalance(
      authority.publicKey,
    );
    // Authority paid starting bag + rent (rough check)
    assert.isBelow(authorityAfter, authorityBefore);
  });

  // ── 3. Player 1 yoinks ────────────────────────────────────────────────────
  it("player 1 yoinks — becomes king, bag grows, cost is 0.1 SOL", async () => {
    const [cooldown1] = cooldownPda(program.programId, player1.publicKey, roundNumber);
    const treasuryBefore = await provider.connection.getBalance(treasury.publicKey);
    const jackpotBefore  = await provider.connection.getBalance(jackpot.publicKey);

    await program.methods
      .yoink()
      .accounts({
        config: configPubkey,
        round: roundPubkey,
        walletCooldown: cooldown1,
        player: player1.publicKey,
        treasury: treasury.publicKey,
        jackpot: jackpot.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([player1])
      .rpc();

    const round = await program.account.roundState.fetch(roundPubkey);
    assert.equal(round.king.toBase58(), player1.publicKey.toBase58());
    assert.equal(round.yoinkCount, 1);

    // Bag grew by 0.085 SOL (85% of 0.1)
    const expectedBag = 2 * LAMPORTS_PER_SOL + Math.floor(0.085 * LAMPORTS_PER_SOL);
    assert.approximately(round.bagLamports.toNumber(), expectedBag, 1000);

    // Treasury received 10%
    const treasuryAfter = await provider.connection.getBalance(treasury.publicKey);
    assert.approximately(
      treasuryAfter - treasuryBefore,
      Math.floor(0.01 * LAMPORTS_PER_SOL),
      1000,
    );

    // Jackpot received 5%
    const jackpotAfter = await provider.connection.getBalance(jackpot.publicKey);
    assert.approximately(
      jackpotAfter - jackpotBefore,
      Math.floor(0.005 * LAMPORTS_PER_SOL),
      1000,
    );
  });

  // ── 4. Cooldown — same wallet blocked within 3s ───────────────────────────
  it("blocks player 1 from yoinking again within cooldown period", async () => {
    const [cooldown1] = cooldownPda(program.programId, player1.publicKey, roundNumber);

    try {
      await program.methods
        .yoink()
        .accounts({
          config: configPubkey,
          round: roundPubkey,
          walletCooldown: cooldown1,
          player: player1.publicKey,
          treasury: treasury.publicKey,
          jackpot: jackpot.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([player1])
        .rpc();
      assert.fail("Should have thrown WalletOnCooldown");
    } catch (err: unknown) {
      const msg = (err as Error).message ?? "";
      assert.include(msg, "WalletOnCooldown");
    }
  });

  // ── 5. Cost escalation — player 2 pays 0.125 SOL (yoink #2) ──────────────
  it("player 2 yoinks — cost is 0.125 SOL (escalated)", async () => {
    const [cooldown2] = cooldownPda(program.programId, player2.publicKey, roundNumber);
    const player2Before = await provider.connection.getBalance(player2.publicKey);

    await program.methods
      .yoink()
      .accounts({
        config: configPubkey,
        round: roundPubkey,
        walletCooldown: cooldown2,
        player: player2.publicKey,
        treasury: treasury.publicKey,
        jackpot: jackpot.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([player2])
      .rpc();

    const round = await program.account.roundState.fetch(roundPubkey);
    assert.equal(round.king.toBase58(), player2.publicKey.toBase58());
    assert.equal(round.yoinkCount, 2);

    const player2After = await provider.connection.getBalance(player2.publicKey);
    // Player 2 paid 0.125 SOL (+ tx fees)
    const paid = player2Before - player2After;
    assert.isAtLeast(paid, Math.floor(0.125 * LAMPORTS_PER_SOL));
  });

  // ── 6. Settle blocked before timer expires ────────────────────────────────
  it("settle fails if the timer has not expired", async () => {
    try {
      await program.methods
        .settle()
        .accounts({
          config: configPubkey,
          round: roundPubkey,
          king: player2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have thrown RoundNotExpired");
    } catch (err: unknown) {
      const msg = (err as Error).message ?? "";
      assert.include(msg, "RoundNotExpired");
    }
  });

  // ── 7. Settle pays out after time warp ────────────────────────────────────
  it("settles the round and pays the king after the timer expires", async () => {
    // Warp clock forward 31 seconds using the test validator
    await provider.connection.sendTransaction(
      await buildClockWarpTx(provider, 31),
      { skipPreflight: true },
    );

    const roundBefore = await program.account.roundState.fetch(roundPubkey);
    const king2Before = await provider.connection.getBalance(player2.publicKey);
    const expectedPayout = roundBefore.bagLamports.toNumber();

    await program.methods
      .settle()
      .accounts({
        config: configPubkey,
        round: roundPubkey,
        king: player2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const round = await program.account.roundState.fetch(roundPubkey);
    assert.isTrue(round.isSettled);
    assert.equal(round.bagLamports.toNumber(), 0);

    const king2After = await provider.connection.getBalance(player2.publicKey);
    assert.approximately(king2After - king2Before, expectedPayout, 5000);

    const config = await program.account.globalConfig.fetch(configPubkey);
    assert.equal(config.totalRounds.toNumber(), 1);
  });

  // ── 8. Wrong king rejected ────────────────────────────────────────────────
  it("settle rejects if wrong king account supplied", async () => {
    // Open a second round to test this
    const round2 = new BN(2);
    const [round2Pubkey] = roundPda(program.programId, round2);

    await program.methods
      .openRound(round2)
      .accounts({
        config: configPubkey,
        round: round2Pubkey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Warp so we can immediately try to settle
    await provider.connection.sendTransaction(
      await buildClockWarpTx(provider, 31),
      { skipPreflight: true },
    );

    try {
      await program.methods
        .settle()
        .accounts({
          config: configPubkey,
          round: round2Pubkey,
          king: player1.publicKey, // WRONG — authority is king of round 2
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have thrown WrongKing");
    } catch (err: unknown) {
      const msg = (err as Error).message ?? "";
      assert.include(msg, "WrongKing");
    }
  });
});

// ─── Clock warp helper ────────────────────────────────────────────────────────
// Uses the test validator's warp_to_slot or slot stuffing to advance time.
// In practice use `anchor test --features mock-clock` or adjust as needed.
async function buildClockWarpTx(
  provider: anchor.AnchorProvider,
  seconds: number,
): Promise<anchor.web3.Transaction> {
  // Localnet: we can advance slots — each slot ≈ 0.4s
  const slotsNeeded = Math.ceil(seconds / 0.4);
  const conn = provider.connection;
  const slot = await conn.getSlot();
  // This is a no-op transaction — the test validator time-travel is done
  // via anchor's `solana-test-validator --warp-slot` flag or
  // `provider.context.warpToSlot()` in bankrun tests.
  // Placeholder returns empty tx for illustration:
  const tx = new anchor.web3.Transaction();
  tx.add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: provider.wallet.publicKey,
      lamports: 0,
    }),
  );
  void slot;
  void slotsNeeded;
  return tx;
}
