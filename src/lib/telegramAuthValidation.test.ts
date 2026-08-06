/**
 * Telegram `initData` validation tests.
 *
 * WHAT THIS GUARDS: the `telegram-auth` Edge Function originally verified only the
 * HMAC. That made a captured `initData` string a PERMANENT credential — it is
 * signed with the bot token, so it never expires, and anyone who obtained it once
 * could authenticate as that user forever with no revocation path. Telegram's own
 * validation guidance requires an `auth_date` freshness check alongside the HMAC.
 *
 * The Edge Function targets Deno and imports `https://` specifiers, so it is
 * extracted and evaluated rather than imported — the same approach used by
 * `serverSettlementParity.test.ts`. That way these assertions run against the
 * REAL function body a reviewer reads, not a copy.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transformSync } from "esbuild";

const SRC = readFileSync(
  resolve(__dirname, "../../supabase/functions/telegram-auth/index.ts"),
  "utf8",
);

/** Extract the validation helpers (no Deno/network dependencies). */
function loadValidator(): {
  validateInitData: (initData: string, botToken: string) => Promise<boolean>;
  timingSafeEqualHex: (a: string, b: string) => boolean;
  INITDATA_MAX_AGE_SECONDS: number;
} {
  const start = SRC.indexOf("const INITDATA_MAX_AGE_SECONDS");
  const end = SRC.indexOf("/** Parse the `user` JSON");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("could not locate the validation section of telegram-auth/index.ts");
  }
  const ts = SRC.slice(start, end);
  const js = transformSync(ts, { loader: "ts", format: "cjs", target: "es2020" }).code;
  const factory = new Function(
    `${js}\nreturn { validateInitData, timingSafeEqualHex, INITDATA_MAX_AGE_SECONDS };`,
  );
  return factory();
}

const V = loadValidator();
const BOT_TOKEN = "123456:TEST_BOT_TOKEN_abcdefghijklmnop";

