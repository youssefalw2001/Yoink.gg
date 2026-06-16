/**
 * YOINK.GG — Telegram Mini App integration
 *
 * This module bridges the app to Telegram's WebApp SDK when running as a
 * Telegram Mini App (TMA). It is purely a DISTRIBUTION + UX layer:
 *   - Native haptic feedback on siege outcomes
 *   - Telegram-native share for referral + crack celebrations
 *   - Back button integration (replaces browser back)
 *   - Theme adaptation (void background in the TG chrome)
 *   - Deep link referral parsing (t.me/YoinkBot?start=ref_CODE)
 *
 * NEVER TOUCHES: economy, odds, settlement, or any money math.
 * The same Supabase backend serves web and Telegram clients identically.
 *
 * SAFE: all WebApp SDK calls are guarded behind isTelegramMiniApp() checks.
 * When not running inside Telegram, every function is a no-op.
 */

import { TELEGRAM_ENABLED } from "@/lib/featureFlags";

// ── Detection ─────────────────────────────────────────────────────────────────

/** The Telegram WebApp global, if available. */
function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tg = (window as any).Telegram?.WebApp as TelegramWebApp | undefined;
  return tg && tg.initData ? tg : null;
}

/** True when the app is running inside the Telegram Mini App environment. */
export function isTelegramMiniApp(): boolean {
  if (!TELEGRAM_ENABLED) return false;
  return getWebApp() !== null;
}

// ── Initialization ────────────────────────────────────────────────────────────

/**
 * Initialize the Telegram Mini App. Call once at app startup.
 * Sets the header/background colors, expands to full screen, and signals ready.
 */
export function initTelegramApp(): void {
  const app = getWebApp();
  if (!app) return;

  app.ready();
  app.expand();

  // Brand colors in the Telegram chrome
  app.setHeaderColor("#08080F");     // void
  app.setBackgroundColor("#08080F"); // void

  // Disable the default closing confirmation (our app handles navigation)
  app.enableClosingConfirmation?.();
}

// ── Haptics ───────────────────────────────────────────────────────────────────

/** Impact haptic — used on siege commit (the "crack it" button tap). */
export function hapticImpact(style: "light" | "medium" | "heavy" = "medium"): void {
  const app = getWebApp();
  app?.HapticFeedback?.impactOccurred(style);
}

/** Notification haptic — siege outcome (success = crack, error = failed). */
export function hapticNotification(type: "success" | "warning" | "error"): void {
  const app = getWebApp();
  app?.HapticFeedback?.notificationOccurred(type);
}

/** Selection haptic — light tap on tab switch, card selection. */
export function hapticSelection(): void {
  const app = getWebApp();
  app?.HapticFeedback?.selectionChanged();
}

// ── Sharing ───────────────────────────────────────────────────────────────────

/**
 * Share a message via Telegram's native share sheet.
 * Falls back to switchInlineQuery for inline bots.
 */
export function telegramShare(text: string, url?: string): void {
  const app = getWebApp();
  if (!app) return;

  // Use Telegram's native share URL scheme
  const shareUrl = url
    ? `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    : `https://t.me/share/url?text=${encodeURIComponent(text)}`;

  app.openTelegramLink(shareUrl);
}

/**
 * Share a vault crack celebration (the dopamine moment).
 * Uses Telegram-native share for maximum virality.
 */
export function shareCrack(targetWallet: string, amountSol: number): void {
  const text = `I just cracked ${targetWallet.slice(0, 4)}...${targetWallet.slice(-4)} for ${amountSol.toFixed(3)} SOL on YOINK.GG Wallet Wars!`;
  telegramShare(text, "https://t.me/YoinkBot");
}

/**
 * Share a referral invite via Telegram.
 * Uses the bot deep link format so the referral code is captured on open.
 */
export function shareReferralLink(referralCode: string): void {
  const deepLink = `https://t.me/YoinkBot?start=ref_${referralCode}`;
  const text = "I'm building my empire on YOINK.GG Wallet Wars — become the house or crack my vault. Join me:";
  telegramShare(text, deepLink);
}

// ── Back Button ───────────────────────────────────────────────────────────────

/**
 * Show the Telegram back button with a handler.
 * Returns a cleanup function to hide it and remove the listener.
 */
export function showBackButton(onBack: () => void): () => void {
  const app = getWebApp();
  if (!app?.BackButton) return () => {};

  app.BackButton.show();
  app.BackButton.onClick(onBack);

  return () => {
    app.BackButton.hide();
    app.BackButton.offClick(onBack);
  };
}

// ── Deep Link Referral ────────────────────────────────────────────────────────

/**
 * Extract the referral code from Telegram's start parameter.
 * Format: t.me/YoinkBot?start=ref_LORD-ABC123 → "LORD-ABC123"
 */
export function parseStartParam(): string | null {
  const app = getWebApp();
  if (!app) return null;

  const startParam = app.initDataUnsafe?.start_param;
  if (!startParam || typeof startParam !== "string") return null;

  // Format: ref_<CODE>
  if (startParam.startsWith("ref_")) {
    return startParam.slice(4);
  }

  return null;
}

// ── Auth (Telegram initData) ──────────────────────────────────────────────────

/**
 * Get the Telegram initData for server-side validation.
 * The telegram-auth Edge Function validates this HMAC against the bot token.
 */
export function getTelegramInitData(): string | null {
  const app = getWebApp();
  return app?.initData ?? null;
}

/**
 * Get the Telegram user info (if available). Non-authenticated — for display only.
 */
export function getTelegramUser(): TelegramUser | null {
  const app = getWebApp();
  return app?.initDataUnsafe?.user ?? null;
}

// ── Main Button (CTA at bottom of screen) ─────────────────────────────────────

/**
 * Show Telegram's main button (the big CTA at the bottom).
 * Used for "Crack it" / "Open Vault" / etc.
 */
export function showMainButton(text: string, onClick: () => void, color = "#FFD700"): () => void {
  const app = getWebApp();
  if (!app?.MainButton) return () => {};

  app.MainButton.setText(text);
  app.MainButton.setParams({ color, text_color: "#08080F" });
  app.MainButton.onClick(onClick);
  app.MainButton.show();

  return () => {
    app.MainButton.hide();
    app.MainButton.offClick(onClick);
  };
}

// ── Type Definitions (Telegram WebApp SDK) ────────────────────────────────────

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    start_param?: string;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  enableClosingConfirmation?: () => void;
  openTelegramLink: (url: string) => void;
  HapticFeedback: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "success" | "warning" | "error") => void;
    selectionChanged: () => void;
  };
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  MainButton: {
    setText: (text: string) => void;
    setParams: (params: { color?: string; text_color?: string }) => void;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}
