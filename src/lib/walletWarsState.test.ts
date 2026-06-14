/**
 * Integration tests for the Siege engine state transitions (Task 3.8).
 *
 * Feature: wallet-wars-siege-economy
 *
 * Drives the PURE, deterministic engine core (`openVaultState` → `resolveSiege`)
 * and asserts:
 *   - Conservation: Δraider + Δdefender + Δhouse + Δcorpus = 0 (± fp tolerance)
 *     across a settled loss and a settled win.
 *   - The 0.01 SOL corpus floor holds on a crack that would slice below it.
 *   - Each typed rejection reason fires for its own precondition with NO state
 *     change (the engine never fails silently).
 *
 * Validates: Requirements 5.1, 4.4, 19.4 (+ 2.3, 2.4, 2.5, 16.x, 20.2 rejections).
 */

import { describe, it, expect } from "vitest";

import {
  WAR_CONFIG,
  type WarState,
  type Vault,
  openVaultState,
  resolveSiege,
  rollFromSeed,
  createInitialState,
} from "./walletWarsState";
import { tierParamsFor } from "./siegeMath";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeVault(over: Partial<Vault>): Vault {
  return {
    id: "v",
    wallet: "0xbot",
    isYou: false,
    amount: 10,
    banked: 0,
    survived: 0,
    cracked: 0,
    streak: 0,
    openedAt: 0,
    shieldUntil: 0,
    seq: 0,
    compound: true,
    bountyPool: 0,
    bountyExpiry: 0,
    ...over,
  };
}

function bareState(you: Vault | null, stashes: Vault[]): WarState {
  return { stashes, you, feed: [], totalBanked: 1000, biggestHeist: 0, raidCooldownUntil: 0 };
}

/** Find the first seed `s{i}` whose roll lands the desired outcome for `pWin`. */
function seedFor(outcome: "win" | "loss", pWin: number): string {
  for (let i = 0; i < 100_000; i++) {
    const seed = `s${i}`;
    const win = rollFromSeed(seed) < pWin;
    if ((outcome === "win") === win) return seed;
  }
  throw new Error(`no seed found for ${outcome} @ p=${pWin}`);
}

/** The four-way conservation residual for a single settled siege. */
function conservationResidual(before: WarState, after: WarState, targetId: string): number {
  const tBefore = before.stashes.find((v) => v.id === targetId)!;
  const tAfter = after.stashes.find((v) => v.id === targetId)!;
  const dRaider = after.you!.amount - before.you!.amount;
  const dDefenderBanked = tAfter.banked - tBefore.banked;
  const dCorpus = tAfter.amount - tBefore.amount;
  const dHouse = after.totalBanked - before.totalBanked;
  return dRaider + dDefenderBanked + dCorpus + dHouse;
}

// ── 3.8 Conservation across a real loss + win settlement ──────────────────────

describe("siege settlement conserves SOL (Property 1 / Req 5.1)", () => {
  it("a losing then a winning siege each net to zero across raider/defender/house/corpus", () => {
    // Arena tier on both sides (5–20 SOL), no bounty so the escrow term is absent.
    const params = tierParamsFor(15);
    const you = makeVault({ id: "you", wallet: "You", isYou: true, amount: 10, compound: true });
    const target = makeVault({ id: "tgt", wallet: "0xdef", amount: 15, compound: true });
    const s0 = bareState(you, [target]);

    // ── Siege #1: a LOSS (roll ≥ p) ──
    const lossSeed = seedFor("loss", params.winChance);
    const r1 = resolveSiege(s0, "tgt", { at: 1_000, seed: lossSeed, taxMult: 0 });
    expect(r1.resolution.ok).toBe(true);
    if (!r1.resolution.ok) return;
    expect(r1.resolution.result.outcome).toBe("loss");
    expect(Math.abs(conservationResidual(s0, r1.state, "tgt"))).toBeLessThan(1e-9);

    // ── Siege #2: a WIN (roll < p), after the shield + cooldown elapse ──
    const at2 = 1_000 + WAR_CONFIG.SHIELD_MS + WAR_CONFIG.RAID_COOLDOWN_MS + 1;
    const winSeed = seedFor("win", params.winChance);
    const r2 = resolveSiege(r1.state, "tgt", { at: at2, seed: winSeed, taxMult: 0 });
    expect(r2.resolution.ok).toBe(true);
    if (!r2.resolution.ok) return;
    expect(r2.resolution.result.outcome).toBe("win");
    expect(r2.resolution.result.seized).toBeGreaterThan(0);
    expect(Math.abs(conservationResidual(r1.state, r2.state, "tgt"))).toBeLessThan(1e-9);
  });

  it("keeps the corpus at or above the 0.01 SOL floor when a crack would slice below it (Req 4.4 / 19.4)", () => {
    const params = tierParamsFor(0.01); // Pit
    const you = makeVault({ id: "you", wallet: "You", isYou: true, amount: 0.5 });
    // compound off so we can read the clamped corpus directly.
    const tiny = makeVault({ id: "tiny", wallet: "0xtiny", amount: 0.01, compound: false });
    const s0 = bareState(you, [tiny]);

    const winSeed = seedFor("win", params.winChance);
    const r = resolveSiege(s0, "tiny", { at: 1, seed: winSeed, taxMult: 0 });
    expect(r.resolution.ok).toBe(true);
    if (!r.resolution.ok) return;
    expect(r.resolution.result.outcome).toBe("win");
    const after = r.state.stashes.find((v) => v.id === "tiny")!;
    expect(after.amount).toBeGreaterThanOrEqual(WAR_CONFIG.CORPUS_FLOOR - 1e-12);
  });
});

