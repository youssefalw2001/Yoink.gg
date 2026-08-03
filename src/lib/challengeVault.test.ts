/**
 * Challenge-vault injection tests.
 *
 * A challenge link puts a stranger-described vault onto the local board, so this
 * covers idempotency (refresh / StrictMode double-invoke must not stack
 * duplicates), defensive clamping, and — most importantly — that an injected
 * vault behaves like any other board vault in the audited engine.
 */

import { describe, it, expect } from "vitest";
import {
  addChallengeVaultState,
  resolveSiege,
  openVaultState,
  tierIndexForAmount,
  CHALLENGE_VAULT_PREFIX,
  type WarState,
} from "./walletWarsState";
import { feeMultiplierForStreak, STREAK_CFG, vaultParamsFor } from "./siegeMath";

const AT = 1_700_000_000_000;

function emptyState(): WarState {
  return {
    stashes: [], you: null, feed: [], totalBanked: 0, biggestHeist: 0, raidCooldownUntil: 0,
  };
}

const CH = { amount: 5, profile: "exposed" as const, label: "7xKp…mR3q" };

describe("addChallengeVaultState", () => {
  it("puts the challenger's vault at the head of the board", () => {
    const s = addChallengeVaultState(emptyState(), CH, AT);
    expect(s.stashes).toHaveLength(1);
    expect(s.stashes[0].id.startsWith(CHALLENGE_VAULT_PREFIX)).toBe(true);
    expect(s.stashes[0].wallet).toBe(CH.label);
    expect(s.stashes[0].amount).toBe(5);
    expect(s.stashes[0].riskProfile).toBe("exposed");
    expect(s.stashes[0].isYou).toBe(false);
  });

  it("is idempotent for the same challenger + corpus", () => {
    // A refresh, or React StrictMode invoking the effect twice, must not stack
    // duplicate vaults onto the board.
    const once = addChallengeVaultState(emptyState(), CH, AT);
    const twice = addChallengeVaultState(once, CH, AT);
    expect(twice).toBe(once); // same reference → no state churn
    expect(twice.stashes).toHaveLength(1);
  });

  it("allows a genuinely different challenge through", () => {
    const a = addChallengeVaultState(emptyState(), CH, AT);
    const b = addChallengeVaultState(a, { ...CH, amount: 9 }, AT);
    expect(b.stashes).toHaveLength(2);
    const c = addChallengeVaultState(b, { ...CH, label: "Someone else" }, AT);
    expect(c.stashes).toHaveLength(3);
  });

  it("starts pristine so advertised economics are the plain published numbers", () => {
    // A non-zero streak would scale BOTH fee and slice by m_k, so the recipient
    // would be shown different numbers than the challenger published.
    const v = addChallengeVaultState(emptyState(), CH, AT).stashes[0];
    expect(v.streak).toBe(0);
    expect(feeMultiplierForStreak(v.streak, STREAK_CFG)).toBe(1);
    expect(v.banked).toBe(0);
    expect(v.shieldUntil).toBe(0);
    expect(v.bountyPool).toBe(0);
  });

  it("clamps a non-finite or sub-floor corpus instead of trusting it", () => {
    for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const v = addChallengeVaultState(emptyState(), { ...CH, amount: bad }, AT).stashes[0];
      expect(v.amount).toBeGreaterThanOrEqual(0.1);
      expect(Number.isFinite(v.amount)).toBe(true);
    }
  });

  it("falls back to Standard for an invalid risk profile", () => {
    const v = addChallengeVaultState(
      emptyState(),
      { ...CH, profile: "godmode" as unknown as typeof CH.profile },
      AT,
    ).stashes[0];
    expect(v.riskProfile).toBe("standard");
  });

  it("truncates a long label", () => {
    const v = addChallengeVaultState(emptyState(), { ...CH, label: "x".repeat(200) }, AT).stashes[0];
    expect(v.wallet.length).toBeLessThanOrEqual(24);
  });

  it("preserves existing board vaults", () => {
    const base = addChallengeVaultState(emptyState(), { ...CH, label: "First" }, AT);
    const next = addChallengeVaultState(base, { ...CH, label: "Second" }, AT);
    expect(next.stashes.map((s) => s.wallet)).toContain("First");
    expect(next.stashes[0].wallet).toBe("Second"); // newest at the head
  });
});

describe("an injected challenge vault is a first-class board vault", () => {
  it("is siegeable through the ordinary audited engine", () => {
    // The whole point of injecting rather than special-casing: resolveSiege,
    // tier gating, tolls, shields and the feed all work unchanged.
    let s = openVaultState(emptyState(), 5, "standard", AT);
    s = addChallengeVaultState(s, CH, AT);
    const target = s.stashes.find((v) => v.id.startsWith(CHALLENGE_VAULT_PREFIX))!;

    const { resolution, state: after } = resolveSiege(s, target.id, {
      at: AT + 1, seed: "challenge-seed", taxMult: 0,
    });

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    // Real published odds for the challenger's declared profile.
    expect(resolution.result.pWin).toBe(vaultParamsFor(CH.amount, CH.profile).winChance);
    // Settlement happened: a feed event exists and the target is now shielded.
    expect(after.feed.length).toBeGreaterThan(0);
    const settled = after.stashes.find((v) => v.id === target.id)!;
    expect(settled.shieldUntil).toBeGreaterThan(AT);
  });

  it("respects raid-up: a Pit player cannot punch down at it", () => {
    // Same rule as any other vault — no bespoke exemption for challenges.
    let s = openVaultState(emptyState(), 20, "standard", AT); // Court player
    s = addChallengeVaultState(s, { ...CH, amount: 0.5 }, AT); // Pit challenge
    const target = s.stashes.find((v) => v.id.startsWith(CHALLENGE_VAULT_PREFIX))!;
    expect(tierIndexForAmount(target.amount)).toBeLessThan(tierIndexForAmount(20));

    const { resolution } = resolveSiege(s, target.id, { at: AT + 1, seed: "s", taxMult: 0 });
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.reason.kind).toBe("tier_mismatch");
  });
});
