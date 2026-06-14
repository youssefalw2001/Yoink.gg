# Requirements Document

## Introduction

Wallet Wars is the flagship PvP mode of YOINK.GG. Today it runs entirely as a
**client-side simulation**: `ESCROW_ENABLED` is `false` in
`src/lib/walletWarsChain.ts`, no raids settle on-chain, and all stakes are
simulated. A deep QA audit of this simulation surfaced a prioritized set of
bugs and UX failures that make the experience feel broken, unfair, or
misleading at the seams.

This "launch-hardening" effort fixes that prioritized set of defects so the
simulation is honest, recoverable, and stable. The work is scoped to
**application logic and Framer Motion presentation only** — no dependency
upgrades, no on-chain program work. The known-correct fee math (symmetric,
−7.5% expected value on both sides of a raid) and the tier boundary logic MUST
be preserved exactly.

Requirements are ordered by priority. P0 requirements (1–3) are launch
blockers; P1 requirements (4–7) are high-value follow-ups. Requirement 8
captures the regression-protection constraints that apply across all changes.

## Glossary

- **Wallet_Wars**: The PvP game mode implemented in `src/lib/walletWarsState.ts` and `src/components/walletwars/*`.
- **Raid_Engine**: The core game engine and its `raid()` operation in `src/lib/walletWarsState.ts` that resolves a raid attempt and returns a `RaidResult` or `null`.
- **Raid_Modal**: The `RaidModal` component (`src/components/walletwars/RaidModal.tsx`) that hosts the select → pick → result raid flow.
- **Wallet_Wars_Screen**: The `WalletWarsScreen` component (`src/components/walletwars/WalletWarsScreen.tsx`) that mounts the board, modal, and status bar.
- **Status_Bar**: The `StatusBar` component (`src/components/walletwars/WalletWarsExtras.tsx`) that shows the player's most recent action or state.
- **Stash_Card**: The `StashCard` component (`src/components/walletwars/StashCard.tsx`) that renders a single raidable target and its raid button.
- **Your_Stash_Panel**: The `YourStashPanel` component (`src/components/walletwars/YourStashPanel.tsx`) where the player opens, manages, and closes a stash.
- **Trust_Badge**: The `ProvablyFairBadge` component (`src/components/walletwars/WalletWarsExtras.tsx`) and any associated trust/fairness copy shown in Wallet Wars.
- **Wallet_Context**: The wallet provider in `src/lib/wallet.tsx`, including the `WalletState` interface and `useWallet()` hook.
- **Connect_Screen**: The `ConnectScreen` component (`src/components/ui/ConnectScreen.tsx`) shown before app access is granted.
- **App_Shell**: The top-level `App` component (`src/App.tsx`) that decides whether to render the Connect_Screen or the connected application.
- **Preview_Mode**: A guest state in which a user explores Wallet_Wars without a connected Solana wallet, with all gameplay simulated and no real-wallet actions available.
- **Bounty_System**: The bounty mechanic in the Raid_Engine (`placeBounty()`) and its supporting UI in the Raid_Modal and bounty board.
- **Stash_Sync**: The cross-tab coordination mechanism governing the persisted Wallet_Wars state under the `localStorage` key `yoink_walletwars_v3`.
- **Player_Stash**: The player's own stash (`state.you`), holding a simulated SOL `amount`.
- **Tier**: A weight class (`TIERS` in `walletWarsState.ts`) with a `min`, `max`, and `minBet`; raids are only allowed within a single tier.
- **Repeat_Tax**: The repeat-target surcharge (`repeatTaxMult`) added to a wager when the same target is raided multiple times within the repeat window.
- **Amount_Floor**: The minimum simulated stash value of `0.01` SOL that a cracked stash is clamped to.
- **Rejection_Reason**: A categorized cause for a raid being declined by the Raid_Engine (cooldown active, target shielded, tier mismatch, or insufficient funds for wager plus tax).

## Requirements

### Requirement 1 (P0-1): No Silent Raid Failures

**User Story:** As a player committing a raid, I want explicit feedback whenever my raid cannot proceed, so that I understand why nothing happened instead of watching the modal silently vanish.

