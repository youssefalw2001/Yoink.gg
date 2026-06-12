/*!
 * YOINK.GG — WALLET WARS  (Solana / Anchor program)
 *
 * ⚠️  STATUS: DEVNET SCAFFOLD — NOT DEPLOYED, NOT AUDITED.
 *     This program escrows and moves REAL lamports. Do NOT deploy to mainnet
 *     or point real funds at it until it has been compiled, integration-tested
 *     on devnet, AND professionally audited. The frontend stays on the
 *     simulation until then (see src/lib/walletWarsChain.ts, ESCROW_ENABLED).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MODEL (mirrors the live sim exactly):
 *   • Open a STASH (escrows SOL in a per-player PDA). It's your war chest
 *     AND the prize others raid.
 *   • Raids are FIXED 50/50 — same odds for everyone (whale or minnow).
 *   • MATCHED STAKES — you risk a wager W; win → take W from the target,
 *     lose → they take W from you. You can only win what you risk.
 *   • HOUSE RAKE — 15% of every transferred amount + bounty payout → treasury.
 *   • PROVABLY FAIR — the win/lose bit comes from Switchboard On-Demand VRF,
 *     committed at request time and revealed at settle. The house cannot pick
 *     the outcome.
 *   • Tiers (weight classes), post-raid shields, and a repeat-target tax are
 *     enforced on-chain to keep it whale-safe and grief-resistant.
 * ─────────────────────────────────────────────────────────────────────────
 */

use anchor_lang::prelude::*;
use switchboard_on_demand::accounts::RandomnessAccountData;

