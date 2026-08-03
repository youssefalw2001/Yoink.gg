/**
 * YOINK.GG — Shareable win card (the growth loop).
 *
 * WHY THIS EXISTS: a crack is the single most shareable moment the product
 * produces, and text-only tweets do not travel. This module turns a settled win
 * into a real 1200×630 PNG (the Twitter/OG card ratio) with the referral code
 * burned into the pixels, so the artifact carries its own attribution even when
 * it is re-uploaded, screenshotted, or reposted without the original link.
 *
 * SPLIT BY TESTABILITY — the string/URL builders and the filename are pure and
 * unit-tested; only the canvas rasteriser touches the DOM, and it is guarded so
 * importing this module is safe in a non-browser test environment.
 *
 * Nothing here reads game state, moves SOL, or affects odds. Presentation only.
 */

import { formatSol, truncateAddress } from "@/lib/utils";

/** Everything the card needs to render itself. */
export interface WinCardData {
  /** SOL seized on the crack. */
  amountSol: number;
  /** The cracked vault's wallet address (truncated for display). */
  targetWallet: string;
  /** Reward ÷ fee for a paid siege. Ignored when `free` is true. */
  multiple: number;
  /** True when this was a free-siege (training vault) crack. */
  free: boolean;
  /** The player's referral code, burned into the image. */
  referralCode: string;
  /** The player's referral link, used in the share text. */
  referralLink: string;
}

/** Card dimensions — the standard Twitter/OG summary_large_image ratio. */
export const CARD_W = 1200;
export const CARD_H = 630;

// ── Pure builders (unit-tested) ──────────────────────────────────────────────

/**
 * The headline that appears both on the card and in the share text.
 * Free cracks are labelled honestly — they came from the house training vault,
 * so presenting them as a real heist would be a fabricated flex.
 */
export function buildHeadline(d: WinCardData): string {
  if (d.free) {
    return `I cracked the house training vault for ${formatSol(d.amountSol, 3)} SOL on my free siege`;
  }
  return `I just cracked ${truncateAddress(d.targetWallet, 4, 4)} for ${formatSol(d.amountSol, 3)} SOL`;
}

/** The tweet body. Keeps the referral link last so link previews resolve to it. */
export function buildShareText(d: WinCardData): string {
  const hook = d.free
    ? "Free siege, real crack."
    : `${d.multiple.toFixed(1)}× the fee.`;
  return `${buildHeadline(d)}. ${hook} In every other app the house wins — on YOINK.GG you can be the house. ${d.referralLink}`;
}

