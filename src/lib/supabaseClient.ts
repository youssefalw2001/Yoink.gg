/**
 * YOINK.GG — Supabase client adapter
 *
 * Single Supabase client instance for the app, configured from env vars.
 * Feature-gated behind VITE_SUPABASE_ENABLED — when false, all exports
 * return null/no-ops so the app falls back to the local simulation.
 *
 * AUTH FLOW: the client doesn't use Supabase's built-in email/password auth
 * directly. Instead, it calls the wallet-auth Edge Function which issues a
 * JWT after verifying a Solana signature. The JWT is then set on this client
 * for all subsequent authenticated requests.
 */

import { SUPABASE_ENABLED } from "@/lib/featureFlags";

// ── Types (avoid importing @supabase/supabase-js at the top level when disabled) ─

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  user: { id: string; wallet: string };
}

export interface SupabaseClientInstance {
  from: (table: string) => unknown;
  channel: (name: string) => unknown;
  functions: { invoke: (name: string, options?: unknown) => Promise<unknown> };
  auth: { getSession: () => Promise<{ data: { session: unknown } }> };
  setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<unknown>;
}

// ── Lazy singleton ────────────────────────────────────────────────────────────

let _client: SupabaseClientInstance | null = null;
let _createClient: ((url: string, key: string, opts?: unknown) => SupabaseClientInstance) | null = null;

/**
 * Get the Supabase client instance (lazy-initialized).
 * Returns null when SUPABASE_ENABLED is false.
 */
export function getSupabaseClient(): SupabaseClientInstance | null {
  if (!SUPABASE_ENABLED) return null;
  if (_client) return _client;

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!url || !key) {
    console.warn("[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set — falling back to sim");
    return null;
  }

  // Dynamic import to avoid bundling @supabase/supabase-js when disabled
  // This is set up by the async init below
  if (!_createClient) return null;

  _client = _createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storageKey: "yoink_supabase_auth",
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

  return _client;
}

/**
 * Initialize the Supabase client (call once at app startup).
 * This async function dynamically imports @supabase/supabase-js only when enabled.
 */
export async function initSupabase(): Promise<SupabaseClientInstance | null> {
  if (!SUPABASE_ENABLED) return null;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    _createClient = createClient as unknown as typeof _createClient;
    return getSupabaseClient();
  } catch (err) {
    console.error("[Supabase] Failed to initialize:", err);
    return null;
  }
}

// ── Wallet Auth helpers ───────────────────────────────────────────────────────

const FUNCTIONS_BASE = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : "";

/**
 * Request a sign-in challenge for a wallet.
 * The wallet owner must sign this message to prove ownership.
 */
export async function requestChallenge(wallet: string): Promise<{ challenge: string; expiresAt: number } | null> {
  if (!SUPABASE_ENABLED || !FUNCTIONS_BASE) return null;

  try {
    const res = await fetch(`${FUNCTIONS_BASE}/wallet-auth?wallet=${encodeURIComponent(wallet)}`, {
      headers: { apikey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Submit a signed challenge to get a Supabase JWT.
 * On success, sets the session on the Supabase client.
 */
export async function submitSignature(
  wallet: string,
  signature: string,
  challenge: string,
): Promise<SupabaseSession | null> {
  if (!SUPABASE_ENABLED || !FUNCTIONS_BASE) return null;

  try {
    const res = await fetch(`${FUNCTIONS_BASE}/wallet-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "",
      },
      body: JSON.stringify({ wallet, signature, challenge }),
    });

    if (!res.ok) return null;
    const session: SupabaseSession = await res.json();

    // Set the session on the Supabase client
    const client = getSupabaseClient();
    if (client) {
      await client.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Get the stored session (if any). Returns null when not authenticated.
 */
export async function getStoredSession(): Promise<SupabaseSession | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data } = await client.auth.getSession();
    if (!data.session) return null;
    const session = data.session as { access_token: string; refresh_token: string; user: { id: string; user_metadata: { wallet: string } } };
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: { id: session.user.id, wallet: session.user.user_metadata.wallet },
    };
  } catch {
    return null;
  }
}
