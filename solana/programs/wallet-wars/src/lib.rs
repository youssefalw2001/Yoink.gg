/*!
 * YOINK.GG — WALLET WARS  (Solana / Anchor program)
 *
 * ⚠️  STATUS: DEVNET ONLY — NOT DEPLOYED, NOT AUDITED, NOT COMPILED IN CI.
 *     This program moves REAL lamports. Do NOT deploy to mainnet or point real
 *     funds at it until it has been built with the Solana/Anchor toolchain,
 *     integration-tested on devnet, AND professionally audited. The client stays
 *     on the simulation until then (`ESCROW_ENABLED` in walletWarsChain.ts).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS WAS REWRITTEN
 *
 * The previous version implemented a DIFFERENT GAME from the one the app
 * advertises:
 *
 *   old on-chain            | live client
 *   ------------------------|---------------------------------------------
 *   fixed 50/50 odds        | tiered 12% / 10% / 8% / 7%, x risk profile
 *   MATCHED STAKES          | raider risks only a small FEE (0.8-2% of V)
 *   flat 15% house rake     | ~6.5% blended
 *   no defender toll        | defender banks a toll on EVERY attempt
 *   no streak multiplier    | up to 2.00x
 *   no risk profiles        | Fortified / Standard / Exposed
 *
 * Deploying that would have meant a player reading "12% crack chance, you only
 * risk the fee" on screen while the chain took a matched stake at 50/50 and
 * skimmed 15%. For a licensed operator that is not a bug report, it is the thing
 * that costs the licence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MODEL THIS IMPLEMENTS (mirrors src/lib/siegeMath.ts v2 exactly)
 *
 *   • OPEN A VAULT — escrow SOL in a per-player PDA. It is your war chest AND
 *     the prize others besiege. You pick a RISK PROFILE at open time, and it is
 *     immutable for the vault's life.
 *   • ASYMMETRIC SIEGE — a raider pays a small FEE derived from the TARGET's
 *     corpus. That fee is the only thing they can lose. There is no matched
 *     stake, so a minnow can punch up at a whale.
 *   • THE DEFENDER ALWAYS BANKS THE TOLL — win or lose, the defender keeps
 *     `(1 - rho_fee)` of the base fee. That is what makes defending +EV.
 *   • CRACK — with published probability p, the raider takes a slice of the
 *     corpus, net of the house prize rake.
 *   • SURVIVAL STREAK — each survived siege raises the fee AND the slice by 4%
 *     (capped at 2.00x), so a long-lived vault is more lucrative to attack and
 *     more lucrative to hold. Ratio-invariant: it does not change the odds.
 *   • RAID UP ONLY — you may siege your own weight class or higher, never lower.
 *   • PROVABLY FAIR — the roll comes from Switchboard On-Demand VRF, committed
 *     at request time and revealed at settle. The house cannot pick the outcome.
 *   • SHIELDS + REPEAT COOLDOWN — grief resistance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ALL MONEY MATH LIVES IN `economy.rs`
 *
 * That module is dependency-free integer arithmetic with 22 of its own unit
 * tests (`rustc --test economy.rs`) covering exact conservation, the slice
 * clamp, overflow saturation, tier boundaries and crack frequency. It is
 * additionally guarded by `src/lib/onchainEconomyParity.test.ts`, which parses
 * it and fails CI if any constant drifts from `siegeMath.ts`.
 *
 * Nothing in THIS file re-derives a rate. It is a transport layer.
 */

use anchor_lang::prelude::*;
use switchboard_on_demand::accounts::RandomnessAccountData;

pub mod economy;
use economy::{
    compute_fee, compute_prize, eff_params, is_crack, roll_from_vrf, streak_mult_bps, tier_index,
    tier_rates, RiskProfile, TIER_FLOORS,
};

declare_id!("71dQZy3UiFyTj84Z9cYUxndzsRutE1isWS47eyNs1Mfh");

// ─── Non-economy constants ──────────────────────────────────────────────────

/// Post-settlement shield, matching WAR_CONFIG.SHIELD_MS (6s) in the client.
const SHIELD_SECS: i64 = 6;
/// Per-raider cooldown, matching WAR_CONFIG.RAID_COOLDOWN_MS (3s).
const RAID_COOLDOWN_SECS: i64 = 3;
/// A ticket must be settled promptly; past this it can be cancelled so a raider's
/// fee is never held hostage by a randomness account that never reveals.
const TICKET_EXPIRY_SECS: i64 = 300;
/// Corpus floor, matching WAR_CONFIG.CORPUS_FLOOR (0.01 SOL). A vault is never
/// sliced to zero, both to keep the PDA rent-exempt and to mirror the client.
const CORPUS_FLOOR: u64 = economy::LAMPORTS_PER_SOL / 100;