/** Twitter/X intent URL — the fallback path when the file share is unavailable. */
export function buildTweetUrl(d: WinCardData): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(buildShareText(d))}`;
}

/** Deterministic, filesystem-safe download name. */
export function winCardFilename(d: WinCardData): string {
  const sol = formatSol(d.amountSol, 3).replace(".", "-");
  return `yoink-crack-${sol}-sol.png`;
}

// ── Canvas rasteriser (browser only) ────────────────────────────────────────

/** Rounded-rect path helper (kept local — no dependency on ctx.roundRect). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Draw the win card onto a 2D context sized `CARD_W × CARD_H`.
 *
 * Deliberately uses only system font stacks and primitive shapes so the render
 * is synchronous and cannot fail on a webfont that has not loaded yet — a card
 * that renders 200 ms late is a card nobody shares.
 */
export function drawWinCard(ctx: CanvasRenderingContext2D, d: WinCardData): void {
  const GOLD = "#FFD700";
  const AMBER = "#FF9900";
  const VOID = "#08080F";

  // Background: dark void with a warm radial bloom behind the number.
  ctx.fillStyle = VOID;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const bloom = ctx.createRadialGradient(CARD_W / 2, CARD_H * 0.46, 40, CARD_W / 2, CARD_H * 0.46, CARD_W * 0.62);
  bloom.addColorStop(0, "rgba(255,215,0,0.20)");
  bloom.addColorStop(0.5, "rgba(112,0,255,0.08)");
  bloom.addColorStop(1, "rgba(8,8,15,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Top hairline in the brand gradient.
  const rule = ctx.createLinearGradient(0, 0, CARD_W, 0);
  rule.addColorStop(0, "rgba(8,8,15,0)");
  rule.addColorStop(0.3, "#7000FF");
  rule.addColorStop(0.5, GOLD);
  rule.addColorStop(0.7, "#FF2200");
  rule.addColorStop(1, "rgba(8,8,15,0)");
  ctx.fillStyle = rule;
  ctx.fillRect(0, 0, CARD_W, 6);

  // Inner border.
  ctx.strokeStyle = "rgba(255,215,0,0.28)";
  ctx.lineWidth = 2;
  roundRect(ctx, 28, 28, CARD_W - 56, CARD_H - 56, 28);
  ctx.stroke();

  ctx.textAlign = "center";

  // Eyebrow.
  ctx.fillStyle = "#8892a4";
  ctx.font = "600 26px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(d.free ? "FREE SIEGE · TRAINING VAULT" : "WALLET WARS · SIEGE THE VAULT", CARD_W / 2, 108);

  // Headline.
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 68px Orbitron, ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("VAULT CRACKED", CARD_W / 2, 196);

  // The number — the whole point of the card.
  const amount = `+${formatSol(d.amountSol, 3)}`;
  ctx.font = "900 168px ui-monospace, SFMono-Regular, Menlo, monospace";
  const numGrad = ctx.createLinearGradient(0, 240, 0, 400);
  numGrad.addColorStop(0, GOLD);
  numGrad.addColorStop(1, AMBER);
  ctx.fillStyle = numGrad;
  ctx.fillText(amount, CARD_W / 2, 366);

  ctx.fillStyle = "#8892a4";
  ctx.font = "600 34px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("SOL", CARD_W / 2, 412);

  // Context line: what was cracked, and the multiple for paid sieges.
  ctx.fillStyle = "#eef1f6";
  ctx.font = "600 28px ui-monospace, SFMono-Regular, Menlo, monospace";
  const detail = d.free
    ? "House training vault · risked nothing"
    : `${truncateAddress(d.targetWallet, 4, 4)} · ${d.multiple.toFixed(1)}× the fee risked`;
  ctx.fillText(detail, CARD_W / 2, 470);

  // Footer: brand left, referral code right — burned in so attribution survives
  // a re-upload that strips the link.
  ctx.textAlign = "left";
  ctx.fillStyle = GOLD;
  ctx.font = "900 40px Orbitron, ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("YOINK.GG", 72, CARD_H - 68);

  ctx.textAlign = "right";
  ctx.fillStyle = "#5b6472";
  ctx.font = "600 24px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`invite code  ${d.referralCode}`, CARD_W - 72, CARD_H - 68);
}

/** Render the card to a PNG blob. Returns `null` outside a browser. */
export async function winCardBlob(d: WinCardData): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawWinCard(ctx, d);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/** What actually happened when the user tapped share — surfaced in the UI. */
export type ShareOutcome = "shared" | "downloaded" | "tweeted" | "failed";

/**
 * Share the win card, preferring the richest channel the device supports:
 *
 *   1. Native share sheet WITH the PNG attached (mobile — the channel that
 *      actually spreads, and where most Solana traffic lives).
 *   2. PNG download + the Twitter intent opened alongside it (desktop), so the
 *      user has the image ready to drop into the composer.
 *   3. Twitter intent alone.
 *
 * Never throws — a failed share must not break the win moment.
 */
export async function shareWinCard(d: WinCardData): Promise<ShareOutcome> {
  const text = buildShareText(d);
  try {
    const blob = await winCardBlob(d);
    if (blob) {
      const file = new File([blob], winCardFilename(d), { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; text?: string; title?: string }) => Promise<void>;
      };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text, title: "YOINK.GG · Vault Cracked" });
        return "shared";
      }
      // Desktop: hand them the file, then open the composer.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = winCardFilename(d);
      a.click();
      // Revoke on the next tick so the click has committed.
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      window.open(buildTweetUrl(d), "_blank", "noopener,noreferrer");
      return "downloaded";
    }
  } catch {
    /* fall through to the text-only path */
  }
  try {
    window.open(buildTweetUrl(d), "_blank", "noopener,noreferrer");
    return "tweeted";
  } catch {
    return "failed";
  }
}
