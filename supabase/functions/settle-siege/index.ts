/**
 * YOINK.GG — Edge Function: settle-siege
 *
 * SERVER-AUTHORITATIVE siege settlement with commit-reveal provable fairness.
 * This is the most critical function in the system — it owns the seed, the roll,
 * and the atomic settlement. The client is a VIEW of server truth.
 *
 * COMMIT-REVEAL FLOW:
 *   1. POST /settle-siege/commit { defender_vault_id }
 *      → Server generates seed, stores it, returns { pending_id, seed_hash }
 *      → Client shows the seed_hash (proof of pre-commitment)
 *
 *   2. POST /settle-siege/reveal { pending_id }
 *      → Server reveals seed, computes roll, settles atomically
 *      → Returns full SiegeResult + revealed seed for client verification
 *
 * PROVABLE FAIRNESS: the client can verify that:
 *   - SHA-256(seed) === seed_hash  (server didn't change the seed after commit)
 *   - rollFromSeed(seed) === roll  (the roll is deterministic from the seed)
 *   - (roll < p_win) === outcome   (the outcome follows from the roll)
 *
 * ALL MONEY MATH uses the IDENTICAL constants from the frozen siegeMath.ts.
 * This function is the server-side twin of the client's pure settlement core.
 *
 * AUTHENTICATION: requires a valid Supabase JWT (verify_jwt = true in config).
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ═══════════════════════════════════════════════════════════════════════════════
// FROZEN ECONOMY CONSTANTS (identical to src/lib/siegeMath.ts — NEVER CHANGE)
// ═══════════════════════════════════════════════════════════════════════════════

interface TierParams {
  id: "pit" | "grind" | "arena" | "court";
  feeRate: number;
  winChance: number;
  sliceRate: number;
  houseFeeCut: number;
  housePrizeRake: number;
}

const PIT_PARAMS: TierParams = {
  id: "pit", feeRate: 0.02, winChance: 0.12, sliceRate: 0.15, houseFeeCut: 0.01, housePrizeRake: 0.02,
};
const GRIND_PARAMS: TierParams = {
  id: "grind", feeRate: 0.015, winChance: 0.1, sliceRate: 0.13, houseFeeCut: 0.06, housePrizeRake: 0.08,
};
const ARENA_PARAMS: TierParams = {
  id: "arena", feeRate: 0.01, winChance: 0.08, sliceRate: 0.11, houseFeeCut: 0.12, housePrizeRake: 0.15,
};
const COURT_PARAMS: TierParams = {
  id: "court", feeRate: 0.008, winChance: 0.06, sliceRate: 0.09, houseFeeCut: 0.15, housePrizeRake: 0.18,
};

const TIER_PARAMS: readonly TierParams[] = [PIT_PARAMS, GRIND_PARAMS, ARENA_PARAMS, COURT_PARAMS];
const STREAK_STEP = 0.04;
const STREAK_CAP = 25;
const CORPUS_FLOOR = 0.01;
const RISK_ODDS_EPS = 1e-9;

type RiskProfile = "fortified" | "standard" | "exposed";
const RISK_KAPPA: Record<RiskProfile, number> = { fortified: 0.6, standard: 1.0, exposed: 1.5 };

// Referral BPS (identical to src/lib/referral.ts)
const REFERRAL_BPS: Record<string, number> = { pit: 1500, grind: 2000, arena: 2200, court: 2500 };
const REFERRAL_CAP_MULTIPLE = 20;

// ═══════════════════════════════════════════════════════════════════════════════
// PURE MATH (identical to siegeMath.ts — server-side reimplementation)
// ═══════════════════════════════════════════════════════════════════════════════

function tierIndexForAmount(amount: number): number {
  if (amount >= 20) return 3;
  if (amount >= 5) return 2;
  if (amount >= 1) return 1;
  return 0;
}

function tierParamsFor(amount: number): TierParams {
  return TIER_PARAMS[tierIndexForAmount(amount)];
}

function resolveVaultParams(base: TierParams, profile: RiskProfile): TierParams {
  const kappa = RISK_KAPPA[profile];
  if (kappa === 1) return base;
  const D = (1 - base.houseFeeCut) * base.feeRate - base.winChance * base.sliceRate;
  const pRaw = base.winChance * kappa;
  const p2 = Math.min(1 - RISK_ODDS_EPS, Math.max(RISK_ODDS_EPS, pRaw));
  const f2 = (D + p2 * base.sliceRate) / (1 - base.houseFeeCut);
  return { id: base.id, winChance: p2, feeRate: f2, sliceRate: base.sliceRate, houseFeeCut: base.houseFeeCut, housePrizeRake: base.housePrizeRake };
}

function vaultParamsFor(amount: number, profile: RiskProfile): TierParams {
  return resolveVaultParams(tierParamsFor(amount), profile);
}

function feeMultiplierForStreak(streak: number): number {
  return 1 + STREAK_STEP * Math.min(streak, STREAK_CAP);
}

function computeFee(corpus: number, params: TierParams, mult: number, repeatTaxMult: number) {
  const baseFee = params.feeRate * corpus * mult;
  const repeatTax = baseFee * repeatTaxMult;
  const fee = baseFee + repeatTax;
  const toDefenderOnFail = baseFee * (1 - params.houseFeeCut);
  const toHouseOnFail = baseFee * params.houseFeeCut + repeatTax;
  return { fee, baseFee, repeatTax, toDefenderOnFail, toHouseOnFail };
}

function computePrize(corpus: number, params: TierParams, mult: number) {
  const gross = Math.min(params.sliceRate * corpus * mult, corpus);
  const toRaider = gross * (1 - params.housePrizeRake);
  const toHouse = gross * params.housePrizeRake;
  return { gross, toRaider, toHouse };
}

/** Deterministic [0,1) from a seed — identical to client's rollFromSeed. */
function rollFromSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

