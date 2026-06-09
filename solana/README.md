# YOINK.GG — King's Bag · Solana Program

Anchor smart contract powering the on-chain mechanics of YOINK.GG.

---

## Architecture

```
GlobalConfig (PDA: ["config"])
  └── authority    — house wallet, opens rounds
  └── treasury     — receives 10% rake on every yoink
  └── jackpot      — receives 5% reserve on every yoink

RoundState (PDA: ["round", round_number_u64_le])
  └── king          — current bag holder
  └── bag_lamports  — total SOL sitting in this PDA
  └── yoink_count   — drives cost escalation
  └── last_yoink_ts — unix timestamp, drives the 30s countdown

WalletCooldown (PDA: ["cooldown", wallet_pubkey, round_number_u64_le])
  └── last_yoink_ts — enforces 3s per-wallet anti-snipe cooldown
```

---

## Instructions

| Instruction | Who calls it | What it does |
|---|---|---|
| `initialize_config` | House (once) | Sets authority, treasury, jackpot |
| `open_round` | House | Creates RoundState PDA, funds 2 SOL starting bag |
| `yoink` | Any player | Pays escalating cost, becomes king, resets timer |
| `settle` | Anyone | After 30s, pays full bag to current king |

---

## Economics

```
Every YOINK payment splits as:
  85%  → bag (RoundState PDA, paid to king on settle)
  10%  → treasury (your rake)
   5%  → jackpot reserve

Cost per yoink within a round:
  YOINK #1  → 0.100 SOL
  YOINK #2  → 0.125 SOL
  YOINK #3  → 0.150 SOL
  ...
  YOINK #17 → 0.500 SOL (capped)

Resets to 0.100 SOL on each new round.
```

---

## Deployment

### Prerequisites
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.30.1
avm use 0.30.1
```

### Local development
```bash
cd solana
npm install

# Start local validator
solana-test-validator

# Build + test
anchor build
anchor test

# Deploy to localnet
anchor deploy
anchor migrate
```

### Devnet deployment
```bash
# Set your wallet
solana config set --url devnet
solana airdrop 5  # get devnet SOL

# Deploy
anchor deploy --provider.cluster devnet

# Init config (set env vars first)
export TREASURY_PUBKEY="YOUR_TREASURY_WALLET"
export JACKPOT_PUBKEY="YOUR_JACKPOT_WALLET"
anchor migrate --provider.cluster devnet

# Open first round
anchor run open-round --provider.cluster devnet
```

### Mainnet checklist before going live
- [ ] Replace placeholder program ID in `declare_id!()` with real deployed ID
- [ ] Update `Anchor.toml` with real program ID
- [ ] Set real TREASURY_PUBKEY and JACKPOT_PUBKEY
- [ ] Audit the program (recommend OtterSec or Neodyme)
- [ ] Test all instructions on devnet with real SOL amounts
- [ ] Set up a crank bot to call `settle()` when rounds expire
- [ ] Add a `pause` instruction gated to authority for emergency stop

---

## Frontend Integration

After deploying, update your frontend:

```ts
// src/lib/solana.ts
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { KingsBag } from "./idl/kings_bag";
import idl from "./idl/kings_bag.json";

// Copy target/idl/kings_bag.json here after anchor build
export const PROGRAM_ID = new PublicKey("YOUR_DEPLOYED_PROGRAM_ID");

export function getProgram(provider: AnchorProvider) {
  return new Program<KingsBag>(idl as KingsBag, provider);
}
```

Then swap `useGameState.ts` simulation calls for real on-chain reads:
- Subscribe to `RoundState` account with `connection.onAccountChange`
- Listen to `YoinkEvent` program logs for the activity feed
- Call `yoink` instruction on button press via wallet adapter
