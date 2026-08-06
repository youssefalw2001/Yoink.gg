/**
 * Challenge-link tests.
 *
 * This payload arrives from a URL a stranger controls, so the decoder is treated
 * as a trust boundary: every malformed, hostile, or out-of-bounds input must
 * yield `null` rather than throwing or producing economics outside the published
 * tier ladder.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  encodeChallenge,
  decodeChallenge,
  challengeLink,
  parseChallengeFromUrl,
  challengeShareText,
  CHALLENGE_PARAM,
  MIN_CHALLENGE_SOL,
  MAX_CHALLENGE_SOL,
  MAX_LABEL_LEN,
  type Challenge,
} from "./challengeLink";
import { RISK_PROFILE_ORDER } from "./siegeMath";

const BASE: Challenge = { amount: 12.5, profile: "exposed", label: "7xKp…mR3q", ref: "LORD-A7F3K9" };

describe("round-trip", () => {
  it("preserves amount, profile, label and ref", () => {
    const out = decodeChallenge(encodeChallenge(BASE));
    expect(out).toEqual(BASE);
  });

  it("round-trips every published risk profile", () => {
    for (const profile of RISK_PROFILE_ORDER) {
      const out = decodeChallenge(encodeChallenge({ ...BASE, profile }));
      expect(out?.profile).toBe(profile);
    }
  });

  it("survives unicode labels", () => {
    const out = decodeChallenge(encodeChallenge({ ...BASE, label: "👑 Król" }));
    expect(out?.label).toBe("👑 Król");
  });

  it("omits ref cleanly when absent", () => {
    const out = decodeChallenge(encodeChallenge({ ...BASE, ref: null }));
    expect(out?.ref).toBeNull();
  });

  it("produces a URL-safe token (no +, /, = or whitespace)", () => {
    const token = encodeChallenge({ ...BASE, label: "a/b+c d" });
    expect(token).not.toMatch(/[+/=\s]/);
  });
});

describe("hostile / malformed input never throws", () => {
  const junk = [
    null, undefined, "", "!!!!", "e30", "not-base64!!", "=".repeat(10),
    btoa("null"), btoa("[]"), btoa("{}"), btoa('{"v":1}'),
    btoa('{"v":99,"a":1,"p":"standard","n":"x"}'),      // wrong version
    "a".repeat(600),                                      // over the length cap
  ];

  it("returns null for every junk payload", () => {
    for (const t of junk) {
      expect(decodeChallenge(t as string | null | undefined), String(t).slice(0, 24)).toBeNull();
    }
  });

  it("never throws on arbitrary strings", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (s) => {
        expect(() => decodeChallenge(s)).not.toThrow();
        return true;
      }),
      { numRuns: 300 },
    );
  });
});

describe("economic bounds are enforced at the trust boundary", () => {
  function tokenFor(a: unknown, p: unknown = "standard") {
    return btoa(JSON.stringify({ v: 1, a, p, n: "x" }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  it("rejects amounts below the Pit floor and above the sanity ceiling", () => {
    expect(decodeChallenge(tokenFor(MIN_CHALLENGE_SOL - 0.01))).toBeNull();
    expect(decodeChallenge(tokenFor(0))).toBeNull();
    expect(decodeChallenge(tokenFor(-5))).toBeNull();
    expect(decodeChallenge(tokenFor(MAX_CHALLENGE_SOL + 1))).toBeNull();
  });

  it("accepts exactly the inclusive bounds", () => {
    expect(decodeChallenge(tokenFor(MIN_CHALLENGE_SOL))?.amount).toBe(MIN_CHALLENGE_SOL);
    expect(decodeChallenge(tokenFor(MAX_CHALLENGE_SOL))?.amount).toBe(MAX_CHALLENGE_SOL);
  });

  it("rejects non-finite and non-numeric amounts", () => {
    // NaN/Infinity do not survive JSON, so they arrive as null/strings.
    expect(decodeChallenge(tokenFor(null))).toBeNull();
    expect(decodeChallenge(tokenFor("12.5"))).toBeNull();
  });

  it("rejects an unknown risk profile rather than defaulting it", () => {
    // Silently defaulting would advertise odds the challenger never published.
    expect(decodeChallenge(tokenFor(5, "godmode"))).toBeNull();
    expect(decodeChallenge(tokenFor(5, ""))).toBeNull();
    expect(decodeChallenge(tokenFor(5, 1))).toBeNull();
  });
});

describe("label sanitisation (rendered straight into the UI)", () => {
  function tokenWithLabel(n: unknown) {
    return btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, a: 5, p: "standard", n }))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  it("truncates a long label that still fits inside the token cap", () => {
    const out = decodeChallenge(tokenWithLabel("z".repeat(100)));
    expect(out).not.toBeNull();
    expect(out!.label.length).toBe(MAX_LABEL_LEN);
  });

  it("rejects a label so long the token breaches the length cap", () => {
    // Defence in depth: the 512-char token cap fires before any parsing work,
    // so a megabyte of label can never reach JSON.parse.
    expect(decodeChallenge(tokenWithLabel("z".repeat(500)))).toBeNull();
  });

  it("truncates on the ENCODE side too, so links we generate are always short", () => {
    const token = encodeChallenge({ ...BASE, label: "y".repeat(300) });
    expect(token.length).toBeLessThan(200);
    expect(decodeChallenge(token)!.label.length).toBe(MAX_LABEL_LEN);
  });

  it("strips control characters", () => {
    const out = decodeChallenge(tokenWithLabel("ab\u0000\u001bcd\u007f"));
    expect(out?.label).toBe("abcd");
  });

  it("falls back to a neutral label when empty or missing", () => {
    expect(decodeChallenge(tokenWithLabel(""))?.label).toBe("A Vault Lord");
    expect(decodeChallenge(tokenWithLabel("   "))?.label).toBe("A Vault Lord");
    expect(decodeChallenge(tokenWithLabel(123))?.label).toBe("A Vault Lord");
  });
});

describe("URL helpers", () => {
  it("builds a link that parses back to the same challenge", () => {
    const url = challengeLink(BASE, "https://yoink.gg");
    expect(url).toContain(`?${CHALLENGE_PARAM}=`);
    const search = url.slice(url.indexOf("?"));
    expect(parseChallengeFromUrl(search)).toEqual(BASE);
  });

  it("returns null when the parameter is absent or empty", () => {
    expect(parseChallengeFromUrl("")).toBeNull();
    expect(parseChallengeFromUrl("?ref=LORD-X")).toBeNull();
    expect(parseChallengeFromUrl(`?${CHALLENGE_PARAM}=`)).toBeNull();
  });

  it("coexists with an inbound ?ref= parameter", () => {
    const url = challengeLink(BASE);
    const search = url.slice(url.indexOf("?")) + "&ref=LORD-OTHER";
    expect(parseChallengeFromUrl(search)?.amount).toBe(BASE.amount);
  });

  it("share text names the stake and carries the url", () => {
    const url = challengeLink(BASE);
    const text = challengeShareText(BASE, url);
    expect(text).toContain("12.5 SOL");
    expect(text.endsWith(url)).toBe(true);
  });
});