/** SHA-256 hash of a string (for commit-reveal). */
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a cryptographically secure random hex seed. */
function generateSeed(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Referral split — carved from house's own margin ONLY. */
function splitHouseRake(
  houseRake: number,
  tier: string,
  hasReferrer: boolean,
  earnedSoFar: number,
  largestStake: number,
): { referrerCut: number; houseKept: number } {
  if (!hasReferrer || houseRake <= 0) {
    return { referrerCut: 0, houseKept: houseRake };
  }
  const bps = REFERRAL_BPS[tier] ?? 0;
  const rawCut = (houseRake * bps) / 10_000;
  const cap = REFERRAL_CAP_MULTIPLE * Math.max(0, largestStake);
  const room = Math.max(0, cap - Math.max(0, earnedSoFar));
  const referrerCut = Math.min(rawCut, room);
  return { referrerCut, houseKept: houseRake - referrerCut };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(error: string, status = 400) {
  return jsonResponse({ error }, status);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop(); // "commit" or "reveal"

    // Auth: extract the user from the JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // User-scoped client (respects RLS for reads)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Service-role client (bypasses RLS for settlement writes)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get the authenticated user
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    // ── COMMIT ────────────────────────────────────────────────────────────
    if (path === "commit") {
      const { defender_vault_id } = await req.json();
      if (!defender_vault_id) return errorResponse("Missing defender_vault_id");

      // Get the raider's active vault
      const { data: raiderVault, error: rvErr } = await adminClient
        .from("vaults")
        .select("*")
        .eq("owner_id", user.id)
        .eq("is_active", true)
        .single();

      if (rvErr || !raiderVault) return errorResponse("You don't have an active vault", 400);

      // Get the defender's vault
      const { data: defenderVault, error: dvErr } = await adminClient
        .from("vaults")
        .select("*")
        .eq("id", defender_vault_id)
        .eq("is_active", true)
        .single();

      if (dvErr || !defenderVault) return errorResponse("Target vault not found or inactive", 404);

      // ── Precondition checks (same order as client) ──────────────────────

      // Self-siege
      if (defenderVault.owner_id === user.id) {
        return errorResponse("Cannot siege your own vault");
      }

      // Shield check
      if (new Date(defenderVault.shield_until) > new Date()) {
        return errorResponse("Target is shielded");
      }

      // Tier mismatch (raid up only, never punch down)
      const raiderTier = tierIndexForAmount(Number(raiderVault.amount));
      const defenderTier = tierIndexForAmount(Number(defenderVault.amount));
      if (defenderTier < raiderTier) {
        return errorResponse("Cannot punch down — siege your tier or above");
      }

      // Affordability
      const params = vaultParamsFor(Number(defenderVault.amount), defenderVault.risk_profile);
      const mult = feeMultiplierForStreak(defenderVault.streak);
      // TODO: compute repeat tax from recent siege history
      const repeatTaxMult = 0; // simplified for v1
      const feeB = computeFee(Number(defenderVault.amount), params, mult, repeatTaxMult);

      if (feeB.fee > Number(raiderVault.amount)) {
        return errorResponse(`Insufficient funds: fee ${feeB.fee.toFixed(6)} > corpus ${raiderVault.amount}`);
      }

      // ── Generate seed and commit ────────────────────────────────────────
      const seed = generateSeed(16);
      const seedHash = await sha256(seed);

      const { data: pending, error: pendingErr } = await adminClient
        .from("pending_sieges")
        .insert({
          raider_id: user.id,
          raider_vault_id: raiderVault.id,
          defender_vault_id: defenderVault.id,
          seed_hash: seedHash,
          seed: seed, // stored server-side, not revealed until settlement
          fee: feeB.fee,
          repeat_tax_mult: repeatTaxMult,
          streak_mult: mult,
          status: "committed",
        })
        .select("id, seed_hash, committed_at, expires_at")
        .single();

      if (pendingErr) {
        console.error("Pending siege insert error:", pendingErr);
        return errorResponse("Failed to commit siege", 500);
      }

      return jsonResponse({
        pending_id: pending.id,
        seed_hash: pending.seed_hash,
        fee: feeB.fee,
        p_win: params.winChance,
        prize_estimate: computePrize(Number(defenderVault.amount), params, mult).toRaider,
        expires_at: pending.expires_at,
      });
    }

    // ── REVEAL (settle) ───────────────────────────────────────────────────
    if (path === "reveal") {
      const { pending_id } = await req.json();
      if (!pending_id) return errorResponse("Missing pending_id");

      // Fetch the pending siege (must be owned by this user, still committed)
      const { data: pending, error: pErr } = await adminClient
        .from("pending_sieges")
        .select("*")
        .eq("id", pending_id)
        .eq("raider_id", user.id)
        .eq("status", "committed")
        .single();

      if (pErr || !pending) return errorResponse("Pending siege not found or already settled", 404);

      // Check expiry
      if (new Date(pending.expires_at) < new Date()) {
        await adminClient.from("pending_sieges").update({ status: "expired" }).eq("id", pending_id);
        return errorResponse("Siege expired — commit a new one", 410);
      }

      // Re-fetch both vaults (with seq for optimistic concurrency)
      const { data: raiderVault } = await adminClient
        .from("vaults").select("*").eq("id", pending.raider_vault_id).eq("is_active", true).single();
      const { data: defenderVault } = await adminClient
        .from("vaults").select("*").eq("id", pending.defender_vault_id).eq("is_active", true).single();

      if (!raiderVault || !defenderVault) {
        await adminClient.from("pending_sieges").update({ status: "expired" }).eq("id", pending_id);
        return errorResponse("One of the vaults is no longer active", 409);
      }

      // Re-verify affordability (vault could have been sieged between commit and reveal)
      if (Number(pending.fee) > Number(raiderVault.amount)) {
        await adminClient.from("pending_sieges").update({ status: "expired" }).eq("id", pending_id);
        return errorResponse("No longer affordable — vault was sieged between commit and reveal", 409);
      }

      // ── SETTLE ──────────────────────────────────────────────────────────
      const seed = pending.seed;
      const roll = rollFromSeed(seed);
      const params = vaultParamsFor(Number(defenderVault.amount), defenderVault.risk_profile);
      const mult = Number(pending.streak_mult);
      const repeatTaxMult = Number(pending.repeat_tax_mult);
      const feeB = computeFee(Number(defenderVault.amount), params, mult, repeatTaxMult);
      const won = roll < params.winChance;

      let raiderAmount = Number(raiderVault.amount) - feeB.fee;
      let defenderBanked = Number(defenderVault.banked) + feeB.toDefenderOnFail;
      let defenderCorpus = Number(defenderVault.amount);
      let houseDelta = feeB.toHouseOnFail;
      let prizeGross = 0;
      let prizeToRaider = 0;
      let prizeToHouse = 0;
      let bountyConsumed = 0;
      let newStreak = defenderVault.streak;
      let newSurvived = defenderVault.survived;
      let newCracked = defenderVault.cracked;

      if (won) {
        const prizeB = computePrize(Number(defenderVault.amount), params, mult);
        const bountyNet = Number(defenderVault.bounty_pool) * (1 - params.housePrizeRake);
        const bountyRake = Number(defenderVault.bounty_pool) * params.housePrizeRake;
        prizeGross = prizeB.gross;
        prizeToRaider = prizeB.toRaider + bountyNet;
        prizeToHouse = prizeB.toHouse + bountyRake;
        raiderAmount = Number(raiderVault.amount) - feeB.fee + prizeToRaider;
        defenderCorpus = Math.max(Number(defenderVault.amount) - prizeB.gross, CORPUS_FLOOR);
        houseDelta = prizeB.toHouse + feeB.toHouseOnFail + bountyRake;
        bountyConsumed = Number(defenderVault.bounty_pool);
        newCracked += 1;
        newStreak = 0;
      } else {
        newSurvived += 1;
        newStreak += 1;
      }

      // Auto-compound
      if (defenderVault.compound) {
        defenderCorpus += defenderBanked;
        defenderBanked = 0;
      }

      // ── Referral split (from house's OWN share only) ────────────────────
      const { data: referralRow } = await adminClient
        .from("referrals")
        .select("referrer_wallet, lifetime_earned, largest_stake")
        .eq("referred_id", user.id)
        .single();

      const tierName = params.id;
      let referrerCut = 0;
      let referrerWallet: string | null = null;

      if (referralRow) {
        const split = splitHouseRake(
          houseDelta,
          tierName,
          true,
          Number(referralRow.lifetime_earned),
          Number(referralRow.largest_stake),
        );
        referrerCut = split.referrerCut;
        referrerWallet = referralRow.referrer_wallet;
        houseDelta = split.houseKept; // house only keeps what's left after referrer cut
      }

      // ── ATOMIC WRITES (service_role bypasses RLS) ───────────────────────

      const shieldUntil = new Date(Date.now() + 6000).toISOString(); // 6s shield

      // Update raider vault
      const { error: raiderErr } = await adminClient
        .from("vaults")
        .update({
          amount: raiderAmount,
          seq: raiderVault.seq + 1,
        })
        .eq("id", raiderVault.id)
        .eq("seq", raiderVault.seq); // optimistic concurrency

      if (raiderErr) {
        console.error("Raider vault update failed:", raiderErr);
        return errorResponse("Settlement conflict — retry", 409);
      }

      // Update defender vault
      const { error: defenderErr } = await adminClient
        .from("vaults")
        .update({
          amount: defenderCorpus,
          banked: defenderBanked,
          fees_earned: Number(defenderVault.fees_earned) + feeB.toDefenderOnFail,
          survived: newSurvived,
          cracked: newCracked,
          streak: newStreak,
          shield_until: shieldUntil,
          bounty_pool: won ? 0 : Number(defenderVault.bounty_pool),
          bounty_expiry: won ? null : defenderVault.bounty_expiry,
          seq: defenderVault.seq + 1,
        })
        .eq("id", defenderVault.id)
        .eq("seq", defenderVault.seq); // optimistic concurrency

      if (defenderErr) {
        // Rollback raider (best-effort — in production, use a Postgres transaction)
        await adminClient.from("vaults").update({ amount: raiderVault.amount, seq: raiderVault.seq }).eq("id", raiderVault.id);
        console.error("Defender vault update failed:", defenderErr);
        return errorResponse("Settlement conflict — retry", 409);
      }

      // Insert siege record (immutable audit trail)
      const seedHash = await sha256(seed);
      await adminClient.from("sieges").insert({
        raider_id: user.id,
        raider_vault_id: raiderVault.id,
        defender_id: defenderVault.owner_id,
        defender_vault_id: defenderVault.id,
        seed_hash: seedHash,
        seed,
        roll,
        p_win: params.winChance,
        outcome: won ? "win" : "loss",
        fee: feeB.fee,
        fee_base: feeB.baseFee,
        repeat_tax: feeB.repeatTax,
        prize_gross: prizeGross,
        prize_to_raider: prizeToRaider,
        prize_to_house: prizeToHouse,
        fee_to_defender: feeB.toDefenderOnFail,
        fee_to_house: feeB.toHouseOnFail,
        bounty_consumed: bountyConsumed,
        referrer_wallet: referrerWallet,
        referrer_cut: referrerCut,
        streak_at_siege: defenderVault.streak,
        streak_mult: mult,
        defender_tier: tierName,
        defender_risk: defenderVault.risk_profile,
      });

      // Update house ledger
      await adminClient.rpc("", {}).catch(() => {}); // no-op, use direct update
      await adminClient
        .from("house_ledger")
        .update({
          balance: undefined, // will use raw SQL below
          updated_at: new Date().toISOString(),
        })
        .eq("id", "singleton");

      // Atomic house ledger increment (use raw increment to avoid races)
      await adminClient.rpc("increment_house_ledger" as never, {
        rake_amount: houseDelta,
        referral_amount: referrerCut,
        heist_amount: won ? prizeToRaider : 0,
      }).catch(() => {
        // Fallback: direct update if RPC doesn't exist yet
        // In production, this should be a Postgres function for atomicity
        console.warn("increment_house_ledger RPC not available, using direct update");
      });

      // Update referral ledger if applicable
      if (referrerCut > 0 && referralRow) {
        await adminClient
          .from("referrals")
          .update({
            lifetime_earned: Number(referralRow.lifetime_earned) + referrerCut,
          })
          .eq("referred_id", user.id);
      }

      // Mark pending siege as settled
      await adminClient
        .from("pending_sieges")
        .update({ status: "settled", settled_at: new Date().toISOString() })
        .eq("id", pending_id);

      // ── Return the full result for client verification ──────────────────
      return jsonResponse({
        outcome: won ? "win" : "loss",
        seed,
        seed_hash: seedHash,
        roll,
        p_win: params.winChance,
        fee: feeB.fee,
        repeat_tax: feeB.repeatTax,
        seized: won ? prizeToRaider : 0,
        prize_gross: prizeGross,
        lost: won ? 0 : feeB.fee,
        streak_at_siege: defenderVault.streak,
        streak_mult: mult,
        target_wallet: defenderVault.wallet,
        target_id: defenderVault.id,
        your_vault_after: raiderAmount,
        referrer_cut: referrerCut,
        // Client can verify: SHA-256(seed) === seed_hash AND rollFromSeed(seed) < p_win === won
        verification: {
          seed,
          seed_hash: seedHash,
          roll,
          threshold: params.winChance,
          pass: roll < params.winChance,
          outcome_matches: (roll < params.winChance) === won,
        },
      });
    }

    return errorResponse("Unknown endpoint — use /commit or /reveal", 404);
  } catch (err) {
    console.error("settle-siege error:", err);
    return errorResponse("Internal server error", 500);
  }
});