#### Context

Today `RaidModal.commit()` calls `onClose()` whenever `onCommit()` returns
`null`, and `WalletWarsScreen.handleRaidCommit()` only updates the Status_Bar
when a `RaidResult` is returned. The Raid_Engine returns `null` when the raid
cooldown is active, the target became shielded after the modal opened, the
target and player are in different tiers, or the wager plus Repeat_Tax exceeds
the Player_Stash (including the all-in rounding case). In every one of these
cases the modal disappears with no message, no sound, and a stale Status_Bar.

#### Acceptance Criteria

1. WHEN the Raid_Engine declines a raid, THE Raid_Engine SHALL return a result that identifies the Rejection_Reason as one of cooldown active, target shielded, tier mismatch, or insufficient funds for wager plus tax.
2. WHEN a committed raid is declined by the Raid_Engine, THE Raid_Modal SHALL remain open and display a message that names the Rejection_Reason.
3. WHEN a committed raid is declined by the Raid_Engine, THE Raid_Modal SHALL play the cooldown-block sound (`playCooldownBlock`).
4. WHEN a committed raid is declined by the Raid_Engine, THE Wallet_Wars_Screen SHALL update the Status_Bar to describe the Rejection_Reason rather than a previous action.
5. WHEN a committed raid is declined because the cooldown is active, THE Raid_Modal SHALL display the remaining cooldown duration in seconds.
6. WHEN a committed raid is declined because the target became shielded, THE Raid_Modal SHALL transition to a state that lets the player close the modal or select a new target without losing the modal context.
7. IF a committed raid succeeds, THEN THE Raid_Modal SHALL proceed to the existing pick or result phase unchanged.

### Requirement 2 (P0-2): Connect Gate And Preview Mode

**User Story:** As a visitor without a Solana wallet, I want to enter and explore Wallet Wars in a guest mode, so that I can evaluate the game before deciding to connect a wallet.

#### Context

`App_Shell` renders only the Connect_Screen until `connected` is `true`, and
the Connect_Screen exposes only a "Connect Wallet" button. The Wallet_Context
docstring promises `previewMode` and `enterPreview`, but the `WalletState`
interface and provider omit them, so the promised guest path does not exist.

#### Acceptance Criteria

1. THE Wallet_Context SHALL expose a boolean `previewMode` and a function `enterPreview` on the `WalletState` interface and its provided value.
2. THE Connect_Screen SHALL present a control that invokes `enterPreview` to enter Preview_Mode without connecting a wallet.
3. WHEN a user invokes `enterPreview`, THE App_Shell SHALL grant access to the connected application surface with Preview_Mode active.
4. WHILE Preview_Mode is active, THE Wallet_Wars SHALL allow the user to open a Player_Stash, raid targets, and place bounties using simulated SOL.
5. WHILE Preview_Mode is active, THE Wallet_Context SHALL report a `walletBalance` of 0 and a `publicKey` of null.
6. WHILE Preview_Mode is active, THE Wallet_Wars_Screen SHALL display a label indicating the user is in Preview_Mode.
7. WHEN a user connects a real wallet while Preview_Mode is active, THE Wallet_Context SHALL exit Preview_Mode and report the connected wallet state.
8. WHILE Preview_Mode is active, THE App_Shell SHALL provide a control to connect a wallet.

### Requirement 3 (P0-3): Honest Trust And Fairness Copy

**User Story:** As a player evaluating whether the game is trustworthy, I want the fairness messaging to accurately describe the current build, so that I am not misled into believing raids settle on-chain when they are simulated.

#### Context

The Trust_Badge expands to claim outcomes are "verifiable on-chain" and that
"No house manipulation possible," while `ESCROW_ENABLED` is `false` and the
raid seed is generated client-side. This overstates the trust guarantees of a
client-side simulation.

#### Acceptance Criteria

