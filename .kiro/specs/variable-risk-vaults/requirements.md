# Requirements Document

## Introduction

Variable-Risk Vaults extends the existing Wallet Wars "Siege the Vault" economy by letting a player
choose a **risk profile** — **Fortified**, **Standard**, or **Exposed** — at the moment they open a
vault. The chosen profile is published on the vault and locked for its entire lifetime. Each profile
shifts the vault's crack odds `p` and attempt fee `f` (the slice rate `s` and both house rakes stay
fixed) so that the **defender's expected value is held constant across all three profiles within a
tier**, while the **variance differs sharply** (Fortified = long life / small steady tolls; Exposed =
cracked fast / big toll per survived siege).

The feature must not weaken provable fairness: the win check stays exactly
`win ⇔ rollFromSeed(seed) < p_vault`, where `p_vault` is the vault's published, immutable crack
chance. Odds are never auto-varied by streak, heat, age, or balance — the profile only chooses a
*published, fixed* `p` (and a defender-EV-preserving `f` derived from it) at open time.

This document derives EARS-compliant requirements directly from the approved design
(`design.md`). Every requirement is traceable to a design section, and the design's ten Correctness
Properties are mapped to specific requirement clauses in the traceability map at the end.

This feature **extends** the Wallet Wars "Siege the Vault" economy and **must not modify The Bag /
bag-reign-toll economy** in any way.

## Glossary

- **Vault**: A staked corpus belonging to a player or bot that can be sieged. Carries economic fields plus the new immutable `riskProfile`.
- **Risk_Profile**: One of `"fortified"`, `"standard"`, or `"exposed"` — chosen at vault open time and immutable thereafter.
- **Fortified**: Risk profile with odds factor `κ = 0.6` (lower crack odds, lower fee, longer life, smaller variance).
- **Standard**: Risk profile with odds factor `κ = 1.0`; the algebraic identity of the base tier params (migration target).
- **Exposed**: Risk profile with odds factor `κ = 1.5` (higher crack odds, higher fee, shorter life, larger variance).
- **Odds_Factor (κ)**: The per-profile multiplier applied to a tier's base crack odds `p`.
- **TierParams**: The economic parameter set for a tier: `winChance (p)`, `feeRate (f)`, `sliceRate (s)`, `houseFeeCut (ρ_fee)`, `housePrizeRake (ρ_prize)`, and `id`.
- **base / base params**: The unmodified `TierParams` for a vault's amount, as produced by `tierParamsFor(amount)`.
- **Effective_Params**: The `TierParams` returned by `resolveVaultParams(base, profile)` — the params actually used for a profiled vault.
- **p_vault / p'**: The vault's published, immutable effective crack chance `= vaultParamsFor(amount, profile).winChance`.
- **f'**: The vault's effective, defender-EV-preserving fee rate.
- **Defender_EV (D)**: The defender's expected value for a tier, `(1 − ρ_fee)·f − p·s`, held constant across profiles within a tier.
- **Raider_EV / House_EV**: The raider's and house's expected values, per the existing pure EV formulas.
- **Siege_Math**: The pure, total module `siegeMath.ts` housing `RISK_PROFILES`, `resolveVaultParams`, `vaultParamsFor`, and the EV functions.
- **Engine**: The pure transition module `walletWarsState.ts` (`openVaultState`, `resolveSiege`, `settleSiege`, `normalizeVault`, `migrateV3ToV4`, `makeBotVault`).
- **verifySiege**: The existing pure verifier that recomputes a siege outcome from a revealed seed and published `pWin`.
- **rollFromSeed**: The existing deterministic function mapping a revealed seed to a roll in `[0,1)`.
- **Risk_Profile_Selector**: The 3-way UI control on the open flow (`YourVaultPanel`).
- **VaultCard**: The UI card displaying a single vault's primary fields and profile badge.
- **SiegeModal**: The UI modal for executing a siege against a target vault.
- **Reduced_Motion**: The user's `prefers-reduced-motion` preference, surfaced via the shared `usePrefersReducedMotion` hook.
- **ESCROW_ENABLED**: The existing feature flag governing real Solana escrow; remains `false` (simulation only).

## Requirements

### Requirement 1: Choose a risk profile when opening a vault

**User Story:** As a player opening a vault, I want to choose a risk profile (Fortified, Standard, or
Exposed), so that I can tune the variance of my vault's outcomes to my taste.

#### Acceptance Criteria

