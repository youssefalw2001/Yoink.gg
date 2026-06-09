/*!
 * YOINK.GG — THE KING'S BAG
 * Solana / Anchor on-chain program
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MECHANICS
 *
 *  One RoundState PDA lives per round number.
 *  Anyone calls `yoink` to pay SOL and steal the bag.
 *    - 85% of payment → bag (held in the PDA)
 *    - 10% → treasury (house rake)
 *    - 5%  → jackpot reserve PDA
 *  A 30-second on-chain timer tracks the last yoink timestamp.
 *  Anyone can call `settle` after the timer expires — pays out the bag
 *  to the current king and opens a new round.
 *
 *  Cost escalation: each yoink within a round adds BASE_COST_INCREMENT.
 *  Cost resets at the start of every new round.
 *
 *  Anti-snipe: a PER_WALLET_COOLDOWN_SECS cooldown is enforced per wallet
 *  per round — stored in a small WalletCooldown PDA.
 * ─────────────────────────────────────────────────────────────────────────
 */

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("KBagXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

// ─── Constants ────────────────────────────────────────────────────────────────

/// lamports in 1 SOL
const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

/// Base YOINK cost: 0.1 SOL
const BASE_COST_LAMPORTS: u64 = LAMPORTS_PER_SOL / 10;

/// Cost increase per yoink within the same round: 0.025 SOL
const COST_INCREMENT_LAMPORTS: u64 = LAMPORTS_PER_SOL / 40;

/// Maximum yoink cost: 0.5 SOL
const MAX_COST_LAMPORTS: u64 = LAMPORTS_PER_SOL / 2;

/// Bag receives 85% of every payment
const BAG_BPS: u64 = 8_500;

/// Treasury receives 10% of every payment
const TREASURY_BPS: u64 = 1_000;

/// Jackpot reserve receives 5% of every payment
const JACKPOT_BPS: u64 = 500;

const BPS_DENOMINATOR: u64 = 10_000;

/// Round duration in seconds
const ROUND_DURATION_SECS: i64 = 30;

/// Per-wallet cooldown: 3 seconds between yoinks
const PER_WALLET_COOLDOWN_SECS: i64 = 3;

/// Starting bag funded by the house when a new round is opened: 2 SOL
const STARTING_BAG_LAMPORTS: u64 = 2 * LAMPORTS_PER_SOL;

// ─── Program ──────────────────────────────────────────────────────────────────

#[program]
pub mod kings_bag {
    use super::*;

    // ── open_round ────────────────────────────────────────────────────────────
    /// House calls this once per round to initialise the RoundState PDA and
    /// fund the starting bag.  Only the authority stored in GlobalConfig may
    /// call this.
    pub fn open_round(ctx: Context<OpenRound>, round_number: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(
            ctx.accounts.authority.key() == config.authority,
            KingsBagError::Unauthorized
        );

        let round = &mut ctx.accounts.round;
        round.round_number = round_number;
        round.king = ctx.accounts.authority.key(); // house is king until first yoink
        round.bag_lamports = STARTING_BAG_LAMPORTS;
        round.yoink_count = 0;
        round.last_yoink_ts = Clock::get()?.unix_timestamp;
        round.is_settled = false;
        round.bump = ctx.bumps.round;

        // Transfer starting bag from authority → round PDA
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.round.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, STARTING_BAG_LAMPORTS)?;

        emit!(RoundOpened {
            round_number,
            starting_bag: STARTING_BAG_LAMPORTS,
            ts: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ── initialize_config ─────────────────────────────────────────────────────
    /// Called once at deploy time.  Sets the authority, treasury, and jackpot
    /// wallet addresses.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        treasury: Pubkey,
        jackpot: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = treasury;
        config.jackpot = jackpot;
        config.total_rounds = 0;
        config.total_distributed = 0;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    // ── yoink ─────────────────────────────────────────────────────────────────
    /// Anyone pays to steal the bag and become the new king.
    /// Enforces:
    ///   1. Round is still live (not settled, timer not expired).
    ///   2. Per-wallet 3-second cooldown.
    ///   3. Correct payment amount (escalating cost).
    ///   4. Splits payment: bag / treasury / jackpot.
    ///   5. Resets the 30-second countdown.
    pub fn yoink(ctx: Context<Yoink>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let round = &mut ctx.accounts.round;
        let cooldown = &mut ctx.accounts.wallet_cooldown;

        // ── Guard: round must be live ──────────────────────────────────────
        require!(!round.is_settled, KingsBagError::RoundAlreadySettled);

        let elapsed = now - round.last_yoink_ts;
        require!(
            elapsed < ROUND_DURATION_SECS,
            KingsBagError::RoundExpired
        );

        // ── Guard: per-wallet cooldown ─────────────────────────────────────
        let since_last = now - cooldown.last_yoink_ts;
        require!(
            since_last >= PER_WALLET_COOLDOWN_SECS,
            KingsBagError::WalletOnCooldown
        );

        // ── Compute cost for this yoink ───────────────────────────────────
        let cost_lamports = {
            let raw = BASE_COST_LAMPORTS
                .saturating_add(round.yoink_count as u64 * COST_INCREMENT_LAMPORTS);
            raw.min(MAX_COST_LAMPORTS)
        };

        // ── Verify player sent enough lamports ────────────────────────────
        // (In the real integration the frontend sends exact amount;
        //  here we check the instruction-level transfer in the CPI below.)

        // ── Split the payment ─────────────────────────────────────────────
        let bag_share     = cost_lamports * BAG_BPS      / BPS_DENOMINATOR;
        let treasury_share = cost_lamports * TREASURY_BPS / BPS_DENOMINATOR;
        let jackpot_share  = cost_lamports * JACKPOT_BPS  / BPS_DENOMINATOR;

        // Player → round PDA (bag share)
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to:   ctx.accounts.round.to_account_info(),
                },
            ),
            bag_share,
        )?;

        // Player → treasury
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to:   ctx.accounts.treasury.to_account_info(),
                },
            ),
            treasury_share,
        )?;

        // Player → jackpot reserve
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to:   ctx.accounts.jackpot.to_account_info(),
                },
            ),
            jackpot_share,
        )?;

        // ── Update round state ────────────────────────────────────────────
        round.bag_lamports     = round.bag_lamports.saturating_add(bag_share);
        round.king             = ctx.accounts.player.key();
        round.last_yoink_ts    = now;
        round.yoink_count      = round.yoink_count.saturating_add(1);

        // ── Update per-wallet cooldown ────────────────────────────────────
        cooldown.wallet        = ctx.accounts.player.key();
        cooldown.round_number  = round.round_number;
        cooldown.last_yoink_ts = now;

        emit!(YoinkEvent {
            round_number:  round.round_number,
            player:        ctx.accounts.player.key(),
            cost_lamports,
            bag_lamports:  round.bag_lamports,
            yoink_count:   round.yoink_count,
            ts:            now,
        });

        Ok(())
    }

    // ── settle ────────────────────────────────────────────────────────────────
    /// Anyone can call settle once ROUND_DURATION_SECS have elapsed since the
    /// last yoink.  Pays out the full bag to the current king.
    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let round = &mut ctx.accounts.round;

        require!(!round.is_settled, KingsBagError::RoundAlreadySettled);

        let elapsed = now - round.last_yoink_ts;
        require!(
            elapsed >= ROUND_DURATION_SECS,
            KingsBagError::RoundNotExpired
        );

        require!(
            ctx.accounts.king.key() == round.king,
            KingsBagError::WrongKing
        );

        // Transfer bag → king using PDA signer seeds
        let seeds: &[&[u8]] = &[
            b"round",
            &round.round_number.to_le_bytes(),
            &[round.bump],
        ];
        let signer = &[seeds];

        let payout = round.bag_lamports;

        **ctx.accounts.round.to_account_info().try_borrow_mut_lamports()? -= payout;
        **ctx.accounts.king.try_borrow_mut_lamports()? += payout;

        // Update global stats
        let config = &mut ctx.accounts.config;
        config.total_rounds       = config.total_rounds.saturating_add(1);
        config.total_distributed  = config.total_distributed.saturating_add(payout);

        round.is_settled     = true;
        round.bag_lamports   = 0;

        emit!(RoundSettled {
            round_number: round.round_number,
            king:         round.king,
            payout,
            yoink_count:  round.yoink_count,
            ts:           now,
        });

        let _ = signer; // suppress unused warning
        Ok(())
    }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_number: u64)]