1. THE Trust_Badge SHALL describe the current build as a client-side simulation in which raid outcomes are computed locally, not settled on-chain.
2. THE Trust_Badge SHALL NOT state that outcomes are verifiable on-chain WHILE `ESCROW_ENABLED` is false.
3. THE Trust_Badge SHALL NOT claim that house manipulation is impossible WHILE the raid seed is generated client-side.
4. THE Trust_Badge SHALL describe the revealed seed accurately as a locally generated, client-side provably-fair roll.
5. WHERE `isEscrowLive()` returns true, THE Trust_Badge SHALL be permitted to present on-chain settlement language.
6. THE Trust_Badge SHALL retain its existing "Devnet · Sim Stakes" labeling so the simulated nature is visible without expanding the badge.

### Requirement 4 (P1-1): Wiped-Stash Recovery

**User Story:** As a player whose stash has been ground down to the floor, I want a clear path to re-up or open a new stash, so that I am not stuck on the board unable to raid.

#### Context

A cracked stash is clamped to the Amount_Floor of `0.01` SOL. The lowest Tier
("The Pit") has a `minBet` of `0.02`. When the Player_Stash reaches the floor,
the Raid_Modal computes `maxBid = Math.max(minBid, maxWagerFor(...))`, then the
Raid_Engine evaluates `clamp(wager, tier.minBet, maxW)` where `lo` (0.02)
exceeds `hi` (~0.01). This degenerate clamp produces a wager that always fails
the funds check, leaving the player in a dead end with no recovery prompt.

#### Acceptance Criteria

1. IF the Player_Stash amount is below the minimum wager (`minBet`) of its Tier, THEN THE Wallet_Wars_Screen SHALL display a recovery prompt offering the player to re-up or open a new stash.
2. WHEN the player chooses to re-up from the recovery prompt, THE Your_Stash_Panel SHALL allow the player to add simulated SOL to the Player_Stash so the stash meets or exceeds its Tier minimum wager.
3. IF the Player_Stash amount is below its Tier minimum wager, THEN THE Stash_Card raid controls and THE Raid_Modal SHALL each independently prevent the player from committing a raid the Player_Stash cannot fund, evaluated against their own enabling conditions.
4. WHEN a wager range is computed where the low bound exceeds the high bound, THE Raid_Engine SHALL treat the wager as unfundable and decline the raid with the insufficient-funds Rejection_Reason rather than producing a degenerate clamped value.
5. THE Raid_Engine SHALL NOT return a wager that is less than the Tier minimum wager.

### Requirement 5 (P1-2): Bounty Mechanic Rework

**User Story:** As a player placing a bounty, I want the bounty mechanic to be recoverable and to not silently demote me out of my tier, so that placing a bounty is a meaningful choice rather than a guaranteed loss with hidden side effects.

#### Context

`placeBounty()` immediately deducts the bounty amount from the Player_Stash and
adds it to the target, with no refund or expiry, making it always negative
expected value. Because the deduction can drop the Player_Stash below the
current Tier minimum, placing a bounty can strand the player in a different
tier than the target they intended to attack.

#### Acceptance Criteria

1. IF placing a bounty would reduce the Player_Stash below the minimum of the Player_Stash's current Tier, THEN THE Bounty_System SHALL decline the placement and inform the player.
2. WHEN a bounty placed by the player is not claimed within a defined expiry window, THE Bounty_System SHALL refund the unclaimed bounty amount to the player who placed it.
3. WHEN the player places a bounty, THE Bounty_System SHALL record the placing player so that an expiry refund returns to the correct player.
4. THE Bounty_System SHALL define and apply a single expiry window value for placed bounties.
5. WHERE the team elects to gate rather than rework the Bounty_System, THE Bounty_System SHALL hide the bounty-placement controls so that no negative-expected-value placement is offered to the player.
6. WHEN a bounty is refunded on expiry, THE Wallet_Wars_Screen SHALL surface a feed entry or status message describing the refund.

### Requirement 6 (P1-3): Multi-Tab Safety

**User Story:** As a player with Wallet Wars open in more than one browser tab, I want my open stash to be preserved, so that a second tab does not overwrite and corrupt my progress.

#### Context

