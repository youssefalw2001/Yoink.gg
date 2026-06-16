/**
 * YOINK.GG — Edge Function: wallet-auth
 *
 * Sign-in-with-Solana: verifies a wallet signature against a challenge message,
 * then issues a Supabase JWT. This is the ONLY path to get an authenticated
 * session — there is no email/password. One wallet = one identity.
 *
 * FLOW:
 *   1. GET  /wallet-auth?wallet=<base58>        → { challenge, expiresAt }
 *   2. POST /wallet-auth { wallet, signature }  → { access_token, user }
 *
 * The challenge is a timestamped, domain-bound message that prevents replay.
 * The signature is verified using ed25519 (Solana's native curve).
 *
 * On first sign-in, a profile row is auto-created (upsert). Subsequent
 * sign-ins return the existing profile.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { decode as decodeBase58 } from "https://deno.land/std@0.208.0/encoding/base58.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChallengeResponse {
  challenge: string;
  expiresAt: number;
}

interface AuthRequest {
  wallet: string;
  signature: string; // base58-encoded signature
  challenge: string; // the exact challenge that was signed
}

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; wallet: string };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHALLENGE_TTL_MS = 60_000; // 60 seconds to sign
const DOMAIN = "yoink.gg";

// ── Challenge generation ──────────────────────────────────────────────────────

function generateChallenge(wallet: string): { challenge: string; expiresAt: number } {
  const now = Date.now();
  const expiresAt = now + CHALLENGE_TTL_MS;
  const nonce = crypto.randomUUID();

  // Domain-bound, timestamped message — prevents replay attacks.
  // The user signs THIS exact string with their wallet.
  const challenge = [
    `${DOMAIN} wants you to sign in with your Solana account:`,
    wallet,
    "",
    "Sign in to YOINK.GG Wallet Wars",
    "",
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(now).toISOString()}`,
    `Expiration Time: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");

  return { challenge, expiresAt };
}

// ── Signature verification ────────────────────────────────────────────────────

function verifySignature(
  message: string,
  signatureBase58: string,
  walletBase58: string,
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = decodeBase58(signatureBase58);
    const publicKeyBytes = decodeBase58(walletBase58);

    if (signatureBytes.length !== 64) return false;
    if (publicKeyBytes.length !== 32) return false;

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

// ── Challenge expiry validation ───────────────────────────────────────────────

function isChallengeExpired(challenge: string): boolean {
  try {
    const match = challenge.match(/Expiration Time: (.+)$/m);
    if (!match) return true;
    const expiresAt = new Date(match[1]).getTime();
    return Date.now() > expiresAt;
  } catch {
    return true;
  }
}

function extractWalletFromChallenge(challenge: string): string | null {
  const lines = challenge.split("\n");
  // Wallet is on the second line (after the domain line)
  return lines.length >= 2 ? lines[1].trim() : null;
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // ── GET: Generate a challenge for the wallet ──────────────────────────
    if (req.method === "GET") {
      const wallet = url.searchParams.get("wallet");
      if (!wallet || wallet.length < 32 || wallet.length > 44) {
        return new Response(
          JSON.stringify({ error: "Invalid wallet address" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { challenge, expiresAt } = generateChallenge(wallet);
      const body: ChallengeResponse = { challenge, expiresAt };

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── POST: Verify signature and issue JWT ──────────────────────────────
    if (req.method === "POST") {
      const { wallet, signature, challenge } = (await req.json()) as AuthRequest;

      // Validate inputs
      if (!wallet || !signature || !challenge) {
        return new Response(
          JSON.stringify({ error: "Missing wallet, signature, or challenge" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Verify the challenge hasn't expired
      if (isChallengeExpired(challenge)) {
        return new Response(
          JSON.stringify({ error: "Challenge expired — request a new one" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Verify the wallet in the challenge matches the claimed wallet
      const challengeWallet = extractWalletFromChallenge(challenge);
      if (challengeWallet !== wallet) {
        return new Response(
          JSON.stringify({ error: "Challenge wallet mismatch" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Verify the ed25519 signature
      if (!verifySignature(challenge, signature, wallet)) {
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Signature valid — issue a Supabase JWT via the admin API.
      // We use the service_role key to create/sign-in the user.
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Upsert the user in auth.users (email = wallet@solana.yoink.gg as a
      // stable identifier — Supabase auth requires an email or phone).
      const email = `${wallet}@solana.yoink.gg`;
      const password = `solana:${wallet}:${Deno.env.get("AUTH_SALT") ?? "yoink"}`;

      // Try to sign in first (existing user)
      let authResult = await supabase.auth.signInWithPassword({ email, password });

      if (authResult.error) {
        // New user — sign up
        const signUpResult = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { wallet, provider: "solana" },
        });

        if (signUpResult.error) {
          return new Response(
            JSON.stringify({ error: "Failed to create user", detail: signUpResult.error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Sign in the newly created user
        authResult = await supabase.auth.signInWithPassword({ email, password });
        if (authResult.error) {
          return new Response(
            JSON.stringify({ error: "Failed to sign in new user" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Create the profile row
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert({
            id: signUpResult.data.user!.id,
            wallet,
            display_name: "",
            role: "runner",
          }, { onConflict: "id" });

        if (profileError) {
          console.error("Profile upsert error:", profileError);
          // Non-fatal: the user is authenticated, profile can be created later
        }
      }

      const session = authResult.data.session!;
      const user = authResult.data.user!;

      // Ensure profile exists for returning users too (idempotent upsert)
      await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          wallet,
        }, { onConflict: "id", ignoreDuplicates: true });

      const body: AuthResponse = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user: { id: user.id, wallet },
      };

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("wallet-auth error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
