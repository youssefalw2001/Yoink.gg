/*!
 * YOINK.GG — THE KING'S BAG
 * Solana / Anchor on-chain program  v2
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PAYMENT SPLIT (per YOINK)
 *   83%  → bag (RoundState PDA, paid to king on settle)
 *   10%  → treasury  (house rake)
 *    5%  → jackpot reserve
 *    2%  → house drain  (straight payment split, always to you)
 *
 * BAG DRAIN (applied to the EXISTING bag on each YOINK)
 *   Bag  <  5 SOL  → 1 % of bag bled to drain wallet
 *   Bag  5–20 SOL  → 2 % of bag bled to drain wallet
 *   Bag  > 20 SOL  → 3 % of bag bled to drain wallet
 *
 * This means every YOINK earns you:
 *   • Fixed cut from the incoming payment (2%)
 *   • Variable cut from the growing bag    (1–3%)
 *
 * COST ESCALATION
 *   Each YOINK in a round costs 0.025 SOL more than the last.
 *   Resets to 0.1 SOL at the start of every new round.
 *   Hard cap at 0.5 SOL.
 *
 * ANTI-SNIPE
 *   Per-wallet 3-second cooldown enforced via WalletCooldown PDA.
 * ─────────────────────────────────────────────────────────────────────────
 */

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("KBagXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

// ─── Constants ────────────────────────────────────────────────────────────────

const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

/// Base YOINK cost: 0.1 SOL
const BASE_COST_LAMPORTS: u64 = LAMPORTS_PER_SOL / 10;

/// Cost increase per yoink: 0.025 SOL
const COST_INCREMENT_LAMPORTS: u64 = LAMPORTS_PER_SOL / 40;

/// Hard cap on YOINK cost: 0.5 SOL
const MAX_COST_LAMPORTS: u64 = LAMPORTS_PER_SOL / 2;

/// Payment split basis points (must sum to 10_000)
const BAG_BPS: u64      = 8_300; // 83% → bag
const TREASURY_BPS: u64 = 1_000; // 10% → rake
const JACKPOT_BPS: u64  =   500; //  5% → jackpot
const DRAIN_BPS: u64    =   200; //  2% → house drain (payment slice)
const BPS_DENOM: u64    = 10_000;

/// Escalating bag drain tiers (basis points of current bag per YOINK)
/// Tier chosen by current bag_lamports at time of yoink.
const DRAIN_TIER_1_MAX:  u64 = 5  * LAMPORTS_PER_SOL; // bag < 5 SOL  → 1%
const DRAIN_TIER_2_MAX:  u64 = 20 * LAMPORTS_PER_SOL; // bag < 20 SOL → 2%
const DRAIN_TIER_1_BPS:  u64 = 100;
const DRAIN_TIER_2_BPS:  u64 = 200;
const DRAIN_TIER_3_BPS:  u64 = 300; // bag ≥ 20 SOL  → 3%

/// Round duration: 30 seconds
const ROUND_DURATION_SECS: i64 = 30;

/// Per-wallet cooldown: 3 seconds
const PER_WALLET_COOLDOWN_SECS: i64 = 3;

/// House funds this as the starting bag on each new round
const STARTING_BAG_LAMPORTS: u64 = 2 * LAMPORTS_PER_SOL;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Returns the bag-drain amount in lamports for a given bag size.
fn bag_drain_lamports(bag: u64) -> u64 {
    let bps = if bag < DRAIN_TIER_1_MAX {
        DRAIN_TIER_1_BPS
    } else if bag < DRAIN_TIER_2_MAX {
        DRAIN_TIER_2_BPS
    } else {
        DRAIN_TIER_3_BPS
    };
    bag * bps / BPS_DENOM
}

// ─── Program ──────────────────────────────────────────────────────────────────

#[program]
pub mod kings_bag {
    use super::*;

    // ── initialize_config ─────────────────────────────────────────────────────
    /// One-time setup: sets authority, treasury, jackpot, and drain wallets.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        treasury: Pubkey,
        jackpot: Pubkey,
        drain: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority          = ctx.accounts.authority.key();
        config.treasury           = treasury;
        config.jackpot            = jackpot;
        config.drain              = drain;
        config.total_rounds       = 0;
        config.total_distributed  = 0;
        config.total_drained      = 0;
        config.bump               = ctx.bumps.config;
        Ok(())
    }

    // ── open_round ────────────────────────────────────────────────────────────
    /// House opens a new round and seeds the starting bag.
    pub fn open_round(ctx: Context<OpenRound>, round_number: u64) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            KingsBagError::Unauthorized,
        );

        let round              = &mut ctx.accounts.round;
        round.round_number     = round_number;
        round.king             = ctx.accounts.authority.key();
        round.bag_lamports     = STARTING_BAG_LAMPORTS;
        round.yoink_count      = 0;
        round.last_yoink_ts    = Clock::get()?.unix_timestamp;
        round.is_settled       = false;
        round.bump             = ctx.bumps.round;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to:   ctx.accounts.round.to_account_info(),
                },
            ),
            STARTING_BAG_LAMPORTS,
        )?;

        emit!(RoundOpened {
            round_number,
            starting_bag: STARTING_BAG_LAMPORTS,
            ts: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ── yoink ─────────────────────────────────────────────────────────────────
    /// Steal the bag. Applies:
    ///   1. Payment split  → bag / treasury / jackpot / drain (fixed %)
    ///   2. Bag drain      → escalating % of current bag to drain wallet
    ///   3. Resets 30s countdown
    pub fn yoink(ctx: Context<Yoink>) -> Result<()> {
        let now      = Clock::get()?.unix_timestamp;
        let round    = &mut ctx.accounts.round;
        let cooldown = &mut ctx.accounts.wallet_cooldown;

        // ── guards ────────────────────────────────────────────────────────
        require!(!round.is_settled,                        KingsBagError::RoundAlreadySettled);
        require!(now - round.last_yoink_ts < ROUND_DURATION_SECS, KingsBagError::RoundExpired);
        require!(now - cooldown.last_yoink_ts >= PER_WALLET_COOLDOWN_SECS, KingsBagError::WalletOnCooldown);

        // ── escalating cost ───────────────────────────────────────────────
        let cost = BASE_COST_LAMPORTS
            .saturating_add(round.yoink_count as u64 * COST_INCREMENT_LAMPORTS)
            .min(MAX_COST_LAMPORTS);

        // ── payment split (from player's wallet) ──────────────────────────
        let bag_share      = cost * BAG_BPS      / BPS_DENOM;
        let treasury_share = cost * TREASURY_BPS / BPS_DENOM;
        let jackpot_share  = cost * JACKPOT_BPS  / BPS_DENOM;
        let drain_share    = cost * DRAIN_BPS    / BPS_DENOM;

        // player → bag
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to:   ctx.accounts.round.to_account_info(),
                }),
            bag_share,
        )?;
        // player → treasury (rake)
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to:   ctx.accounts.treasury.to_account_info(),
                }),
            treasury_share,
        )?;
        // player → jackpot reserve
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to:   ctx.accounts.jackpot.to_account_info(),
                }),
            jackpot_share,
        )?;
        // player → drain (2% fixed slice of payment)
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to:   ctx.accounts.drain.to_account_info(),
                }),
            drain_share,
        )?;

        // ── bag drain (escalating % bled FROM the bag) ────────────────────
        // Calculate against current bag BEFORE this yoink's bag_share lands.
        let bag_drain = bag_drain_lamports(round.bag_lamports);

        if bag_drain > 0 && bag_drain < round.bag_lamports {
            // Transfer from round PDA → drain wallet using PDA signer seeds
            let seeds: &[&[u8]] = &[
                b"round",
                &round.round_number.to_le_bytes(),
                &[round.bump],
            ];
            let signer = &[seeds];

            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.round.to_account_info(),
                        to:   ctx.accounts.drain.to_account_info(),
                    },
                    signer,
                ),
                bag_drain,
            )?;

            round.bag_lamports = round.bag_lamports.saturating_sub(bag_drain);

            // accumulate in global config
            ctx.accounts.config.total_drained =
                ctx.accounts.config.total_drained.saturating_add(bag_drain + drain_share);
        } else {
            ctx.accounts.config.total_drained =
                ctx.accounts.config.total_drained.saturating_add(drain_share);
        }

        // ── update round state ────────────────────────────────────────────
        round.bag_lamports  = round.bag_lamports.saturating_add(bag_share);
        round.king          = ctx.accounts.player.key();
        round.last_yoink_ts = now;
        round.yoink_count   = round.yoink_count.saturating_add(1);

        // ── update cooldown ───────────────────────────────────────────────
        cooldown.wallet        = ctx.accounts.player.key();
        cooldown.round_number  = round.round_number;
        cooldown.last_yoink_ts = now;

        emit!(YoinkEvent {
            round_number:   round.round_number,
            player:         ctx.accounts.player.key(),
            cost_lamports:  cost,
            bag_lamports:   round.bag_lamports,
            bag_drain,
            drain_share,
            yoink_count:    round.yoink_count,
            ts:             now,
        });

        Ok(())
    }

    // ── settle ────────────────────────────────────────────────────────────────
    /// After 30s have elapsed since the last YOINK, anyone can call settle.
    /// Full bag pays out to the current king.
    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        let now   = Clock::get()?.unix_timestamp;
        let round = &mut ctx.accounts.round;

        require!(!round.is_settled,                                   KingsBagError::RoundAlreadySettled);
        require!(now - round.last_yoink_ts >= ROUND_DURATION_SECS,   KingsBagError::RoundNotExpired);
        require!(ctx.accounts.king.key() == round.king,               KingsBagError::WrongKing);

        let payout = round.bag_lamports;

        **ctx.accounts.round.to_account_info().try_borrow_mut_lamports()? -= payout;
        **ctx.accounts.king.try_borrow_mut_lamports()?                    += payout;

        let config = &mut ctx.accounts.config;
        config.total_rounds      = config.total_rounds.saturating_add(1);
        config.total_distributed = config.total_distributed.saturating_add(payout);

        round.is_settled    = true;
        round.bag_lamports  = 0;

        emit!(RoundSettled {
            round_number: round.round_number,
            king:         round.king,
            payout,
            yoink_count:  round.yoink_count,
            ts:           now,
        });

        Ok(())
    }
}