Each open tab runs its own bot simulation and persists Wallet_Wars state to the
shared `localStorage` key `yoink_walletwars_v3`. With independent writers, the
last tab to write wins, which can erase or corrupt the player's open
Player_Stash.

#### Acceptance Criteria

1. THE Stash_Sync SHALL maintain a single source of truth for the persisted Player_Stash across all open tabs of the same browser profile.
2. WHEN the Player_Stash changes in one tab, THE Stash_Sync SHALL propagate the change to other open tabs so that they reflect the same Player_Stash.
3. IF more than one tab is open, THEN THE Stash_Sync SHALL prevent a tab's bot simulation from overwriting another tab's Player_Stash in a way that loses the open stash.
4. WHEN a tab becomes the active writer for Wallet_Wars state, THE Stash_Sync SHALL ensure only one tab persists authoritative state at a time.
5. WHEN a new tab opens while another tab already holds Wallet_Wars state, THE new tab SHALL load the existing persisted Player_Stash rather than reinitializing it.

### Requirement 7 (P1-4): Raid Modal Stability

**User Story:** As a player interacting with the raid modal, I want the modal to stay open while I am acting on it, so that a background bot shielding or changing the target does not abruptly close my raid flow.

#### Context

The Raid_Modal is mounted in `WalletWarsScreen` only while
`target && state.you && targetRaidable` holds. Because `targetRaidable` is
recomputed from live state, a bot shielding the target (or the target changing
tiers) flips it to `false` and unmounts the modal mid-interaction.

#### Acceptance Criteria

1. WHILE the Raid_Modal is open and the player has not completed the raid flow, THE Wallet_Wars_Screen SHALL keep the Raid_Modal mounted even if the target becomes unraidable.
2. WHEN the target becomes shielded while the Raid_Modal is open in the select phase, THE Raid_Modal SHALL display that the target is no longer raidable and prevent committing a raid against that target.
3. WHILE the Raid_Modal is showing the pick or result phase, THE Wallet_Wars_Screen SHALL keep the Raid_Modal mounted until the player closes it, regardless of changes to the target's raidable status.
4. WHEN the player closes the Raid_Modal, THE Wallet_Wars_Screen SHALL clear the selected target.
5. IF the target is removed from the board WHILE the Raid_Modal is in the pick or result phase, THEN THE Raid_Modal SHALL inform the player and offer to close rather than unmounting silently.
6. IF the target is removed from the board WHILE the Raid_Modal is in the select phase, THEN THE Wallet_Wars_Screen SHALL close the Raid_Modal automatically and clear the selected target.

### Requirement 8: Preserve Correct Behavior (Regression Guard)

**User Story:** As a maintainer, I want the known-correct mechanics and dependency baseline to remain unchanged, so that launch-hardening fixes do not introduce regressions in fairness or the build.

#### Context

The audit confirmed the fee math is correct and symmetric (a flat 50/50 with a
15% rake on the transferred amount yields −7.5% expected value on both sides)
and that the tier boundary logic is correct. These, and the dependency
baseline, must not regress while the above fixes are applied.

#### Acceptance Criteria

1. THE Raid_Engine SHALL preserve the fixed 50/50 win chance for every raid regardless of player balance or wager.
2. THE Raid_Engine SHALL preserve the 15% house rake on transferred amounts, keeping the expected value at −7.5% for both the raider and the target.
3. THE Raid_Engine SHALL preserve the existing Tier boundaries, Tier minimum wagers, and the rule that raids occur only within a single Tier.
4. THE Wallet_Wars SHALL implement all fixes using application logic and Framer Motion only, without upgrading project dependencies.
5. THE Wallet_Wars SHALL keep `ESCROW_ENABLED` false and SHALL NOT introduce on-chain settlement, the Solana escrow program, or Switchboard VRF as part of this effort.

## Out of Scope

- Deploying or wiring the real Solana escrow program (`solana/programs/wallet-wars`) or Switchboard VRF; `ESCROW_ENABLED` remains false.
- The Bag game (`src/components/game/*` and related King-of-the-hill logic).
- Any dependency or framework version upgrades.
- Changes to the fee math or tier boundary values (these are correct and only protected against regression here).