/// Move lamports between two program-owned accounts via direct balance edits.
/// (A system-program transfer cannot debit a data-bearing PDA.)
fn move_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    **from.try_borrow_mut_lamports()? = from
        .lamports()
        .checked_sub(amount)
        .ok_or(WalletWarsError::InsufficientStash)?;
    **to.try_borrow_mut_lamports()? = to
        .lamports()
        .checked_add(amount)
        .ok_or(WalletWarsError::MathOverflow)?;
    Ok(())
}

#[program]
pub mod wallet_wars {
    use super::*;

    /// One-time: set authority + treasury (rake destination).
    pub fn initialize_config(ctx: Context<InitializeConfig>, treasury: Pubkey) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.authority = ctx.accounts.authority.key();
        c.treasury = treasury;
        c.total_raked = 0;
        c.paused = false;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    /// Emergency stop. A licensed operator needs a way to halt settlement without
    /// redeploying; withdrawals stay open so funds are never trapped by a pause.
    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    /// Open a vault: escrow `amount` and lock in a risk profile for its lifetime.
    pub fn open_vault(ctx: Context<OpenVault>, amount: u64, risk_profile: u8) -> Result<()> {
        require!(amount >= TIER_FLOORS[0], WalletWarsError::BelowMinStake);
        // Reject an unknown profile rather than defaulting it — silently coercing
        // to Standard would settle at odds the owner never chose.
        let profile = RiskProfile::from_u8(risk_profile).ok_or(WalletWarsError::BadRiskProfile)?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        let v = &mut ctx.accounts.vault;
        v.owner = ctx.accounts.owner.key();
        v.amount = amount;
        v.banked = 0;
        v.fees_earned = 0;
        v.streak = 0;
        v.survived = 0;
        v.cracked = 0;
        v.shield_until = 0;
        v.last_raid_ts = 0;
        v.risk_profile = profile as u8;
        v.bump = ctx.bumps.vault;

        emit!(VaultOpened { owner: v.owner, amount, risk_profile: v.risk_profile });
        Ok(())
    }

    /// Withdraw banked tolls without closing the vault.
    pub fn withdraw_banked(ctx: Context<VaultOwnerOnly>) -> Result<()> {
        let amount = ctx.accounts.vault.banked;
        require!(amount > 0, WalletWarsError::ZeroAmount);
        move_lamports(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.owner.to_account_info(),
            amount,
        )?;
        ctx.accounts.vault.banked = 0;
        emit!(BankedWithdrawn { owner: ctx.accounts.owner.key(), amount });
        Ok(())
    }

