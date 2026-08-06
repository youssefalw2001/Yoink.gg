//! YOINK.GG — Wallet Wars on-chain economy (pure integer arithmetic).
//!
//! ## Why this module exists, separately from `lib.rs`
//!
//! The previous on-chain program implemented a **completely different game** from
//! the one the app advertises: fixed 50/50 odds, matched stakes, and a flat 15%
//! rake. The client shows tiered odds (12/10/8/7%), fee-only asymmetric risk, a
//! defender toll banked on every attempt, a survival-streak multiplier, and a
//! ~6.5% rake. Deploying that program would have meant a player reading "12%
//! crack chance, you only risk the fee" on screen while the chain took a matched
//! stake at 50/50 — which, for a licensed operator, is the kind of mismatch that
//! costs the licence rather than earning a bug report.
//!
//! This module is the corrected economy, and it deliberately has **zero
//! dependencies** — no `anchor_lang`, no Solana types. That means it compiles and
//! its tests run with plain `rustc --test`, so the money math is verifiable
//! without the Solana BPF toolchain. `lib.rs` is a thin transport layer over it.
//!
//! ## Integers, not floats
//!
//! `siegeMath.ts` is written in `f64`. On-chain we must be deterministic and
//! overflow-safe, so every rate is an integer:
//!
//! | quantity                          | unit  | scale |
//! |-----------------------------------|-------|-------|
//! | fee / slice / rake / cut          | bps   | 1e4   |
//! | crack chance (`p`)                | ppm   | 1e6   |
//! | effective fee after a risk profile| ppb   | 1e9   |
//!
//! Every **base** rate in the v2 economy is exactly representable in bps, and
//! every effective `p` is exactly representable in ppm (verified by the
//! `serverEconomyParity`-style guard on the TS side). Only the risk-profile
//! effective fee `f'` needs finer precision, because it comes from a division —
//! it is stored pre-computed in ppb, accurate to <1 part per billion.
//!
//! ## Conservation is structural, not asserted
//!
//! Every split computes ONE side and derives the other as the remainder
//! (`house = total - other`). Integer division can therefore never leak or mint a
//! lamport, regardless of rounding. That property is unit-tested below rather
//! than assumed.

#![allow(clippy::unreadable_literal)]

// ── Scales ──────────────────────────────────────────────────────────────────

pub const BPS: u128 = 10_000;
pub const PPM: u128 = 1_000_000;
pub const PPB: u128 = 1_000_000_000;

pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

// ── Streak ramp (mirrors STREAK_CFG in siegeMath.ts) ────────────────────────

/// Multiplier gained per survived siege, in bps (0.04 → 400).
pub const STREAK_STEP_BPS: u128 = 400;
/// Maximum streak counted, so the multiplier caps at 1 + 0.04*25 = 2.00x.
pub const STREAK_CAP: u32 = 25;

// ── Tier ladder ─────────────────────────────────────────────────────────────

/// Corpus floors in lamports: Pit 0.1, Grind 1, Arena 5, Court 20 SOL.
pub const TIER_FLOORS: [u64; 4] = [
    LAMPORTS_PER_SOL / 10,
    LAMPORTS_PER_SOL,
    5 * LAMPORTS_PER_SOL,
    20 * LAMPORTS_PER_SOL,
];

/// Rates that a risk profile does NOT change (carried through from the base tier).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TierRates {
    /// `s` — prize slice as a fraction of the corpus, in bps.
    pub slice_bps: u128,
    /// `rho_fee` — house cut of the base attempt fee, in bps.
    pub house_fee_cut_bps: u128,
    /// `rho_prize` — house rake on the gross prize slice, in bps.
    pub house_prize_rake_bps: u128,
}

/// v2 "sane hold" economy. MUST match `TIER_PARAMS` in `src/lib/siegeMath.ts`.
pub const TIER_RATES: [TierRates; 4] = [
    // pit:   s=15.50%  rho_fee=1.90%  rho_prize=5%
    TierRates { slice_bps: 1550, house_fee_cut_bps: 190, house_prize_rake_bps: 500 },
    // grind: s=14.20%  rho_fee=1.80%  rho_prize=5%
    TierRates { slice_bps: 1420, house_fee_cut_bps: 180, house_prize_rake_bps: 500 },
    // arena: s=12.00%  rho_fee=1.70%  rho_prize=5%
    TierRates { slice_bps: 1200, house_fee_cut_bps: 170, house_prize_rake_bps: 500 },
    // court: s=11.00%  rho_fee=1.10%  rho_prize=5%
    TierRates { slice_bps: 1100, house_fee_cut_bps: 110, house_prize_rake_bps: 500 },
];