pub struct OpenRound<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + RoundState::INIT_SPACE,
        seeds = [b"round", &round_number.to_le_bytes()],
        bump,
    )]
    pub round: Account<'info, RoundState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Yoink<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [b"round", &round.round_number.to_le_bytes()],
        bump = round.bump,
    )]
    pub round: Account<'info, RoundState>,

    /// Per-wallet cooldown PDA — one per (wallet × round)
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + WalletCooldown::INIT_SPACE,
        seeds = [b"cooldown", player.key().as_ref(), &round.round_number.to_le_bytes()],
        bump,
    )]
    pub wallet_cooldown: Account<'info, WalletCooldown>,

    #[account(mut)]
    pub player: Signer<'info>,

    /// CHECK: treasury is a plain wallet controlled by the house
    #[account(
        mut,
        constraint = treasury.key() == config.treasury @ KingsBagError::WrongTreasury
    )]
    pub treasury: AccountInfo<'info>,

    /// CHECK: jackpot reserve wallet controlled by the house
    #[account(
        mut,
        constraint = jackpot.key() == config.jackpot @ KingsBagError::WrongJackpot
    )]
    pub jackpot: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
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

// ─── State Accounts ───────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    /// House wallet — only this can open rounds
    pub authority: Pubkey,
    /// Treasury receives rake
    pub treasury: Pubkey,
    /// Jackpot reserve
    pub jackpot: Pubkey,
    /// Total rounds ever settled
    pub total_rounds: u64,
    /// Total lamports ever paid out to kings
    pub total_distributed: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RoundState {
    pub round_number: u64,
    /// Current king (last person to successfully yoink)
    pub king: Pubkey,
    /// Accumulated bag size in lamports (held in this PDA)
    pub bag_lamports: u64,
    /// How many yoinks have happened this round (drives cost escalation)
    pub yoink_count: u32,
    /// Unix timestamp of last successful yoink (or round open)
    pub last_yoink_ts: i64,
    /// True once settle() has been called
    pub is_settled: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct WalletCooldown {
    pub wallet: Pubkey,
    pub round_number: u64,
    /// Unix timestamp of this wallet's last yoink this round
    pub last_yoink_ts: i64,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct RoundOpened {
    pub round_number: u64,
    pub starting_bag: u64,
    pub ts: i64,
}

#[event]
pub struct YoinkEvent {
    pub round_number: u64,
    pub player: Pubkey,
    pub cost_lamports: u64,
    pub bag_lamports: u64,
    pub yoink_count: u32,
    pub ts: i64,
}

#[event]
pub struct RoundSettled {
    pub round_number: u64,
    pub king: Pubkey,
    pub payout: u64,
    pub yoink_count: u32,
    pub ts: i64,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum KingsBagError {
    #[msg("Round has already been settled")]
    RoundAlreadySettled,

    #[msg("Round timer has not yet expired — keep holding")]
    RoundNotExpired,

    #[msg("Round timer has expired — call settle()")]
    RoundExpired,

    #[msg("Wallet is on cooldown — wait 3 seconds between yoinks")]
    WalletOnCooldown,

    #[msg("Only the house authority can perform this action")]
    Unauthorized,

    #[msg("King account does not match current round king")]
    WrongKing,

    #[msg("Treasury account does not match config")]
    WrongTreasury,

    #[msg("Jackpot account does not match config")]
    WrongJackpot,
}