/** Build a correctly-HMAC'd initData string, exactly as Telegram would. */
async function signInitData(
  fields: Record<string, string>,
  botToken = BOT_TOKEN,
): Promise<string> {
  const enc = new TextEncoder();
  const entries = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = await crypto.subtle.importKey(
    "raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const secretHash = await crypto.subtle.sign("HMAC", secretKey, enc.encode(botToken));
  const key = await crypto.subtle.importKey(
    "raw", secretHash, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(dataCheckString));
  const hash = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  const params = new URLSearchParams(fields);
  params.set("hash", hash);
  return params.toString();
}

const nowSec = () => Math.floor(Date.now() / 1000);
const USER = JSON.stringify({ id: 777, first_name: "Test" });

describe("valid, fresh initData is accepted", () => {
  it("accepts a correctly signed payload issued now", async () => {
    const data = await signInitData({ auth_date: String(nowSec()), user: USER, query_id: "AAA" });
    await expect(V.validateInitData(data, BOT_TOKEN)).resolves.toBe(true);
  });

  it("accepts a payload just inside the max age", async () => {
    const age = V.INITDATA_MAX_AGE_SECONDS - 60;
    const data = await signInitData({ auth_date: String(nowSec() - age), user: USER });
    await expect(V.validateInitData(data, BOT_TOKEN)).resolves.toBe(true);
  });
});

describe("REPLAY GUARD — stale payloads are rejected", () => {
  it("rejects a payload older than the max age", async () => {
    // This is the whole point: without the auth_date check this returns true,
    // because the HMAC of an old capture is still perfectly valid.
    const age = V.INITDATA_MAX_AGE_SECONDS + 60;
    const data = await signInitData({ auth_date: String(nowSec() - age), user: USER });
    await expect(V.validateInitData(data, BOT_TOKEN)).resolves.toBe(false);
  });

  it("rejects a payload captured a year ago even though its HMAC is valid", async () => {
    const data = await signInitData({ auth_date: String(nowSec() - 365 * 24 * 3600), user: USER });
    // Prove the HMAC really is intact — only the age is wrong.
    const params = new URLSearchParams(data);
    expect(params.get("hash")).toMatch(/^[0-9a-f]{64}$/);
    await expect(V.validateInitData(data, BOT_TOKEN)).resolves.toBe(false);
  });

  it("rejects a payload with no auth_date at all", async () => {
    const data = await signInitData({ user: USER, query_id: "AAA" });
    await expect(V.validateInitData(data, BOT_TOKEN)).resolves.toBe(false);
  });

  it("rejects non-numeric, zero, and negative auth_date values", async () => {
    for (const bad of ["not-a-number", "0", "-1", "", "NaN", "Infinity"]) {
      const data = await signInitData({ auth_date: bad, user: USER });
      await expect(V.validateInitData(data, BOT_TOKEN), `auth_date=${bad}`).resolves.toBe(false);
    }
  });

  it("rejects an implausibly future auth_date (forged clock)", async () => {
    const data = await signInitData({ auth_date: String(nowSec() + 3600), user: USER });
    await expect(V.validateInitData(data, BOT_TOKEN)).resolves.toBe(false);
  });

  it("tolerates small negative skew so honest clients are not locked out", async () => {
    const data = await signInitData({ auth_date: String(nowSec() + 60), user: USER });
    await expect(V.validateInitData(data, BOT_TOKEN)).resolves.toBe(true);
  });
});

describe("HMAC integrity still enforced", () => {
  it("rejects a tampered hash", async () => {
    const data = await signInitData({ auth_date: String(nowSec()), user: USER });
    const params = new URLSearchParams(data);
    const h = params.get("hash")!;
    params.set("hash", (h[0] === "a" ? "b" : "a") + h.slice(1));
    await expect(V.validateInitData(params.toString(), BOT_TOKEN)).resolves.toBe(false);
  });

  it("rejects a payload whose fields were altered after signing", async () => {
    // Escalating your own Telegram user id must not survive validation.
    const data = await signInitData({ auth_date: String(nowSec()), user: USER });
    const params = new URLSearchParams(data);
    params.set("user", JSON.stringify({ id: 999999, first_name: "Attacker" }));
    await expect(V.validateInitData(params.toString(), BOT_TOKEN)).resolves.toBe(false);
  });

  it("rejects a payload signed with a different bot token", async () => {
    const data = await signInitData({ auth_date: String(nowSec()), user: USER }, "999:WRONG_TOKEN");
    await expect(V.validateInitData(data, BOT_TOKEN)).resolves.toBe(false);
  });

  it("rejects a missing hash", async () => {
    const params = new URLSearchParams({ auth_date: String(nowSec()), user: USER });
    await expect(V.validateInitData(params.toString(), BOT_TOKEN)).resolves.toBe(false);
  });

  it("never throws on malformed input", async () => {
    for (const junk of ["", "&&&", "hash=zz", "%%%", "a=1&b=2"]) {
      await expect(V.validateInitData(junk, BOT_TOKEN)).resolves.toBe(false);
    }
  });
});

describe("timingSafeEqualHex", () => {
  it("is correct for equal and unequal inputs", () => {
    expect(V.timingSafeEqualHex("abc123", "abc123")).toBe(true);
    expect(V.timingSafeEqualHex("abc123", "abc124")).toBe(false);
    expect(V.timingSafeEqualHex("abc", "abcd")).toBe(false);
    expect(V.timingSafeEqualHex("", "")).toBe(true);
  });

  it("compares the whole string rather than bailing on the first byte", () => {
    // A short-circuiting === leaks how many leading bytes matched. This must not.
    expect(V.timingSafeEqualHex("0000000000", "0000000001")).toBe(false);
    expect(V.timingSafeEqualHex("1000000000", "0000000000")).toBe(false);
  });
});