// ── 3.8 Every rejection reason fires for its precondition, with no state change ─

describe("siege preconditions reject with a typed reason and no state change", () => {
  const you = makeVault({ id: "you", wallet: "You", isYou: true, amount: 10 });

  it("cooldown — when the raid cooldown has not elapsed", () => {
    const target = makeVault({ id: "t", amount: 12 });
    const s = { ...bareState(you, [target]), raidCooldownUntil: 5_000 };
    const r = resolveSiege(s, "t", { at: 1_000, seed: "x", taxMult: 0 });
    expect(r.resolution.ok).toBe(false);
    if (r.resolution.ok) return;
    expect(r.resolution.reason.kind).toBe("cooldown");
    expect(r.state).toBe(s); // identity: no state change
  });

  it("shielded — when the target's shield has not expired", () => {
    const target = makeVault({ id: "t", amount: 12, shieldUntil: 9_000 });
    const s = bareState(you, [target]);
    const r = resolveSiege(s, "t", { at: 1_000, seed: "x", taxMult: 0 });
    expect(r.resolution.ok).toBe(false);
    if (r.resolution.ok) return;
    expect(r.resolution.reason.kind).toBe("shielded");
    expect(r.state).toBe(s);
  });

  it("self_siege — when the target is the player's own vault", () => {
    const ownOnBoard = makeVault({ id: "me2", wallet: "You", isYou: true, amount: 12 });
    const s = bareState(you, [ownOnBoard]);
    const r = resolveSiege(s, "me2", { at: 1_000, seed: "x", taxMult: 0 });
    expect(r.resolution.ok).toBe(false);
    if (r.resolution.ok) return;
    expect(r.resolution.reason.kind).toBe("self_siege");
    expect(r.state).toBe(s);
  });

  it("tier_mismatch — when the target is in a different weight class", () => {
    const target = makeVault({ id: "t", amount: 0.5 }); // Pit vs your Arena (10)
    const s = bareState(you, [target]);
    const r = resolveSiege(s, "t", { at: 1_000, seed: "x", taxMult: 0 });
    expect(r.resolution.ok).toBe(false);
    if (r.resolution.ok) return;
    expect(r.resolution.reason.kind).toBe("tier_mismatch");
    expect(r.state).toBe(s);
  });

  it("insufficient_funds — when the fee exceeds the raider's corpus", () => {
    // Both Pit, but the raider corpus is below the attempt fee.
    const brokeYou = makeVault({ id: "you", wallet: "You", isYou: true, amount: 0.001 });
    const target = makeVault({ id: "t", amount: 0.9 }); // Pit
    const s = bareState(brokeYou, [target]);
    const r = resolveSiege(s, "t", { at: 1_000, seed: "x", taxMult: 0 });
    expect(r.resolution.ok).toBe(false);
    if (r.resolution.ok) return;
    expect(r.resolution.reason.kind).toBe("insufficient_funds");
    expect(r.state).toBe(s);
  });
});

// ── openVault basics ──────────────────────────────────────────────────────────

describe("openVaultState", () => {
  it("creates an owned vault with reset counters and excludes it from the board", () => {
    const base = createInitialState();
    const opened = openVaultState(base, 5, 42);
    expect(opened.you).not.toBeNull();
    expect(opened.you!.isYou).toBe(true);
    expect(opened.you!.amount).toBe(5);
    expect(opened.you!.banked).toBe(0);
    expect(opened.you!.streak).toBe(0);
    expect(opened.you!.seq).toBe(0);
    expect(opened.you!.compound).toBe(true);
    expect(opened.you!.openedAt).toBe(42);
    // The player's vault is held separately, never in the targetable board.
    expect(opened.stashes.some((v) => v.isYou)).toBe(false);
  });

  it("is a no-op when a vault is already open", () => {
    const base = openVaultState(createInitialState(), 5, 1);
    const again = openVaultState(base, 20, 2);
    expect(again.you!.amount).toBe(5);
  });
});