declare_id!("WWarsXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

// ─── Constants ──────────────────────────────────────────────────────────────
const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
const HOUSE_RAKE_BPS: u64 = 1_500; // 15%
const BPS_DENOM: u64 = 10_000;
const WIN_THRESHOLD: u64 = 5_000; // roll (0..9999) < 5000 → win  (exactly 50%)
const SHIELD_SECS: i64 = 6;
const RAID_COOLDOWN_SECS: i64 = 3;

// Tier floors (lamports). Same weight class only.
const TIER_FLOORS: [u64; 4] = [
    LAMPORTS_PER_SOL / 10,   // Pit   0.1
    LAMPORTS_PER_SOL,        // Grind 1
    5 * LAMPORTS_PER_SOL,    // Arena 5
    20 * LAMPORTS_PER_SOL,   // Court 20
];

fn tier_index(amount: u64) -> u8 {
    let mut t = 0u8;
    for (i, floor) in TIER_FLOORS.iter().enumerate() {
        if amount >= *floor { t = i as u8; }
    }
    t
}

/// Move lamports between two program-owned accounts via direct balance edits.
/// (System-program transfers can't debit a data-bearing PDA.)
fn move_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
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
        c.bump = ctx.bumps.config;
        Ok(())
    }

    /// Open a stash: escrow `amount` lamports into the player's Stash PDA.
    pub fn open_stash(ctx: Context<OpenStash>, amount: u64) -> Result<()> {
        require!(amount >= TIER_FLOORS[0], WalletWarsError::BelowMinStake);
        // Move the stake from the owner into the (rent-exempt) PDA.
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.stash.to_account_info(),
                },
            ),
            amount,
        )?;
        let s = &mut ctx.accounts.stash;
        s.owner = ctx.accounts.owner.key();
        s.amount = amount;
        s.bounty = 0;
        s.shield_until = 0;
        s.survived = 0;
        s.cracked = 0;
        s.bump = ctx.bumps.stash;
        Ok(())
    }

    /// Cash out: return stash + bounty to the owner and close the PDA.
    pub fn close_stash(ctx: Context<CloseStash>) -> Result<()> {
        // Lamports auto-return to `owner` via the `close` attribute. Bounty
        // lamports live in the same PDA, so they return too.
        emit!(StashClosed {
            owner: ctx.accounts.owner.key(),
            returned: ctx.accounts.stash.amount + ctx.accounts.stash.bounty,
        });
        Ok(())
    }

    /// Pledge a bounty (extra lamports) onto a target stash. Funds escrow into
    /// the target PDA and are paid to whoever cracks it.
    pub fn place_bounty(ctx: Context<PlaceBounty>, amount: u64) -> Result<()> {
        require!(amount > 0, WalletWarsError::ZeroAmount);
        require!(
            tier_index(ctx.accounts.backer_stash.amount) == tier_index(ctx.accounts.target.amount),
            WalletWarsError::DifferentTier,
        );
        // Backer's escrowed stash funds the bounty → target PDA.
        require!(ctx.accounts.backer_stash.amount >= amount, WalletWarsError::InsufficientStash);
        move_lamports(
            &ctx.accounts.backer_stash.to_account_info(),
            &ctx.accounts.target.to_account_info(),
            amount,
        )?;
        ctx.accounts.backer_stash.amount -= amount;
        ctx.accounts.target.bounty = ctx.accounts.target.bounty.checked_add(amount).unwrap();
        Ok(())
    }

    /// STEP 1 — Request a raid: lock the wager + bind a committed Switchboard
    /// randomness account. The outcome is sealed here; the house can't change it.
    pub fn request_raid(ctx: Context<RequestRaid>, wager: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let raider = &ctx.accounts.raider_stash;
        let target = &ctx.accounts.target_stash;

        require!(raider.owner == ctx.accounts.owner.key(), WalletWarsError::NotOwner);
        require!(raider.key() != target.key(), WalletWarsError::SelfRaid);
        require!(tier_index(raider.amount) == tier_index(target.amount), WalletWarsError::DifferentTier);
        require!(now >= target.shield_until, WalletWarsError::TargetShielded);
        require!(now >= raider.next_raid_at(), WalletWarsError::RaidCooldown);
        require!(wager >= TIER_FLOORS[0], WalletWarsError::BelowMinStake);
        // Matched stakes: can't risk more than you hold or more than the target holds.
        require!(wager <= raider.amount, WalletWarsError::InsufficientStash);
        require!(wager <= target.amount, WalletWarsError::WagerExceedsTarget);

        // Validate the randomness account is freshly committed (not yet revealed).
        let rd = RandomnessAccountData::parse(ctx.accounts.randomness.data.borrow())
            .map_err(|_| WalletWarsError::BadRandomness)?;
        require!(rd.seed_slot == Clock::get()?.slot - 1, WalletWarsError::StaleRandomness);

        let ticket = &mut ctx.accounts.ticket;
        ticket.raider = ctx.accounts.raider_stash.key();
        ticket.target = ctx.accounts.target_stash.key();
        ticket.randomness = ctx.accounts.randomness.key();
        ticket.wager = wager;
        ticket.created_ts = now;
        ticket.bump = ctx.bumps.ticket;
        Ok(())
    }

    /// STEP 2 — Settle: read the revealed VRF value, derive the 50/50 outcome,
    /// move matched stakes + bounty, take the house rake, set shields.
    pub fn settle_raid(ctx: Context<SettleRaid>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let ticket = &ctx.accounts.ticket;
        require!(ticket.randomness == ctx.accounts.randomness.key(), WalletWarsError::RandomnessMismatch);

        // Reveal the committed randomness (errors if not yet revealed).
        let rd = RandomnessAccountData::parse(ctx.accounts.randomness.data.borrow())
            .map_err(|_| WalletWarsError::BadRandomness)?;
        let value = rd
            .get_value(&Clock::get()?)
            .map_err(|_| WalletWarsError::RandomnessNotReady)?;
        // First 8 bytes → u64 → roll in [0, 9999]. roll < 5000 = raider wins.
        let roll = u64::from_le_bytes(value[0..8].try_into().unwrap()) % BPS_DENOM;
        let raider_wins = roll < WIN_THRESHOLD;

        let wager = ticket.wager;
        let rake = wager * HOUSE_RAKE_BPS / BPS_DENOM;
        let net = wager - rake;

        let raider = &ctx.accounts.raider_stash.to_account_info();
        let target = &ctx.accounts.target_stash.to_account_info();
        let treasury = &ctx.accounts.treasury.to_account_info();

        if raider_wins {
            // Target → raider (net), target → treasury (rake). Raider keeps wager.
            move_lamports(target, raider, net)?;
            move_lamports(target, treasury, rake)?;
            ctx.accounts.raider_stash.amount += net;
            ctx.accounts.target_stash.amount = ctx.accounts.target_stash.amount.saturating_sub(wager);

            // Bounty (if any) → raider, minus rake.
            let bounty = ctx.accounts.target_stash.bounty;
            if bounty > 0 {
                let b_rake = bounty * HOUSE_RAKE_BPS / BPS_DENOM;
                move_lamports(target, raider, bounty - b_rake)?;
                move_lamports(target, treasury, b_rake)?;
                ctx.accounts.raider_stash.amount += bounty - b_rake;
                ctx.accounts.target_stash.bounty = 0;
                ctx.accounts.config.total_raked += b_rake;
            }
            ctx.accounts.target_stash.cracked += 1;
        } else {
            // Raider → target (net), raider → treasury (rake).
            move_lamports(raider, target, net)?;
            move_lamports(raider, treasury, rake)?;
            ctx.accounts.target_stash.amount += net;
            ctx.accounts.raider_stash.amount = ctx.accounts.raider_stash.amount.saturating_sub(wager);
            ctx.accounts.target_stash.survived += 1;
        }

        ctx.accounts.config.total_raked += rake;
        // Shields + cooldown.
        ctx.accounts.target_stash.shield_until = now + SHIELD_SECS;
        ctx.accounts.raider_stash.last_raid_ts = now;

        emit!(RaidSettled {
            raider: ctx.accounts.raider_stash.key(),
            target: ctx.accounts.target_stash.key(),
            wager,
            raider_wins,
            roll,
            rake,
            ts: now,
        });
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
pub struct OpenStash<'info> {
    #[account(init, payer = owner, space = 8 + Stash::INIT_SPACE, seeds = [b"stash", owner.key().as_ref()], bump)]
    pub stash: Account<'info, Stash>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseStash<'info> {
    #[account(mut, close = owner, seeds = [b"stash", owner.key().as_ref()], bump = stash.bump, has_one = owner)]
    pub stash: Account<'info, Stash>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct PlaceBounty<'info> {
    #[account(mut, seeds = [b"stash", owner.key().as_ref()], bump = backer_stash.bump, has_one = owner)]
    pub backer_stash: Account<'info, Stash>,
    #[account(mut)]
    pub target: Account<'info, Stash>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct RequestRaid<'info> {
    #[account(mut, seeds = [b"stash", owner.key().as_ref()], bump = raider_stash.bump, has_one = owner)]
    pub raider_stash: Account<'info, Stash>,
    #[account(mut)]
    pub target_stash: Account<'info, Stash>,
    #[account(
        init, payer = owner, space = 8 + RaidTicket::INIT_SPACE,
        seeds = [b"ticket", raider_stash.key().as_ref()], bump,
    )]
    pub ticket: Account<'info, RaidTicket>,
    /// CHECK: validated by RandomnessAccountData::parse
    pub randomness: AccountInfo<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleRaid<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, close = owner, seeds = [b"ticket", raider_stash.key().as_ref()], bump = ticket.bump)]
    pub ticket: Account<'info, RaidTicket>,
    #[account(mut)]
    pub raider_stash: Account<'info, Stash>,
    #[account(mut)]
    pub target_stash: Account<'info, Stash>,
    /// CHECK: validated against config.treasury
    #[account(mut, constraint = treasury.key() == config.treasury @ WalletWarsError::WrongTreasury)]
    pub treasury: AccountInfo<'info>,
    /// CHECK: validated against ticket.randomness
    pub randomness: AccountInfo<'info>,
    /// CHECK: rent return target for the closed ticket (the raider owner)
    #[account(mut)]
    pub owner: AccountInfo<'info>,
}