// ─── Account Structs ──────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init, payer = authority,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [b"config"], bump,
    )]
    pub config: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_number: u64)]
pub struct OpenRound<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(
        init, payer = authority,
        space = 8 + RoundState::INIT_SPACE,
        seeds = [b"round", &round_number.to_le_bytes()], bump,
    )]
    pub round: Account<'info, RoundState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Yoink<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [b"round", &round.round_number.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, RoundState>,

    #[account(
        init_if_needed, payer = player,
        space = 8 + WalletCooldown::INIT_SPACE,
        seeds = [b"cooldown", player.key().as_ref(), &round.round_number.to_le_bytes()],
        bump,
    )]
    pub wallet_cooldown: Account<'info, WalletCooldown>,

    #[account(mut)]
    pub player: Signer<'info>,

    /// CHECK: validated against config.treasury
    #[account(mut, constraint = treasury.key() == config.treasury @ KingsBagError::WrongTreasury)]
    pub treasury: AccountInfo<'info>,

    /// CHECK: validated against config.jackpot
    #[account(mut, constraint = jackpot.key() == config.jackpot @ KingsBagError::WrongJackpot)]
    pub jackpot: AccountInfo<'info>,

    /// CHECK: validated against config.drain
    #[account(mut, constraint = drain.key() == config.drain @ KingsBagError::WrongDrain)]
    pub drain: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(
        mut,
        seeds = [b"round", &round.round_number.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, RoundState>,
    /// CHECK: validated against round.king in instruction body
    #[account(mut)]
    pub king: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

// ─── State ────────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub authority:         Pubkey,
    pub treasury:          Pubkey,
    pub jackpot:           Pubkey,
    pub drain:             Pubkey,  // ← new: house drain wallet
    pub total_rounds:      u64,
    pub total_distributed: u64,
    pub total_drained:     u64,     // ← new: cumulative lamports drained
    pub bump:              u8,
}

#[account]
#[derive(InitSpace)]
pub struct RoundState {
    pub round_number:   u64,
    pub king:           Pubkey,
    pub bag_lamports:   u64,
    pub yoink_count:    u32,
    pub last_yoink_ts:  i64,
    pub is_settled:     bool,
    pub bump:           u8,
}

#[account]
#[derive(InitSpace)]
pub struct WalletCooldown {
    pub wallet:        Pubkey,
    pub round_number:  u64,
    pub last_yoink_ts: i64,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct RoundOpened {
    pub round_number: u64,
    pub starting_bag: u64,
    pub ts:           i64,
}

#[event]
pub struct YoinkEvent {
    pub round_number:  u64,
    pub player:        Pubkey,
    pub cost_lamports: u64,
    pub bag_lamports:  u64,
    pub bag_drain:     u64,     // ← lamports drained from bag this yoink
    pub drain_share:   u64,     // ← lamports from payment split to drain
    pub yoink_count:   u32,
    pub ts:            i64,
}

#[event]
pub struct RoundSettled {
    pub round_number: u64,
    pub king:         Pubkey,
    pub payout:       u64,
    pub yoink_count:  u32,
    pub ts:           i64,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum KingsBagError {
    #[msg("Round has already been settled")]
    RoundAlreadySettled,
    #[msg("Round timer has not yet expired")]
    RoundNotExpired,
    #[msg("Round timer has expired — call settle()")]
    RoundExpired,
    #[msg("Wallet is on cooldown — wait 3 seconds")]
    WalletOnCooldown,
    #[msg("Only the house authority can perform this action")]
    Unauthorized,
    #[msg("King account does not match current round king")]
    WrongKing,
    #[msg("Treasury account does not match config")]
    WrongTreasury,
    #[msg("Jackpot account does not match config")]
    WrongJackpot,
    #[msg("Drain account does not match config")]
    WrongDrain,
}
