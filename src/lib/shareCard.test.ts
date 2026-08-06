/**
 * Shareable win-card tests.
 *
 * Covers the pure builders that compose the shared artifact. The canvas
 * rasteriser (`drawWinCard` / `winCardBlob`) is deliberately not unit-tested —
 * it has no logic beyond drawing calls and requires a real 2D context — but
 * `winCardBlob` IS asserted to degrade gracefully outside a browser, since that
 * is the behaviour the fallback share path depends on.
 */

import { describe, it, expect } from "vitest";
import {
  buildHeadline,
  buildShareText,
  buildTweetUrl,
  winCardFilename,
  winCardBlob,
  CARD_W,
  CARD_H,
  type WinCardData,
} from "./shareCard";

const PAID: WinCardData = {
  amountSol: 2.1234,
  targetWallet: "7xKpQw2ZNt6YEk4VmR3q",
  multiple: 9.4,
  free: false,
  referralCode: "YNK-4B2X",
  referralLink: "https://yoink.gg/?ref=YNK-4B2X",
};

const FREE: WinCardData = {
  ...PAID,
  amountSol: 0.0735,
  free: true,
  targetWallet: "House Training Vault",
};

const MISS: WinCardData = {
  ...PAID,
  amountSol: 0,
  nearMiss: { awayPct: 0.4, missedSol: 2.1 },
};

describe("buildHeadline", () => {
  it("names the cracked wallet and amount for a paid siege", () => {
    const h = buildHeadline(PAID);
    expect(h).toContain("2.123");
    expect(h).toContain("cracked");
    // The wallet is truncated, never printed in full.
    expect(h).not.toContain(PAID.targetWallet);
  });

  it("labels a free crack honestly as the training vault", () => {
    // A free crack came from a house-funded vault. Presenting it as a real
    // heist would be a fabricated flex — the exact pattern we removed from
    // the seeded leaderboards.
    const h = buildHeadline(FREE);
    expect(h).toContain("training vault");
    expect(h).toContain("free siege");
  });
});

describe("buildShareText", () => {
  it("ends with the referral link so link previews resolve to it", () => {
    expect(buildShareText(PAID).endsWith(PAID.referralLink)).toBe(true);
  });

  it("includes the fee multiple for a paid crack", () => {
    expect(buildShareText(PAID)).toContain("9.4×");
  });

  it("does not claim a multiple on a free crack (fee was zero)", () => {
    // multiple is meaningless when the fee is 0 — it must never be rendered.
    const t = buildShareText(FREE);
    expect(t).not.toContain("9.4×");
    expect(t).toContain("Free siege");
  });

  it("carries the brand hook", () => {
    expect(buildShareText(PAID)).toContain("be the house");
  });
});

describe("buildTweetUrl", () => {
  it("percent-encodes the whole share text into the intent URL", () => {
    const url = buildTweetUrl(PAID);
    expect(url.startsWith("https://twitter.com/intent/tweet?text=")).toBe(true);
    // Round-trips back to exactly the share text.
    const encoded = url.slice("https://twitter.com/intent/tweet?text=".length);
    expect(decodeURIComponent(encoded)).toBe(buildShareText(PAID));
    // No raw spaces or hashes leaked into the query string.
    expect(encoded).not.toContain(" ");
  });
});

describe("winCardFilename", () => {
  it("is filesystem-safe and encodes the amount", () => {
    expect(winCardFilename(PAID)).toBe("yoink-crack-2-123-sol.png");
    expect(winCardFilename(PAID)).toMatch(/^[a-z0-9-]+\.png$/);
  });

  it("distinguishes a near-miss card", () => {
    expect(winCardFilename(MISS)).toBe("yoink-nearmiss-0-4-pct.png");
    expect(winCardFilename(MISS)).toMatch(/^[a-z0-9-]+\.png$/);
  });
});

describe("near-miss card (the common outcome)", () => {
  it("leads with how close it was, not the zero payout", () => {
    // ~88% of Pit sieges fail. A card that says "+0.000 SOL" is not shareable;
    // "I was 0.4% away" is.
    const h = buildHeadline(MISS);
    expect(h).toContain("0.4% away");
    expect(h).toContain("2.100");
    expect(h).not.toContain("cracked");
  });

  it("share text still ends with the referral link", () => {
    expect(buildShareText(MISS).endsWith(MISS.referralLink)).toBe(true);
  });

  it("does not claim a win or a fee multiple", () => {
    const t = buildShareText(MISS);
    expect(t).not.toContain("9.4×");
    expect(t.toLowerCase()).not.toContain("just cracked");
  });

  it("a near-miss on a free siege still reads as a near miss", () => {
    // nearMiss must take precedence over the `free` framing, otherwise a failed
    // free siege would announce a crack that never happened.
    const h = buildHeadline({ ...MISS, free: true });
    expect(h).toContain("away");
    expect(h).not.toContain("training vault");
  });
});

describe("card geometry", () => {
  it("uses the Twitter/OG summary_large_image ratio (1.91:1)", () => {
    expect(CARD_W).toBe(1200);
    expect(CARD_H).toBe(630);
    expect(CARD_W / CARD_H).toBeCloseTo(1.905, 2);
  });
});

describe("winCardBlob (non-browser degradation)", () => {
  it("resolves to null instead of throwing when there is no document", async () => {
    // The share path relies on this: a null blob falls through to the
    // text-only tweet intent rather than breaking the win moment.
    const hadDocument = typeof document !== "undefined";
    if (hadDocument) return; // jsdom present — nothing to assert here
    await expect(winCardBlob(PAID)).resolves.toBeNull();
  });
});
