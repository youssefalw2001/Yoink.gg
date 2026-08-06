/**
 * YOINK.GG — Challenge links ("crack my vault").
 *
 * THE GROWTH MECHANIC: a Vault Lord posts a link at their own vault. Anyone who
 * opens it lands directly on a siege against it. The defender recruits raiders
 * for free because their ego is on the line, and the two-sided market
 * bootstraps itself — the side that is +EV and passive becomes the side that
 * does the marketing.
 *
 * ── WHY THE LINK CARRIES PARAMETERS, NOT AN ID ──────────────────────────────
 *
 * The obvious design is `?v=<vaultId>`. It cannot work. Vault ids are minted
 * client-side by `seedBoard`/`uid()` for each browser's local simulation, so an
 * id from one browser refers to nothing in another. A `?v=` link would open a
 * siege against a vault that does not exist for the recipient.
 *
 * So the link is SELF-DESCRIBING: it carries the corpus, the published risk
 * profile, and a display label. The recipient's client reconstructs a vault with
 * exactly those published economics, which means the siege it produces is a real
 * siege at real, verifiable odds — no server required. What a link cannot do
 * without a backend is settle SOL into the challenger's actual balance; that is
 * gated behind escrow like everything else.
 *
 * Everything here is pure, total, and defensive: a hostile or corrupt payload
 * must decode to `null` rather than throwing or producing absurd economics,
 * because this input arrives from a URL a stranger controls.
 */

import { isRiskProfile, type RiskProfile } from "@/lib/siegeMath";

/** Query parameter carrying the encoded challenge. */
export const CHALLENGE_PARAM = "c";

/** Payload version, so the format can evolve without breaking old links. */
const VERSION = 1;

/** Bounds on a decoded corpus. Rejects absurd or hostile amounts outright. */
export const MIN_CHALLENGE_SOL = 0.1;
export const MAX_CHALLENGE_SOL = 100_000;

/** Max label length kept from a link (defence against layout-breaking payloads). */
export const MAX_LABEL_LEN = 24;

/** A decoded challenge — enough to rebuild a vault with published economics. */
export interface Challenge {
  /** V — the challenger's vault corpus, in SOL. */
  amount: number;
  /** The challenger's published, locked risk profile. */
  profile: RiskProfile;
  /** Display label for the challenger (wallet fragment or chosen name). */
  label: string;
  /** The challenger's referral code, so an accepted challenge attributes. */
  ref: string | null;
}

// ── base64url helpers (unicode-safe, no Node Buffer dependency) ──────────────

function toBase64Url(s: string): string {
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

// ── Encode / decode ─────────────────────────────────────────────────────────

/**
 * Encode a challenge into a compact URL-safe token.
 * Keys are single letters to keep links short enough for a tweet.
 */
export function encodeChallenge(c: Challenge): string {
  const payload = {
    v: VERSION,
    a: +c.amount.toFixed(4),
    p: c.profile,
    n: c.label.slice(0, MAX_LABEL_LEN),
    ...(c.ref ? { r: c.ref } : {}),
  };
  return toBase64Url(JSON.stringify(payload));
}

/**
 * Decode a challenge token. Returns `null` for anything malformed, unsupported,
 * or out of bounds — never throws, and never yields economics outside the
 * published tier ladder.
 */
export function decodeChallenge(token: string | null | undefined): Challenge | null {
  if (!token || typeof token !== "string" || token.length > 512) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(token)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Record<string, unknown>;

    if (p.v !== VERSION) return null; // unknown/forward version → ignore

    const amount = typeof p.a === "number" && Number.isFinite(p.a) ? p.a : NaN;
    if (!Number.isFinite(amount) || amount < MIN_CHALLENGE_SOL || amount > MAX_CHALLENGE_SOL) {
      return null;
    }
    if (!isRiskProfile(p.p)) return null;

    const rawLabel = typeof p.n === "string" ? p.n : "";
    // Strip control characters; a label is rendered directly into the UI.
    const label = rawLabel.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_LABEL_LEN).trim();

    const ref = typeof p.r === "string" && p.r.trim().length > 0 ? p.r.trim().slice(0, 40) : null;

    return { amount, profile: p.p, label: label || "A Vault Lord", ref };
  } catch {
    return null;
  }
}

/** Build the full shareable challenge URL. */
export function challengeLink(c: Challenge, origin = "https://yoink.gg"): string {
  return `${origin}/?${CHALLENGE_PARAM}=${encodeChallenge(c)}`;
}

/** Read and decode a challenge from a URL query string. Never throws. */
export function parseChallengeFromUrl(search?: string): Challenge | null {
  try {
    const q = search ?? (typeof window !== "undefined" ? window.location.search : "");
    return decodeChallenge(new URLSearchParams(q).get(CHALLENGE_PARAM));
  } catch {
    return null;
  }
}

/**
 * The tweet copy for a challenge. Deliberately taunting — the whole mechanic
 * runs on the defender's ego, and a neutral "check out my vault" does not get
 * clicked.
 */
export function challengeShareText(c: Challenge, url: string): string {
  return `${c.amount} SOL sitting in my vault on YOINK.GG. Published odds, provably fair rolls. Bet you can't crack it. ${url}`;
}