1. WHEN a player opens a vault, THE Risk_Profile_Selector SHALL present exactly three choices ordered Fortified, then Standard, then Exposed.
2. WHILE no profile has been explicitly selected on the open flow, THE Risk_Profile_Selector SHALL default the selection to Standard.
3. WHEN a player confirms opening a vault with a chosen profile, THE Engine SHALL set the new vault's `riskProfile` to that chosen profile.
4. THE Siege_Math SHALL define the odds factor κ as 0.6 for Fortified, 1.0 for Standard, and 1.5 for Exposed.

### Requirement 2: Risk profile is published and immutable for the vault's lifetime

**User Story:** As a raider verifying fairness, I want a vault's risk profile to be fixed at open
time and never change, so that its published odds cannot be shifted retroactively.

#### Acceptance Criteria

1. THE Engine SHALL set a vault's `riskProfile` exactly once, at creation time.
2. WHILE a vault exists, THE Engine SHALL preserve the vault's `riskProfile` unchanged across all sieges, settlements, and compounding operations.
3. WHEN `settleSiege` returns a defender vault, THE Engine SHALL preserve that defender's `riskProfile` value unchanged.
4. THE Engine SHALL NOT provide any operation that reassigns an existing vault's `riskProfile`.

### Requirement 3: Pure parameter resolution that preserves defender EV

**User Story:** As an engine developer, I want a pure function that maps a base tier and a profile to
effective params, so that profile economics are derived consistently and verifiably.

#### Acceptance Criteria

1. THE Siege_Math SHALL provide a pure, total function `resolveVaultParams(base, profile)` that returns Effective_Params.
2. WHEN `resolveVaultParams(base, profile)` is called, THE Siege_Math SHALL set the effective crack odds to `base.winChance · κ`, where κ is the odds factor of the given profile.
3. WHEN `resolveVaultParams(base, profile)` is called, THE Siege_Math SHALL derive the effective fee rate as `f' = (D + p'·s) / (1 − ρ_fee)`, where `D = (1 − ρ_fee)·base.feeRate − base.winChance·base.sliceRate`.
4. WHEN `resolveVaultParams(base, profile)` is called, THE Siege_Math SHALL leave `sliceRate`, `houseFeeCut`, `housePrizeRake`, and `id` equal to their `base` values.
5. THE Siege_Math SHALL provide a function `vaultParamsFor(amount, profile)` that returns `resolveVaultParams(tierParamsFor(amount), profile)`.
6. THE Siege_Math SHALL keep `resolveVaultParams` and `vaultParamsFor` pure and free of side effects.

### Requirement 4: Standard profile is the exact identity of the base

**User Story:** As a maintainer, I want the Standard profile to be the algebraic identity of the base
tier params, so that migrated and existing vaults behave bit-for-bit as they do today.

#### Acceptance Criteria

1. WHEN `resolveVaultParams(base, "standard")` is called, THE Siege_Math SHALL return a result that deep-equals `base`.
2. THE Siege_Math SHALL keep the Standard odds factor κ equal to 1.0.

### Requirement 5: Defender EV is held constant across profiles within a tier

**User Story:** As a player, I want every profile to keep the same defender expected value within a
tier, so that no profile is a trap or a free lunch — only the variance changes.

#### Acceptance Criteria

1. WHERE no odds clamp is applied, THE Siege_Math SHALL produce Effective_Params whose `evDefender` equals `evDefender(base)` within a tolerance of `1e-9`, for every profile and every tier.

### Requirement 6: Raider EV is negative and House EV is positive for every profile and tier

**User Story:** As the house operator, I want raider EV to stay negative and house EV positive across
all profiles and tiers, so that the economy's edge is preserved and collusion remains unprofitable.

#### Acceptance Criteria

1. THE Siege_Math SHALL produce, for every profile and every tier, Effective_Params whose `evRaider` is strictly less than zero.
2. THE Siege_Math SHALL produce, for every profile and every tier, Effective_Params whose `evHouse` is strictly greater than zero.

### Requirement 7: Effective odds and fee remain well-formed (defensive clamp)

**User Story:** As an engine developer, I want effective odds and fee to always be valid, so that the
resolver is total and never yields an out-of-range probability.

#### Acceptance Criteria

1. THE Siege_Math SHALL produce Effective_Params whose `winChance` is strictly greater than 0 and strictly less than 1, for every well-formed base and every profile.
2. THE Siege_Math SHALL produce Effective_Params whose `feeRate` is strictly greater than 0, for every well-formed base and every profile.
3. IF `base.winChance · κ` is greater than or equal to 1 or less than or equal to 0, THEN THE Siege_Math SHALL clamp the effective `winChance` into the open interval `(ε, 1 − ε)`.