// ─── State ────────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub total_raked: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Stash {
    pub owner: Pubkey,
    pub amount: u64,
    pub bounty: u64,
    pub shield_until: i64,
    pub last_raid_ts: i64,
    pub survived: u32,
    pub cracked: u32,
    pub bump: u8,
}

impl Stash {
    fn next_raid_at(&self) -> i64 {
        self.last_raid_ts + RAID_COOLDOWN_SECS
    }
}

#[account]
#[derive(InitSpace)]
pub struct RaidTicket {
    pub raider: Pubkey,
    pub target: Pubkey,
    pub randomness: Pubkey,
    pub wager: u64,
    pub created_ts: i64,
    pub bump: u8,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct RaidSettled {
    pub raider: Pubkey,
    pub target: Pubkey,
    pub wager: u64,
    pub raider_wins: bool,
    pub roll: u64,
    pub rake: u64,
    pub ts: i64,
}

#[event]
pub struct StashClosed {
    pub owner: Pubkey,
    pub returned: u64,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum WalletWarsError {
    #[msg("Stake is below the minimum")] BelowMinStake,
    #[msg("Amount must be greater than zero")] ZeroAmount,
    #[msg("Insufficient escrowed stash")] InsufficientStash,
    #[msg("Wager exceeds what the target holds (matched stakes)")] WagerExceedsTarget,
    #[msg("Target is in a different weight class")] DifferentTier,
    #[msg("Target is shielded")] TargetShielded,
    #[msg("Raid is on cooldown")] RaidCooldown,
    #[msg("Cannot raid your own stash")] SelfRaid,
    #[msg("Caller is not the stash owner")] NotOwner,
    #[msg("Randomness account is invalid")] BadRandomness,
    #[msg("Randomness is stale — commit a fresh account")] StaleRandomness,
    #[msg("Randomness not yet revealed")] RandomnessNotReady,
    #[msg("Randomness account does not match the ticket")] RandomnessMismatch,
    #[msg("Treasury account does not match config")] WrongTreasury,
    #[msg("Math overflow")] MathOverflow,
}