// ── Risk profiles (Variable-Risk Vaults) ────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RiskProfile {
    Fortified = 0,
    Standard = 1,
    Exposed = 2,
}

impl RiskProfile {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(RiskProfile::Fortified),
            1 => Some(RiskProfile::Standard),
            2 => Some(RiskProfile::Exposed),
            _ => None,
        }
    }
}

/// The published, effective parameters for one (tier x profile) pair.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EffParams {
    /// `p'` — crack chance in ppm. Exact for every published combination.
    pub p_ppm: u128,
    /// `f'` — attempt fee as a fraction of the corpus, in ppb.
    pub f_ppb: u128,
}

/// Effective params, indexed `[tier][profile]`.
///
/// A risk profile scales the odds by kappa (0.6 / 1.0 / 1.5) and re-prices the fee
/// so the DEFENDER's expected value is held exactly constant:
///
/// ```text
///   D  = (1 - rho_fee)*f - p*s          (defender EV at the base tier)
///   p' = p * kappa
///   f' = (D + p'*s) / (1 - rho_fee)
/// ```
///
/// `f'` involves a division, so it is pre-computed here rather than derived
/// on-chain: doing the division in integer math would either lose precision or
/// require a rounding convention that the TypeScript client would also have to
/// reproduce bit-for-bit. Pre-computing makes the chain and the client agree by
/// construction, and the TS-side parity guard asserts these exact numbers.
///
/// Standard (kappa = 1.0) is the algebraic identity of the base tier, so its
/// `f_ppb` is exactly the base `feeRate` and its `p_ppm` the base `winChance`.
pub const EFF: [[EffParams; 3]; 4] = [
    // ── The Pit (base p=12.0%, f=2.00%) ──
    [
        EffParams { p_ppm: 72_000,  f_ppb: 12_415_902 }, // fortified
        EffParams { p_ppm: 120_000, f_ppb: 20_000_000 }, // standard  (identity)
        EffParams { p_ppm: 180_000, f_ppb: 29_480_122 }, // exposed
    ],
    // ── The Grind (base p=10.0%, f=1.50%) ──
    [
        EffParams { p_ppm: 60_000,  f_ppb: 9_215_886 },
        EffParams { p_ppm: 100_000, f_ppb: 15_000_000 },
        EffParams { p_ppm: 150_000, f_ppb: 22_230_143 },
    ],
    // ── The Arena (base p=8.0%, f=1.00%) ──
    [
        EffParams { p_ppm: 48_000,  f_ppb: 6_093_591 },
        EffParams { p_ppm: 80_000,  f_ppb: 10_000_000 },
        EffParams { p_ppm: 120_000, f_ppb: 14_883_011 },
    ],
    // ── King's Court (base p=7.0%, f=0.80%) ──
    [
        EffParams { p_ppm: 42_000,  f_ppb: 4_885_743 },
        EffParams { p_ppm: 70_000,  f_ppb: 8_000_000 },
        EffParams { p_ppm: 105_000, f_ppb: 11_892_821 },
    ],
];

// ── Pure helpers ────────────────────────────────────────────────────────────

/// Tier index for a corpus, matching `tierIndexForAmount` in the client:
/// top-down, inclusive on the floor. Total for all inputs.
pub fn tier_index(lamports: u64) -> usize {
    let mut t = 0usize;
    for (i, floor) in TIER_FLOORS.iter().enumerate() {
        if lamports >= *floor {
            t = i;
        }
    }
    t
}

/// `m_k = 1 + step * min(streak, cap)`, in bps. Range [10_000, 20_000].
pub fn streak_mult_bps(streak: u32) -> u128 {
    BPS + STREAK_STEP_BPS * (streak.min(STREAK_CAP) as u128)
}