    /// Cash out: corpus + banked return to the owner and the PDA closes.
    ///
    /// Deliberately NOT gated on `paused` — a pause must never trap player funds.
    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
        emit!(VaultClosed {
            owner: ctx.accounts.owner.key(),
            returned: ctx.accounts.vault.amount + ctx.accounts.vault.banked,
        });
        Ok(())
    }

    /// STEP 1 — Request a siege.
    ///
    /// The fee and the published odds are computed from the TARGET's corpus,
    /// profile and streak, then SEALED into the ticket. Sealing matters: between
    /// commit and reveal the target's corpus can change (another raider settles),
    /// and a raider must be charged the price they were quoted.
    pub fn request_siege(ctx: Context<RequestSiege>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(!ctx.accounts.config.paused, WalletWarsError::Paused);

        let raider = &ctx.accounts.raider_vault;
        let target = &ctx.accounts.target_vault;

        require!(raider.owner == ctx.accounts.owner.key(), WalletWarsError::NotOwner);
        require!(raider.key() != target.key(), WalletWarsError::SelfSiege);
        // RAID UP ONLY — same weight class or higher, never punch down.
        require!(
            tier_index(target.amount) >= tier_index(raider.amount),
            WalletWarsError::CannotPunchDown,
        );
        require!(now >= target.shield_until, WalletWarsError::TargetShielded);
        require!(now >= raider.last_raid_ts + RAID_COOLDOWN_SECS, WalletWarsError::SiegeCooldown);
        require!(target.amount > CORPUS_FLOOR, WalletWarsError::TargetDepleted);

        let profile =
            RiskProfile::from_u8(target.risk_profile).ok_or(WalletWarsError::BadRiskProfile)?;
        let eff = eff_params(target.amount, profile);
        let rates = tier_rates(target.amount);
        let mult = streak_mult_bps(target.streak);
        let fee = compute_fee(target.amount, eff.f_ppb, mult, rates.house_fee_cut_bps);

        require!(fee.fee > 0, WalletWarsError::ZeroAmount);
        // The fee is the ONLY thing the raider risks, and it must be covered by
        // their own escrowed corpus.
        require!(fee.fee <= raider.amount, WalletWarsError::InsufficientStash);

        // Validate the randomness account is freshly committed (not yet revealed).
        let rd = RandomnessAccountData::parse(ctx.accounts.randomness.data.borrow())
            .map_err(|_| WalletWarsError::BadRandomness)?;
        require!(rd.seed_slot == Clock::get()?.slot - 1, WalletWarsError::StaleRandomness);

        let t = &mut ctx.accounts.ticket;
        t.raider = ctx.accounts.raider_vault.key();
        t.target = ctx.accounts.target_vault.key();
        t.randomness = ctx.accounts.randomness.key();
        t.fee = fee.fee;
        t.to_defender = fee.to_defender;
        t.to_house = fee.to_house;
        t.p_ppm = eff.p_ppm as u64;
        t.target_amount = target.amount;
        t.mult_bps = mult as u64;
        t.created_ts = now;
        t.bump = ctx.bumps.ticket;

        emit!(SiegeRequested {
            raider: t.raider,
            target: t.target,
            fee: t.fee,
            p_ppm: t.p_ppm,
            ts: now,
        });
        Ok(())
    }

    /// STEP 2 — Settle. Reveal the VRF, derive the roll, move lamports.
    ///
    /// Ordering is deliberate: the fee is charged FIRST (defender banks the toll
    /// unconditionally), then the prize is paid only on a crack. That mirrors the
    /// client's `settleSiege` and is what makes the defender +EV.
    pub fn settle_siege(ctx: Context<SettleSiege>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(!ctx.accounts.config.paused, WalletWarsError::Paused);

        let ticket = &ctx.accounts.ticket;
        require!(
            ticket.randomness == ctx.accounts.randomness.key(),
            WalletWarsError::RandomnessMismatch,
        );
        require!(ticket.raider == ctx.accounts.raider_vault.key(), WalletWarsError::TicketMismatch);
        require!(ticket.target == ctx.accounts.target_vault.key(), WalletWarsError::TicketMismatch);

        let rd = RandomnessAccountData::parse(ctx.accounts.randomness.data.borrow())
            .map_err(|_| WalletWarsError::BadRandomness)?;
        // switchboard-on-demand 0.13 takes the CURRENT SLOT, not a &Clock. (The
        // 0.6 API this program was written against passed a &Clock — the SDK
        // surface changes between releases, so re-verify on any version bump.)
        let value = rd
            .get_value(Clock::get()?.slot)
            .map_err(|_| WalletWarsError::RandomnessNotReady)?;

        let roll_ppm = roll_from_vrf(&value);
        let cracked = is_crack(roll_ppm, ticket.p_ppm as u128);

        let fee = ticket.fee;
        let to_defender = ticket.to_defender;
        let to_house_fee = ticket.to_house;

        let raider_ai = ctx.accounts.raider_vault.to_account_info();
        let target_ai = ctx.accounts.target_vault.to_account_info();
        let treasury_ai = ctx.accounts.treasury.to_account_info();

        // ── 1. The fee, always. Defender banks the toll win or lose. ──────────
        move_lamports(&raider_ai, &target_ai, to_defender)?;
        move_lamports(&raider_ai, &treasury_ai, to_house_fee)?;
        ctx.accounts.raider_vault.amount = ctx.accounts.raider_vault.amount.saturating_sub(fee);
        ctx.accounts.target_vault.banked =
            ctx.accounts.target_vault.banked.checked_add(to_defender).ok_or(WalletWarsError::MathOverflow)?;
        ctx.accounts.target_vault.fees_earned =
            ctx.accounts.target_vault.fees_earned.saturating_add(to_defender);

        let mut total_rake = to_house_fee;
        let mut seized = 0u64;

        if cracked {
            // ── 2. The slice, only on a crack. ────────────────────────────────
            // Priced from the corpus SEALED at commit, then clamped to what the
            // vault actually holds now (another siege may have settled in
            // between) and to the corpus floor.
            let rates = tier_rates(ticket.target_amount);
            let prize = compute_prize(
                ticket.target_amount,
                rates.slice_bps,
                ticket.mult_bps as u128,
                rates.house_prize_rake_bps,
            );

            let live = ctx.accounts.target_vault.amount;
            let spendable = live.saturating_sub(CORPUS_FLOOR);
            let gross = prize.gross.min(spendable);

            // Re-split the (possibly clamped) gross so conservation still holds
            // exactly: the house takes the remainder, never a rounded share.
            let to_raider = ((gross as u128) * ((economy::BPS - rates.house_prize_rake_bps) as u128)
                / economy::BPS) as u64;
            let prize_rake = gross - to_raider;

            move_lamports(&target_ai, &raider_ai, to_raider)?;
            move_lamports(&target_ai, &treasury_ai, prize_rake)?;

            ctx.accounts.target_vault.amount = live.saturating_sub(gross);
            ctx.accounts.raider_vault.amount =
                ctx.accounts.raider_vault.amount.saturating_add(to_raider);
            ctx.accounts.target_vault.cracked =
                ctx.accounts.target_vault.cracked.saturating_add(1);
            // A crack resets the streak, so the toll multiplier falls back to 1x.
            ctx.accounts.target_vault.streak = 0;

            total_rake = total_rake.saturating_add(prize_rake);
            seized = to_raider;
        } else {
            ctx.accounts.target_vault.survived =
                ctx.accounts.target_vault.survived.saturating_add(1);
            ctx.accounts.target_vault.streak =
                ctx.accounts.target_vault.streak.saturating_add(1);
        }

        ctx.accounts.config.total_raked =
            ctx.accounts.config.total_raked.saturating_add(total_rake);
        ctx.accounts.target_vault.shield_until = now + SHIELD_SECS;
        ctx.accounts.raider_vault.last_raid_ts = now;

        // Publish everything a client needs to verify the outcome independently.
        emit!(SiegeSettled {
            raider: ctx.accounts.raider_vault.key(),
            target: ctx.accounts.target_vault.key(),
            fee,
            to_defender,
            cracked,
            roll_ppm: roll_ppm as u64,
            p_ppm: ticket.p_ppm,
            seized,
            rake: total_rake,
            ts: now,
        });
        Ok(())
    }

    /// Cancel an unsettled ticket once expired, so a raider's fee is never held
    /// hostage by a randomness account that never reveals.
    pub fn cancel_siege(ctx: Context<CancelSiege>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            now >= ctx.accounts.ticket.created_ts + TICKET_EXPIRY_SECS,
            WalletWarsError::TicketNotExpired,
        );
        // No lamports moved at request time, so cancelling only closes the ticket
        // and returns its rent.
        Ok(())
    }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(
        mut, seeds = [b"config"], bump = config.bump,
        constraint = config.authority == authority.key() @ WalletWarsError::NotAuthority,
    )]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct OpenVault<'info> {
    #[account(init, payer = owner, space = 8 + Vault::INIT_SPACE, seeds = [b"vault", owner.key().as_ref()], bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VaultOwnerOnly<'info> {
    #[account(mut, seeds = [b"vault", owner.key().as_ref()], bump = vault.bump, has_one = owner)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseVault<'info> {
    #[account(mut, close = owner, seeds = [b"vault", owner.key().as_ref()], bump = vault.bump, has_one = owner)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct RequestSiege<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"vault", owner.key().as_ref()], bump = raider_vault.bump, has_one = owner)]
    pub raider_vault: Account<'info, Vault>,
    #[account(mut)]
    pub target_vault: Account<'info, Vault>,
    #[account(
        init, payer = owner, space = 8 + SiegeTicket::INIT_SPACE,
        seeds = [b"ticket", raider_vault.key().as_ref()], bump,
    )]
    pub ticket: Account<'info, SiegeTicket>,
    /// CHECK: validated by RandomnessAccountData::parse
    pub randomness: AccountInfo<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleSiege<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, close = owner, seeds = [b"ticket", raider_vault.key().as_ref()], bump = ticket.bump)]
    pub ticket: Account<'info, SiegeTicket>,
    #[account(mut)]
    pub raider_vault: Account<'info, Vault>,
    #[account(mut)]
    pub target_vault: Account<'info, Vault>,
    /// CHECK: validated against config.treasury
    #[account(mut, constraint = treasury.key() == config.treasury @ WalletWarsError::WrongTreasury)]
    pub treasury: AccountInfo<'info>,
    /// CHECK: validated against ticket.randomness
    pub randomness: AccountInfo<'info>,
    /// CHECK: rent return target for the closed ticket (the raider owner)
    #[account(mut)]
    pub owner: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CancelSiege<'info> {
    #[account(mut, close = owner, seeds = [b"ticket", raider_vault.key().as_ref()], bump = ticket.bump)]
    pub ticket: Account<'info, SiegeTicket>,
    #[account(seeds = [b"vault", owner.key().as_ref()], bump = raider_vault.bump, has_one = owner)]
    pub raider_vault: Account<'info, Vault>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

