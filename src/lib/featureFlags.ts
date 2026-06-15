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
