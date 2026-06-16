/**
 * YOINK.GG — Edge Function: telegram-auth
 *
 * Validates Telegram Mini App initData (HMAC-SHA256 against the bot token)
 * and issues a Supabase JWT. This is the Telegram-native alternative to the
 * wallet-auth signature challenge — it proves the user opened the app from
 * Telegram and gives us their Telegram user ID.
 *
 * FLOW:
 *   POST /telegram-auth { initData, wallet? }
 *     → Validates HMAC against bot token (proves Telegram origin)
 *     → Creates/finds the user by Telegram ID
 *     → If `wallet` is provided, links the Telegram identity to a Solana wallet
 *     → Returns { access_token, refresh_token, user }
 *
 * This allows Telegram users to enter the app instantly (view the board, browse)
 * and then link their Solana wallet later for actual gameplay.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ── HMAC Validation ───────────────────────────────────────────────────────────

/**
 * Validate Telegram initData HMAC-SHA256.
 * See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
async function validateInitData(initData: string, botToken: string): Promise<boolean> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return false;

    // Remove hash from the data, sort alphabetically
    params.delete("hash");
    const entries = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

    // HMAC-SHA256(secret_key, data_check_string) where
    // secret_key = HMAC-SHA256("WebAppData", bot_token)
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const secretHash = await crypto.subtle.sign("HMAC", secretKey, encoder.encode(botToken));

    const key = await crypto.subtle.importKey(
      "raw",
      secretHash,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(dataCheckString));

    const computedHash = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedHash === hash;
  } catch {
    return false;
  }
}

/** Parse the `user` JSON from initData. */
function parseUser(initData: string): { id: number; first_name: string; username?: string } | null {
  try {
    const params = new URLSearchParams(initData);
    const userJson = params.get("user");
    if (!userJson) return null;
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

/** Parse the start_param (for referral deep links). */
function parseStartParam(initData: string): string | null {
  try {
    const params = new URLSearchParams(initData);
    return params.get("start_param") ?? null;
  } catch {
    return null;
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { initData, wallet } = await req.json() as { initData: string; wallet?: string };

    if (!initData) {
      return new Response(
        JSON.stringify({ error: "Missing initData" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate the HMAC
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      console.error("TELEGRAM_BOT_TOKEN not configured");
      return new Response(
        JSON.stringify({ error: "Telegram auth not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const valid = await validateInitData(initData, botToken);
    if (!valid) {
      return new Response(
        JSON.stringify({ error: "Invalid initData — HMAC verification failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse the Telegram user
    const tgUser = parseUser(initData);
    if (!tgUser) {
      return new Response(
        JSON.stringify({ error: "Could not parse Telegram user from initData" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create/sign-in the user in Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Use a stable email derived from the Telegram user ID
    const email = `tg_${tgUser.id}@telegram.yoink.gg`;
    const password = `telegram:${tgUser.id}:${Deno.env.get("AUTH_SALT") ?? "yoink"}`;

    // Try sign-in first
    let authResult = await supabase.auth.signInWithPassword({ email, password });

    if (authResult.error) {
      // New user
      const signUpResult = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          telegram_id: tgUser.id,
          telegram_username: tgUser.username,
          display_name: tgUser.first_name,
          wallet: wallet ?? null,
          provider: "telegram",
        },
      });

      if (signUpResult.error) {
        return new Response(
          JSON.stringify({ error: "Failed to create user", detail: signUpResult.error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      authResult = await supabase.auth.signInWithPassword({ email, password });
      if (authResult.error) {
        return new Response(
          JSON.stringify({ error: "Failed to sign in" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Create profile
      await supabase.from("profiles").upsert({
        id: signUpResult.data.user!.id,
        wallet: wallet ?? `tg_${tgUser.id}`,
        display_name: tgUser.first_name,
        role: "runner",
      }, { onConflict: "id" });
    }

    // If wallet was provided and differs from stored, update the profile
    if (wallet) {
      const userId = authResult.data.user!.id;
      await supabase.from("profiles").update({ wallet }).eq("id", userId);
    }

    const session = authResult.data.session!;
    const user = authResult.data.user!;

    // Parse referral from start_param
    const startParam = parseStartParam(initData);
    let referralCode: string | null = null;
    if (startParam && startParam.startsWith("ref_")) {
      referralCode = startParam.slice(4);
    }

    return new Response(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user: {
          id: user.id,
          telegram_id: tgUser.id,
          username: tgUser.username,
          wallet: wallet ?? null,
        },
        referral_code: referralCode,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("telegram-auth error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