// ─── State ────────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub total_raked: u64,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub owner: Pubkey,
    /// V — the corpus. Prizes are sliced from this.
    pub amount: u64,
    /// Withdrawable tolls banked from failed (and successful) sieges.
    pub banked: u64,
    /// Lifetime tolls, monotonic. Display only; excluded from cash-out.
    pub fees_earned: u64,
    /// Consecutive survivals since the last crack → drives the toll multiplier.
    pub streak: u32,
    pub survived: u32,
    pub cracked: u32,
    pub shield_until: i64,
    pub last_raid_ts: i64,
    /// Immutable after open. 0 = Fortified, 1 = Standard, 2 = Exposed.
    pub risk_profile: u8,
    pub bump: u8,
}

/// A committed siege. Every price-determining input is sealed here so the raider
/// is charged exactly what they were quoted, even if the target's corpus changes
/// before the reveal.
#[account]
#[derive(InitSpace)]
pub struct SiegeTicket {
    pub raider: Pubkey,
    pub target: Pubkey,
    pub randomness: Pubkey,
    pub fee: u64,
    pub to_defender: u64,
    pub to_house: u64,
    /// The published crack chance, in ppm. Emitted so clients can verify.
    pub p_ppm: u64,
    /// The target's corpus at commit time — the basis for the prize slice.
    pub target_amount: u64,
    /// The streak multiplier at commit time, in bps.
    pub mult_bps: u64,
    pub created_ts: i64,
    pub bump: u8,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct VaultOpened {
    pub owner: Pubkey,
    pub amount: u64,
    pub risk_profile: u8,
}

#[event]
pub struct VaultClosed {
    pub owner: Pubkey,
    pub returned: u64,
}

#[event]
pub struct BankedWithdrawn {
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct SiegeRequested {
    pub raider: Pubkey,
    pub target: Pubkey,
    pub fee: u64,
    pub p_ppm: u64,
    pub ts: i64,
}

/// Everything needed to verify a settlement independently: the roll, the
/// threshold it was compared against, and every lamport movement.
#[event]
pub struct SiegeSettled {
    pub raider: Pubkey,
    pub target: Pubkey,
    pub fee: u64,
    pub to_defender: u64,
    pub cracked: bool,
    pub roll_ppm: u64,
    pub p_ppm: u64,
    pub seized: u64,
    pub rake: u64,
    pub ts: i64,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum WalletWarsError {
    #[msg("Stake is below the minimum")] BelowMinStake,
    #[msg("Amount must be greater than zero")] ZeroAmount,
    #[msg("Insufficient escrowed corpus to cover the fee")] InsufficientStash,
    #[msg("Cannot punch down — siege your own weight class or higher")] CannotPunchDown,
    #[msg("Target is shielded")] TargetShielded,
    #[msg("Target corpus is depleted")] TargetDepleted,
    #[msg("Siege is on cooldown")] SiegeCooldown,
    #[msg("Cannot siege your own vault")] SelfSiege,
    #[msg("Caller is not the vault owner")] NotOwner,
    #[msg("Caller is not the config authority")] NotAuthority,
    #[msg("Unknown risk profile")] BadRiskProfile,
    #[msg("Program is paused")] Paused,
    #[msg("Randomness account is invalid")] BadRandomness,
    #[msg("Randomness is stale — commit a fresh account")] StaleRandomness,
    #[msg("Randomness not yet revealed")] RandomnessNotReady,
    #[msg("Randomness account does not match the ticket")] RandomnessMismatch,
    #[msg("Ticket does not match the supplied vaults")] TicketMismatch,
    #[msg("Ticket has not expired yet")] TicketNotExpired,
    #[msg("Treasury account does not match config")] WrongTreasury,
    #[msg("Math overflow")] MathOverflow,
}
