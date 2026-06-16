/**
 * YOINK.GG — Supabase Wallet Wars API adapter
 *
 * This module wraps the server-authoritative Wallet Wars operations behind a
 * clean interface. When SUPABASE_ENABLED is true, the useWalletWars hook calls
 * these functions instead of the local simulation. When false, they return null
 * and the hook falls back to the existing client-side engine.
 *
 * IMPORTANT: the local simulation (useWalletWars) remains the fallback and runs
 * on devnet. This module is the UPGRADE PATH — not a replacement. Both paths
 * coexist, gated by the feature flag.
 */

import { SUPABASE_ENABLED } from "@/lib/featureFlags";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { SiegeVerification } from "@/lib/siegeVerify";
import type { RiskProfile } from "@/lib/siegeMath";

// ── Types matching the server response ────────────────────────────────────────

export interface ServerVault {
  id: string;
  wallet: string;
  amount: number;
  banked: number;
  fees_earned: number;
  survived: number;
  cracked: number;
  streak: number;
  opened_at: string;
  shield_until: string;
  tier: "pit" | "grind" | "arena" | "court";
  risk_profile: RiskProfile;
  bounty_pool: number;
  bounty_expiry: string | null;
  compound: boolean;
  owner_id: string;
  display_name?: string;
  avatar_variant?: number | null;
  avatar_color?: string | null;
}

export interface CommitResponse {
  pending_id: string;
  seed_hash: string;
  fee: number;
  p_win: number;
  prize_estimate: number;
  expires_at: string;
}

export interface RevealResponse {
  outcome: "win" | "loss";
  seed: string;
  seed_hash: string;
  roll: number;
  p_win: number;
  fee: number;
  repeat_tax: number;
  seized: number;
  prize_gross: number;
  lost: number;
  streak_at_siege: number;
  streak_mult: number;
  target_wallet: string;
  target_id: string;
  your_vault_after: number;
  referrer_cut: number;
  verification: SiegeVerification;
}

// ── API Functions ─────────────────────────────────────────────────────────────

const FUNCTIONS_BASE = (): string => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return url ? `${url}/functions/v1` : "";
};

async function authHeaders(): Promise<Record<string, string>> {
  const client = getSupabaseClient();
  if (!client) return {};
  try {
    const { data } = await client.auth.getSession();
    const session = data.session as { access_token: string } | null;
    if (!session) return {};
    return {
      Authorization: `Bearer ${session.access_token}`,
      apikey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "",
      "Content-Type": "application/json",
    };
  } catch {
    return {};
  }
}

/**
 * Fetch the active vault board (all active vaults, sorted by amount DESC).
 * Returns null when Supabase is disabled or on error.
 */
export async function fetchVaultBoard(): Promise<ServerVault[] | null> {
  if (!SUPABASE_ENABLED) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await (client.from("vault_board") as { select: (cols: string) => { order: (col: string, opts: { ascending: boolean }) => Promise<{ data: ServerVault[] | null; error: unknown }> } })
      .select("*")
      .order("amount", { ascending: false });

    if (error) { console.error("[SupabaseWar] Board fetch error:", error); return null; }
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch the current user's active vault. Returns null if they don't have one.
 */
export async function fetchMyVault(userId: string): Promise<ServerVault | null> {
  if (!SUPABASE_ENABLED) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await (client.from("vaults") as { select: (cols: string) => { eq: (col: string, val: unknown) => { eq: (col: string, val: unknown) => { single: () => Promise<{ data: ServerVault | null; error: unknown }> } } } })
      .select("*")
      .eq("owner_id", userId)
      .eq("is_active", true)
      .single();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Open a new vault (server-side). Returns the created vault or null on error.
 */
export async function openVault(
  amount: number,
  riskProfile: RiskProfile,
  wallet: string,
): Promise<ServerVault | null> {
  if (!SUPABASE_ENABLED) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data } = await client.auth.getSession();
    const session = data.session as { user: { id: string } } | null;
    if (!session) return null;

    const { data: vault, error } = await (client.from("vaults") as { insert: (row: unknown) => { select: () => { single: () => Promise<{ data: ServerVault | null; error: unknown }> } } })
      .insert({
        owner_id: session.user.id,
        wallet,
        amount,
        risk_profile: riskProfile,
        compound: false,
      })
      .select()
      .single();

    if (error) { console.error("[SupabaseWar] Open vault error:", error); return null; }
    return vault;
  } catch {
    return null;
  }
}

