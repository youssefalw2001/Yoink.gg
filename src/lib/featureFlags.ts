/**
 * YOINK.GG — Feature Flags
 *
 * Single source of truth for launch-gating toggles. Flags here are pure
 * compile-time/runtime booleans — they never touch game economy, fairness,
 * or payout logic. They only control navigation and visibility.
 *
 * ── BAG_COMING_SOON ─────────────────────────────────────────────────────────
 * Gates "The Bag" game behind a polished "Coming Soon" screen so the app can
 * launch with only the fully-hardened Wallet Wars (Siege the Vault) visible.
 *
 *   true  → "The Bag" nav entry shows a "SOON" badge and routes to the
 *           Coming Soon screen instead of the live game. Wallet Wars stays
 *           the default/primary experience.
 *   false → The Bag is fully live again — RoomSelectScreen / GameScreen render
 *           exactly as before. No other code changes required.
 *
 * To re-enable The Bag at launch, flip this to `false`. That is the only edit
 * needed — all game/hooks/economy code is left intact and untouched.
 */
export const BAG_COMING_SOON = true;


/**
 * ── SHOP_ENABLED ────────────────────────────────────────────────────────────
 * Gates the "Armory" shop. Removed for launch — the nav entry is hidden and the
 * shop page never renders while this is `false`. All shop code (ShopScreen,
 * purchase plumbing, cosmetics) is left intact; flip to `true` to restore it
 * exactly as before. Like every flag here, it only controls visibility — never
 * economy, fairness, or payout logic.
 */
export const SHOP_ENABLED = false;


/**
 * ── SUPABASE_ENABLED ────────────────────────────────────────────────────────
 * Gates the Supabase backend integration. When false (default), the app runs
 * entirely on the client-side simulation (localStorage + bot vaults). When true,
 * the app connects to Supabase for:
 *   - Server-authoritative siege settlement (commit-reveal provable fairness)
 *   - Persistent multi-user vault state (real PvP)
 *   - Wallet-based authentication (sign-in-with-Solana)
 *   - Real-time board updates via Supabase Realtime
 *   - Persistent referral attribution + ledger
 *
 * Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to be set.
 * The client simulation remains the FALLBACK when Supabase is unreachable.
 */
export const SUPABASE_ENABLED: boolean =
  (import.meta.env.VITE_SUPABASE_ENABLED as string) === "true";


/**
 * ── TELEGRAM_ENABLED ────────────────────────────────────────────────────────
 * Gates Telegram Mini App integration. When true AND running inside the
 * Telegram WebApp environment, the app:
 *   - Uses Telegram's native back button instead of the Header
 *   - Enables haptic feedback on siege outcomes
 *   - Uses Telegram-native share for referral links + crack celebrations
 *   - Authenticates via Telegram initData (validated by the telegram-auth
 *     Edge Function) as an alternative to wallet signature
 *
 * This is purely a DISTRIBUTION + UX layer. It never touches the economy,
 * fairness, or settlement logic. The same Supabase backend serves both web
 * and Telegram clients identically.
 */
export const TELEGRAM_ENABLED: boolean =
  (import.meta.env.VITE_TELEGRAM_ENABLED as string) === "true";