/// Effective params for a corpus + profile.
pub fn eff_params(lamports: u64, profile: RiskProfile) -> EffParams {
    EFF[tier_index(lamports)][profile as usize]
}

/// Rates carried through from the base tier for a corpus.
pub fn tier_rates(lamports: u64) -> TierRates {
    TIER_RATES[tier_index(lamports)]
}

/// Per-attempt fee decomposition, in lamports.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FeeSplit {
    /// `f' * V * m_k` — what the raider pays.
    pub fee: u64,
    /// The defender's banked toll. Paid on EVERY settled attempt, win or lose.
    pub to_defender: u64,
    /// The house's cut of the fee. Derived as the remainder → exact conservation.
    pub to_house: u64,
}

/// Compute the attempt fee and its split.
///
/// `fee = amount * f_ppb * mult_bps / (PPB * BPS)` in one `u128` expression so
/// only a single truncation occurs, rather than compounding two.
pub fn compute_fee(amount: u64, f_ppb: u128, mult_bps: u128, house_fee_cut_bps: u128) -> FeeSplit {
    let fee_u128 = (amount as u128)
        .saturating_mul(f_ppb)
        .saturating_mul(mult_bps)
        / (PPB * BPS);
    let fee = fee_u128.min(u64::MAX as u128) as u64;

    // Defender side first, house as the remainder: integer division can then
    // never leak or mint a lamport.
    let to_defender = ((fee as u128) * (BPS - house_fee_cut_bps) / BPS) as u64;
    let to_house = fee - to_defender;

    FeeSplit { fee, to_defender, to_house }
}

/// Prize decomposition on a successful crack, in lamports.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PrizeSplit {
    /// `min(s * V * m_k, V)` — the slice that leaves the corpus.
    pub gross: u64,
    /// Net to the raider.
    pub to_raider: u64,
    /// House rake on the slice. Remainder → exact conservation.
    pub to_house: u64,
}

/// Compute the prize slice and its split. The slice is clamped to the corpus so
/// a high streak can never pay out more than the vault holds.
pub fn compute_prize(amount: u64, slice_bps: u128, mult_bps: u128, house_prize_rake_bps: u128) -> PrizeSplit {
    let gross_u128 = (amount as u128)
        .saturating_mul(slice_bps)
        .saturating_mul(mult_bps)
        / (BPS * BPS);
    let gross = gross_u128.min(amount as u128) as u64;

    let to_raider = ((gross as u128) * (BPS - house_prize_rake_bps) / BPS) as u64;
    let to_house = gross - to_raider;

    PrizeSplit { gross, to_raider, to_house }
}

/// The crack test. `roll_ppm` must be in `[0, PPM)`.
///
/// Strictly `<`, matching the client's `roll < pWin`, so the published percentage
/// is the exact long-run frequency.
pub fn is_crack(roll_ppm: u128, p_ppm: u128) -> bool {
    roll_ppm < p_ppm
}

/// Reduce raw VRF bytes to a roll in `[0, PPM)`.
///
/// NOTE ON MODULO BIAS: `u64 % 1_000_000` is biased, but the bias is bounded by
/// `1e6 / 2^64 ~= 5.4e-14` relative — around one part in 18 trillion. That is far
/// below any measurable effect on a published 7-12% crack chance, and vastly
/// smaller than the rounding already present in the fee. Documented rather than
/// hidden, since "provably fair" invites exactly this scrutiny.
pub fn roll_from_vrf(value: &[u8; 32]) -> u128 {
    let mut buf = [0u8; 8];
    buf.copy_from_slice(&value[0..8]);
    (u64::from_le_bytes(buf) as u128) % PPM
}