/**
 * Cash out (close) the user's active vault. Returns the total amount (corpus + banked).
 */
export async function cashOutVault(vaultId: string): Promise<number | null> {
  if (!SUPABASE_ENABLED) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: vault, error: fetchErr } = await (client.from("vaults") as { select: (cols: string) => { eq: (col: string, val: unknown) => { single: () => Promise<{ data: { amount: number; banked: number } | null; error: unknown }> } } })
      .select("amount, banked")
      .eq("id", vaultId)
      .single();

    if (fetchErr || !vault) return null;
    const total = Number(vault.amount) + Number(vault.banked);

    const { error } = await (client.from("vaults") as { update: (row: unknown) => { eq: (col: string, val: unknown) => Promise<{ error: unknown }> } })
      .update({ is_active: false, closed_at: new Date().toISOString(), amount: 0, banked: 0 })
      .eq("id", vaultId);

    if (error) { console.error("[SupabaseWar] Cash out error:", error); return null; }
    return total;
  } catch {
    return null;
  }
}

/**
 * Commit phase of a siege (get the seed_hash pre-commitment).
 */
export async function commitSiege(defenderVaultId: string): Promise<CommitResponse | null> {
  if (!SUPABASE_ENABLED) return null;

  try {
    const headers = await authHeaders();
    if (!headers.Authorization) return null;

    const res = await fetch(`${FUNCTIONS_BASE()}/settle-siege/commit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ defender_vault_id: defenderVaultId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[SupabaseWar] Commit error:", err);
      return null;
    }

    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Reveal phase of a siege (settle and get the full result).
 */
export async function revealSiege(pendingId: string): Promise<RevealResponse | null> {
  if (!SUPABASE_ENABLED) return null;

  try {
    const headers = await authHeaders();
    if (!headers.Authorization) return null;

    const res = await fetch(`${FUNCTIONS_BASE()}/settle-siege/reveal`, {
      method: "POST",
      headers,
      body: JSON.stringify({ pending_id: pendingId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[SupabaseWar] Reveal error:", err);
      return null;
    }

    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Set referral attribution (one-time, first-referrer-wins).
 */
export async function setReferralAttribution(
  referrerCode: string,
  referrerWallet: string,
): Promise<boolean> {
  if (!SUPABASE_ENABLED) return false;
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { data } = await client.auth.getSession();
    const session = data.session as { user: { id: string; user_metadata: { wallet: string } } } | null;
    if (!session) return false;

    const { error } = await (client.from("referrals") as { insert: (row: unknown) => Promise<{ error: unknown }> })
      .insert({
        referred_id: session.user.id,
        referred_wallet: session.user.user_metadata.wallet,
        referrer_wallet: referrerWallet,
        referrer_code: referrerCode,
        // referrer_id will be resolved by a trigger or the Edge Function
      });

    // Unique constraint on referred_id means this silently fails for existing attributions
    return !error;
  } catch {
    return false;
  }
}

/**
 * Fetch recent siege history (for the war feed).
 */
export async function fetchRecentSieges(limit = 40): Promise<unknown[] | null> {
  if (!SUPABASE_ENABLED) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await (client.from("sieges") as { select: (cols: string) => { order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> } } })
      .select("*")
      .order("settled_at", { ascending: false })
      .limit(limit);

    if (error) return null;
    return data;
  } catch {
    return null;
  }
}