### Requirement 8: Variance is strictly ordered Fortified < Standard < Exposed

**User Story:** As a player, I want the three profiles to deliver a sharply different ride, so that
choosing a profile meaningfully changes how often my vault is cracked.

#### Acceptance Criteria

1. THE Siege_Math SHALL produce, for every tier, single-attempt defender variances `s²·p'·(1 − p')` that are strictly ordered Fortified less than Standard less than Exposed.

### Requirement 9: Zero-sum conservation holds for every settled siege

**User Story:** As an auditor, I want every settled siege to conserve value, so that the economy
remains exactly zero-sum regardless of profile.

#### Acceptance Criteria

1. WHEN a siege is settled, THE Engine SHALL produce per-actor deltas such that `raider + defender + house + corpus` equals 0 within floating-point tolerance, for every profile, tier, corpus, streak multiplier, and roll.

### Requirement 10: Provable fairness with published per-vault odds

**User Story:** As a raider, I want the win outcome to depend only on the revealed seed and the
vault's published odds, so that I can independently verify any siege.

#### Acceptance Criteria

1. WHEN a siege is settled, THE Engine SHALL determine the win outcome as `win ⇔ rollFromSeed(seed) < p_vault`, where `p_vault = vaultParamsFor(vault.amount, vault.riskProfile).winChance`.
2. WHEN `settleSiege` resolves economic parameters, THE Engine SHALL obtain them from `vaultParamsFor(defender.amount, defender.riskProfile)` as the only changed settlement call-site.
3. WHEN `verifySiege(seed, p_vault, outcome)` is called for a settled siege, THE verifySiege function SHALL return true.
4. THE Engine SHALL NOT auto-vary a vault's crack odds based on streak, heat, age, or balance.
5. THE Engine SHALL keep the `verifySiege` signature unchanged and pass the vault's published `p'` as `pWin`.

### Requirement 11: Open-vault state transition carries the profile

**User Story:** As an engine developer, I want `openVaultState` to record the chosen profile, so that
downstream settlement and UI read a single immutable source of truth.

#### Acceptance Criteria

1. WHEN `openVaultState(state, amount, profile, at)` is called and `state.you` does not exist, THE Engine SHALL return a new state whose `you` vault has `riskProfile` equal to `profile` and all existing fields set as today.
2. IF `openVaultState` is called WHILE `state.you` already exists, THEN THE Engine SHALL return the input state unchanged.
3. WHEN `openVaultState` is called, THE Engine SHALL NOT mutate the input state.

### Requirement 12: Bot vaults receive a weighted spread of profiles

**User Story:** As a player browsing the board, I want bot vaults to show a variety of profiles, so
that the board demonstrates the full range of risk choices.

#### Acceptance Criteria

1. WHEN `makeBotVault` creates a bot vault, THE Engine SHALL assign a `riskProfile` drawn from a weighted spread spanning Fortified, Standard, and Exposed.

### Requirement 13: Migration and normalisation default to Standard

**User Story:** As an existing player, I want my saved vaults to keep working unchanged, so that the
new field never breaks or alters my existing economics.

#### Acceptance Criteria

1. IF a persisted vault record lacks a valid `riskProfile`, THEN THE Engine SHALL set its `riskProfile` to Standard during `normalizeVault`, `migrateV3ToV4`, and v4 loading.
2. WHEN a vault is migrated or normalised to Standard, THE Engine SHALL keep that vault's economics identical to today's behaviour.
3. THE Siege_Math SHALL provide a predicate `isRiskProfile(x)` that returns true if and only if `x` is one of `"fortified"`, `"standard"`, or `"exposed"`.

### Requirement 14: Risk-profile selector previews each profile's effect

**User Story:** As a player choosing a profile, I want to preview each profile's odds, fee, and
framing for my stake, so that I can make an informed choice before committing.

#### Acceptance Criteria

1. WHEN a stake amount is entered on the open flow, THE Risk_Profile_Selector SHALL preview each profile's crack odds `p'` and fee `f'` using `vaultParamsFor(amount, profile)`.
2. THE Risk_Profile_Selector SHALL render the three profiles left-to-right as an explicit low-risk/low-reward to high-risk/high-reward gradient.
3. WHEN a player selects a profile segment, THE Risk_Profile_Selector SHALL animate the change using Framer Motion transform/opacity only.
4. WHILE Reduced_Motion is enabled, THE Risk_Profile_Selector SHALL suppress its selection animation.

### Requirement 15: VaultCard shows primary fields plus a profile badge

**User Story:** As a player scanning the board, I want each vault card trimmed to its essentials plus
a profile badge, so that I can quickly compare vaults without clutter.

#### Acceptance Criteria

1. THE VaultCard SHALL display as primary fields: vault size, the vault's own crack odds `p'`, the fee the raider risks `f'`, the slice the raider wins, and a siege button.
2. THE VaultCard SHALL derive its displayed odds, fee, and slice from `vaultParamsFor(vault.amount, vault.riskProfile)`.
3. THE VaultCard SHALL display a profile badge reading FORTIFIED, STANDARD, or EXPOSED according to the vault's `riskProfile`.
4. THE VaultCard SHALL relocate the streak and banked fields to a secondary tap or expand row.

### Requirement 16: Banked display reads as live

**User Story:** As a player, I want banked figures to look alive instead of showing "0.00"
everywhere, so that the fee mechanic feels active.

#### Acceptance Criteria

1. THE Engine SHALL seed bot vaults with realistic accumulated banked values so the board does not read as all-zero.
2. THE VaultCard SHALL render a subtle accumulation shimmer on the banked figure using Framer Motion opacity/transform.
3. WHILE Reduced_Motion is enabled, THE VaultCard SHALL disable the banked accumulation shimmer.

### Requirement 17: Bounty prominence in the SiegeModal

**User Story:** As a player viewing a target, I want the bounty block displayed prominently near the
headline, so that the shareable bounty mechanic is easy to discover.

#### Acceptance Criteria

1. THE SiegeModal SHALL display the bounty block in a prominent position near the headline rather than at the bottom of the modal.
2. THE SiegeModal SHALL display the target vault's odds, fee, and slice from `vaultParamsFor(vault.amount, vault.riskProfile)`.
3. THE SiegeModal SHALL continue to use the existing typed `onPlaceBounty` flow without introducing any economic change.

### Requirement 18: Siege rejection precedence is unchanged

**User Story:** As a raider, I want siege rejections to behave exactly as before, so that adding
profiles introduces no new control paths or surprises.

#### Acceptance Criteria

1. WHEN a siege is declined, THE Engine SHALL evaluate rejection reasons in the existing precedence order: cooldown, then shielded, then self, then tier, then funds.
2. WHEN a siege is declined, THE Engine SHALL return the existing typed `SiegeRejection` value unchanged.

## Out of Scope

The following are explicitly excluded from this feature:

1. **The Bag / bag-reign-toll economy** — must not be modified in any way.
2. **Real Solana escrow and VRF** — `ESCROW_ENABLED` stays `false`; the feature is simulation-only.
3. **Hidden or auto-varying odds** — crack odds must never vary by streak, heat, age, or balance.
4. **Dependency upgrades** — no dependency version changes; `fast-check` remains a dev-only dependency.
5. **New animation libraries** — animations use Framer Motion only.
6. **Changes to the existing slice rate or house rakes** — only `winChance (p)` and `feeRate (f)` are adjusted by a profile.
7. **New economic control paths** — the profile is data on the vault, not a new runtime mechanic.

## Correctness Properties → Requirements Traceability Map

The design defines ten Correctness Properties. Each is mapped below to the requirement clause(s) it
validates.

| Design Property | Description | Validates Requirement(s) |
|---|---|---|
| Property 1 | Standard profile is the identity (migration safety) | 4.1, 4.2, 13.2 |
| Property 2 | Defender EV is preserved across profiles | 3.3, 5.1 |
| Property 3 | Raider EV strictly negative for every profile×tier | 6.1 |
| Property 4 | House EV strictly positive for every profile×tier | 6.2 |
| Property 5 | Zero-sum conservation holds for every profile×tier | 9.1 |
| Property 6 | Provable fairness with published per-vault odds | 10.1, 10.2, 10.3, 10.5 |
| Property 7 | Risk profile is immutable across the vault lifetime | 2.1, 2.2, 2.3, 2.4 |
| Property 8 | Variance ordering matches the profiles | 8.1 |
| Property 9 | Effective odds are a valid probability | 7.1, 7.2, 7.3 |
| Property 10 | Migration & normalisation default to Standard | 13.1, 13.2, 13.3 |

### Supporting requirements (not direct property targets)

These requirements ground the feature in the design but are validated by example/UI/integration
tests rather than the universal correctness properties: Requirement 1 (profile selection), 3.1/3.2/
3.4/3.5/3.6 (resolver shape and `vaultParamsFor`), 10.4 (no auto-varying odds — an absence
guarantee), 11 (`openVaultState`), 12 (bot spread), 14–17 (UI), and 18 (rejection precedence).