// ════════════════════════════════════════════════════════════════════════════
// TESTS — run with:  rustc --test economy.rs -o /tmp/econ && /tmp/econ
// (No anchor / Solana toolchain required.)
// ════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    const SOL: u64 = LAMPORTS_PER_SOL;

    // ── Tier ladder ─────────────────────────────────────────────────────────

    #[test]
    fn tier_boundaries_are_inclusive_on_the_floor() {
        assert_eq!(tier_index(0), 0);
        assert_eq!(tier_index(SOL / 10 - 1), 0);
        assert_eq!(tier_index(SOL / 10), 0);
        assert_eq!(tier_index(SOL - 1), 0);
        assert_eq!(tier_index(SOL), 1); // 1 SOL → Grind
        assert_eq!(tier_index(5 * SOL - 1), 1);
        assert_eq!(tier_index(5 * SOL), 2); // 5 SOL → Arena
        assert_eq!(tier_index(20 * SOL - 1), 2);
        assert_eq!(tier_index(20 * SOL), 3); // 20 SOL → Court
        assert_eq!(tier_index(u64::MAX), 3);
    }

    // ── Streak ramp ─────────────────────────────────────────────────────────

    #[test]
    fn streak_multiplier_is_bounded_and_monotonic() {
        assert_eq!(streak_mult_bps(0), 10_000); // 1.00x
        assert_eq!(streak_mult_bps(1), 10_400);
        assert_eq!(streak_mult_bps(25), 20_000); // 2.00x cap
        // Past the cap must not keep growing.
        assert_eq!(streak_mult_bps(26), 20_000);
        assert_eq!(streak_mult_bps(u32::MAX), 20_000);

        let mut prev = 0u128;
        for s in 0..60u32 {
            let m = streak_mult_bps(s);
            assert!(m >= prev, "not monotonic at {s}");
            assert!((10_000..=20_000).contains(&m), "out of range at {s}");
            prev = m;
        }
    }

    #[test]
    fn slice_at_max_streak_never_exceeds_the_corpus() {
        // s * m_max must stay <= 1, else computePrize's clamp would be doing
        // real work and the published slice would be a lie at high streaks.
        for r in TIER_RATES.iter() {
            assert!(r.slice_bps * 20_000 / BPS <= BPS, "slice overflows corpus: {r:?}");
        }
    }

    // ── The published table ─────────────────────────────────────────────────

    #[test]
    fn standard_profile_is_the_base_identity() {
        // kappa = 1.0, so Standard must be exactly the base tier: p in ppm and
        // f in ppb both land on round numbers.
        assert_eq!(EFF[0][RiskProfile::Standard as usize], EffParams { p_ppm: 120_000, f_ppb: 20_000_000 });
        assert_eq!(EFF[1][RiskProfile::Standard as usize], EffParams { p_ppm: 100_000, f_ppb: 15_000_000 });
        assert_eq!(EFF[2][RiskProfile::Standard as usize], EffParams { p_ppm: 80_000,  f_ppb: 10_000_000 });
        assert_eq!(EFF[3][RiskProfile::Standard as usize], EffParams { p_ppm: 70_000,  f_ppb: 8_000_000 });
    }

    #[test]
    fn odds_scale_by_kappa_exactly() {
        // Fortified = 0.6x, Exposed = 1.5x of the base, with no rounding drift.
        for t in 0..4 {
            let base = EFF[t][RiskProfile::Standard as usize].p_ppm;
            assert_eq!(EFF[t][RiskProfile::Fortified as usize].p_ppm, base * 6 / 10, "tier {t}");
            assert_eq!(EFF[t][RiskProfile::Exposed as usize].p_ppm, base * 15 / 10, "tier {t}");
        }
    }

    #[test]
    fn every_published_chance_is_a_sane_probability() {
        for t in 0..4 {
            for p in 0..3 {
                let e = EFF[t][p];
                assert!(e.p_ppm > 0 && e.p_ppm < PPM, "p out of range at [{t}][{p}]");
                assert!(e.f_ppb > 0, "fee must be positive at [{t}][{p}]");
            }
        }
    }

    #[test]
    fn riskier_profiles_cost_more_per_attempt() {
        // Defender EV is held constant, so better odds must be paid for.
        for t in 0..4 {
            let f = EFF[t][RiskProfile::Fortified as usize].f_ppb;
            let s = EFF[t][RiskProfile::Standard as usize].f_ppb;
            let x = EFF[t][RiskProfile::Exposed as usize].f_ppb;
            assert!(f < s && s < x, "fee not monotonic in risk at tier {t}");
        }
    }

    #[test]
    fn risk_profile_round_trips_from_u8() {
        assert_eq!(RiskProfile::from_u8(0), Some(RiskProfile::Fortified));
        assert_eq!(RiskProfile::from_u8(1), Some(RiskProfile::Standard));
        assert_eq!(RiskProfile::from_u8(2), Some(RiskProfile::Exposed));
        // An unknown discriminant must be REJECTED, never defaulted — silently
        // coercing to Standard would settle at odds nobody published.
        assert_eq!(RiskProfile::from_u8(3), None);
        assert_eq!(RiskProfile::from_u8(255), None);
    }

    // ── Conservation (the property that matters most) ────────────────────────

    #[test]
    fn fee_split_conserves_exactly() {
        for amount in [TIER_FLOORS[0], SOL, 3 * SOL, 7 * SOL, 50 * SOL, 1000 * SOL] {
            for prof in [RiskProfile::Fortified, RiskProfile::Standard, RiskProfile::Exposed] {
                for streak in [0u32, 1, 7, 25, 99] {
                    let e = eff_params(amount, prof);
                    let r = tier_rates(amount);
                    let f = compute_fee(amount, e.f_ppb, streak_mult_bps(streak), r.house_fee_cut_bps);
                    assert_eq!(
                        f.to_defender + f.to_house, f.fee,
                        "fee leak at {amount} {prof:?} streak {streak}: {f:?}",
                    );
                }
            }
        }
    }

    #[test]
    fn prize_split_conserves_exactly_and_is_clamped() {
        for amount in [TIER_FLOORS[0], SOL, 9 * SOL, 40 * SOL, 5000 * SOL] {
            let r = tier_rates(amount);
            for streak in [0u32, 13, 25, 1000] {
                let p = compute_prize(amount, r.slice_bps, streak_mult_bps(streak), r.house_prize_rake_bps);
                assert_eq!(p.to_raider + p.to_house, p.gross, "prize leak at {amount}: {p:?}");
                assert!(p.gross <= amount, "slice exceeded corpus at {amount}: {p:?}");
            }
        }
    }

    #[test]
    fn the_house_is_never_shortchanged_by_rounding() {
        // `to_house` is the remainder, so a dust amount rounds in the house's
        // favour rather than minting lamports. Assert it is never negative-ish
        // (i.e. the defender never receives more than the whole fee).
        for amount in [1u64, 2, 999, TIER_FLOORS[0], SOL] {
            let e = eff_params(amount, RiskProfile::Standard);
            let r = tier_rates(amount);
            let f = compute_fee(amount, e.f_ppb, streak_mult_bps(0), r.house_fee_cut_bps);
            assert!(f.to_defender <= f.fee, "defender over-paid at {amount}: {f:?}");
        }
    }

    // ── Overflow safety ─────────────────────────────────────────────────────

    #[test]
    fn extreme_amounts_do_not_panic_or_overflow() {
        // A u64::MAX corpus is not reachable in practice, but an arithmetic
        // panic in a settlement instruction would lock funds, so the math must
        // saturate rather than wrap.
        for amount in [u64::MAX, u64::MAX / 2, u64::MAX / 3] {
            let e = eff_params(amount, RiskProfile::Exposed);
            let r = tier_rates(amount);
            let f = compute_fee(amount, e.f_ppb, streak_mult_bps(25), r.house_fee_cut_bps);
            assert_eq!(f.to_defender + f.to_house, f.fee);
            let p = compute_prize(amount, r.slice_bps, streak_mult_bps(25), r.house_prize_rake_bps);
            assert_eq!(p.to_raider + p.to_house, p.gross);
            assert!(p.gross <= amount);
        }
    }

    #[test]
    fn zero_amount_is_harmless() {
        let f = compute_fee(0, 20_000_000, 10_000, 190);
        assert_eq!(f, FeeSplit { fee: 0, to_defender: 0, to_house: 0 });
        let p = compute_prize(0, 1550, 10_000, 500);
        assert_eq!(p, PrizeSplit { gross: 0, to_raider: 0, to_house: 0 });
    }

    // ── Worked examples (cross-checked against siegeMath.ts) ────────────────

    #[test]
    fn worked_example_pit_half_sol_standard() {
        // 0.5 SOL is genuinely inside The Pit (floor 0.1, next floor 1.0).
        //
        // NOTE: the client's "Worked Example B" is labelled "1 SOL vault (Pit
        // on-ramp)" but passes PIT_PARAMS explicitly rather than deriving from
        // the amount — 1 SOL actually resolves to Grind, since tier floors are
        // inclusive (`tierParamsFor(1).id === "grind"`). Deriving from the amount
        // here, as the chain must, so the boundary semantics are pinned.
        let v = SOL / 2;
        assert_eq!(tier_index(v), 0, "0.5 SOL must be Pit");

        let e = eff_params(v, RiskProfile::Standard);
        let r = tier_rates(v);
        assert_eq!(e.p_ppm, 120_000); // 12% published

        let f = compute_fee(v, e.f_ppb, streak_mult_bps(0), r.house_fee_cut_bps);
        assert_eq!(f.fee, 10_000_000);         // 0.02 * 0.5 = 0.01 SOL
        assert_eq!(f.to_defender, 9_810_000);  // x (1 - 0.019)
        assert_eq!(f.to_house, 190_000);

        let p = compute_prize(v, r.slice_bps, streak_mult_bps(0), r.house_prize_rake_bps);
        assert_eq!(p.gross, 77_500_000);       // 0.155 * 0.5
        assert_eq!(p.to_raider, 73_625_000);   // x (1 - 0.05)
        assert_eq!(p.to_house, 3_875_000);
    }

    #[test]
    fn worked_example_grind_one_sol_standard() {
        // Exactly 1 SOL — the Grind floor. Guards the off-by-one that my own
        // first draft of the test above got wrong.
        let v = SOL;
        assert_eq!(tier_index(v), 1, "1 SOL must be Grind, floors are inclusive");

        let e = eff_params(v, RiskProfile::Standard);
        let r = tier_rates(v);
        assert_eq!(e.p_ppm, 100_000); // 10% published

        let f = compute_fee(v, e.f_ppb, streak_mult_bps(0), r.house_fee_cut_bps);
        assert_eq!(f.fee, 15_000_000);         // 0.015 SOL
        assert_eq!(f.to_defender, 14_730_000); // x (1 - 0.018)
        assert_eq!(f.to_house, 270_000);

        let p = compute_prize(v, r.slice_bps, streak_mult_bps(0), r.house_prize_rake_bps);
        assert_eq!(p.gross, 142_000_000);      // 0.142
        assert_eq!(p.to_raider, 134_900_000);  // x (1 - 0.05)
        assert_eq!(p.to_house, 7_100_000);
    }

    #[test]
    fn worked_example_court_twenty_sol_standard() {
        // Client: V=20 SOL, Court/Standard → fee 0.16, toll 0.15824,
        // house 0.00176; prize gross 2.2, raider 2.09, house 0.11.
        let v = 20 * SOL;
        let e = eff_params(v, RiskProfile::Standard);
        let r = tier_rates(v);
        assert_eq!(e.p_ppm, 70_000); // 7% published

        let f = compute_fee(v, e.f_ppb, streak_mult_bps(0), r.house_fee_cut_bps);
        assert_eq!(f.fee, 160_000_000);
        assert_eq!(f.to_defender, 158_240_000);
        assert_eq!(f.to_house, 1_760_000);

        let p = compute_prize(v, r.slice_bps, streak_mult_bps(0), r.house_prize_rake_bps);
        assert_eq!(p.gross, 2_200_000_000);
        assert_eq!(p.to_raider, 2_090_000_000);
        assert_eq!(p.to_house, 110_000_000);
    }

    #[test]
    fn streak_scales_fee_and_slice_together() {
        // Both f and s scale by m_k, so the raider's hold-per-wager is invariant
        // to streak — the streak makes a vault more valuable, not worse odds.
        let v = 2 * SOL;
        let e = eff_params(v, RiskProfile::Standard);
        let r = tier_rates(v);

        let f0 = compute_fee(v, e.f_ppb, streak_mult_bps(0), r.house_fee_cut_bps);
        let p0 = compute_prize(v, r.slice_bps, streak_mult_bps(0), r.house_prize_rake_bps);
        let f25 = compute_fee(v, e.f_ppb, streak_mult_bps(25), r.house_fee_cut_bps);
        let p25 = compute_prize(v, r.slice_bps, streak_mult_bps(25), r.house_prize_rake_bps);

        assert_eq!(f25.fee, f0.fee * 2);
        assert_eq!(p25.gross, p0.gross * 2);
    }

    // ── The crack test ──────────────────────────────────────────────────────

    #[test]
    fn crack_test_is_strictly_less_than() {
        assert!(is_crack(0, 120_000));
        assert!(is_crack(119_999, 120_000));
        assert!(!is_crack(120_000, 120_000)); // boundary excluded
        assert!(!is_crack(999_999, 120_000));
    }

    #[test]
    fn crack_frequency_matches_the_published_odds() {
        // Sweep the whole roll space: exactly p_ppm of 1e6 values must crack, so
        // the published percentage IS the long-run frequency.
        for t in 0..4 {
            for prof in 0..3 {
                let p = EFF[t][prof].p_ppm;
                let cracks = (0..PPM).filter(|&r| is_crack(r, p)).count() as u128;
                assert_eq!(cracks, p, "frequency mismatch at [{t}][{prof}]");
            }
        }
    }

    #[test]
    fn vrf_roll_stays_inside_the_probability_space() {
        // Any 32 bytes must reduce into [0, PPM).
        for pattern in [0u8, 1, 0x7f, 0xff] {
            let bytes = [pattern; 32];
            let roll = roll_from_vrf(&bytes);
            assert!(roll < PPM, "roll {roll} out of range for pattern {pattern}");
        }
        // A known vector, so a refactor that changes byte order is caught.
        let mut v = [0u8; 32];
        v[0..8].copy_from_slice(&1_234_567_890u64.to_le_bytes());
        assert_eq!(roll_from_vrf(&v), 1_234_567_890u128 % PPM);
    }

    // ── Economic invariants (the same ones the client asserts) ───────────────

    #[test]
    fn raider_is_negative_ev_and_defender_is_positive_ev() {
        // Scaled integer EV per attempt, per 1e12 of corpus:
        //   raider   = p*s*(1-rho_prize) - f
        //   defender = (1-rho_fee)*f     - p*s
        //   house    = rho_fee*f + p*rho_prize*s
        for t in 0..4 {
            for prof in 0..3 {
                let e = EFF[t][prof];
                let r = TIER_RATES[t];
                let scale = 1_000_000_000_000i128; // 1e12

                let f = (e.f_ppb as i128) * scale / (PPB as i128);
                let ps = (e.p_ppm as i128) * (r.slice_bps as i128) * scale / ((PPM * BPS) as i128);
                let raider = ps * ((BPS - r.house_prize_rake_bps) as i128) / (BPS as i128) - f;
                let defender = f * ((BPS - r.house_fee_cut_bps) as i128) / (BPS as i128) - ps;
                let house = f * (r.house_fee_cut_bps as i128) / (BPS as i128)
                    + ps * (r.house_prize_rake_bps as i128) / (BPS as i128);

                assert!(raider < 0, "raider EV must be negative at [{t}][{prof}]: {raider}");
                assert!(defender > 0, "defender EV must be positive at [{t}][{prof}]: {defender}");
                assert!(house > 0, "house EV must be positive at [{t}][{prof}]: {house}");
            }
        }
    }

    #[test]
    fn hold_on_amount_risked_stays_in_the_defensible_band() {
        // The v2 rebalance exists because King's Court held 44.7% of every
        // wager. This is the on-chain half of that guarantee: the hold a raider
        // actually faces must stay inside 4%-16% for every published combination.
        for t in 0..4 {
            for prof in 0..3 {
                let e = EFF[t][prof];
                let r = TIER_RATES[t];
                // hold = 1 - p*s*(1-rho_prize)/f, in bps.
                let payout_ppb = (e.p_ppm as u128) * (r.slice_bps as u128)
                    * ((BPS - r.house_prize_rake_bps) as u128) * PPB
                    / (PPM * BPS * BPS);
                let hold_bps = BPS.saturating_sub(payout_ppb * BPS / e.f_ppb);
                assert!(
                    (400..=1600).contains(&hold_bps),
                    "hold {hold_bps}bps out of band at [{t}][{prof}]",
                );
            }
        }
    }
}
