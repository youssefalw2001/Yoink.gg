/**
 * YOINK.GG — "The Bag" · Reign Toll pure money math.
 *
 * Single source of truth for every SOL-moving calculation in the Reign Toll
 * feature of The Bag (the hidden-fuse king-of-the-hill game). It is **pure,
 * total, and side-effect-free**: the local simulation (`useGameState.ts`) calls
 * these functions today, and a future on-chain program would re-implement the
 * *same* arithmetic behind the `BAG_ESCROW_LIVE` seam. Deterministic + total =
 * the exact contract a settlement must honour, and trivially property-testable.
 *
 * NOTHING here reads time, randomness, storage, or the DOM.
 *
 * DECOUPLED FROM SIEGE: although The Bag and Siege share the internal tier ids
 * `pit/grind/arena/court`, this module defines its OWN `BagTierId` /
 * `BagSplitParams` and deliberately does NOT import `siegeMath`'s `TierParams`
 * or `TIER_PARAMS`. The two economies are separate sources of truth so a change
 * to one cannot silently alter the other.
 *
 * The fee split (basis points of the yoink fee, summing to 10000):
 *   bagBps     → the pot           = 8300 − tollBps  (tier-varying)
 *   tollBps    → outgoing King      (the Reign Toll)  (tier-varying)
 *   rakeBps    → house              = 1000  (UNCHANGED across tiers)
 *   jackpotBps → progressive jackpot = 500  (UNCHANGED across tiers)
 *   drainBps   → nominal drain line  = 200  (UNCHANGED across tiers)
 *
 * Identity: player-side (bagBps + tollBps) === 8300 for every tier, and
 * house-side (rakeBps + jackpotBps + drainBps) === 1700 for every tier — so the
 * toll is a pure rebalance out of the pot and the house edge is untouched.
 */

// ── Types (OWNED by The Bag — not imported from siegeMath) ────────────────────

/** A Bag room tier id. Mirrors `RoomId` but is owned by The Bag economy. */
export type BagTierId = "pit" | "grind" | "arena" | "court";

/** Immutable per-tier split parameters, in basis points of the fee. Published. */
export interface BagSplitParams {
  id: BagTierId;
  /** → the pot. Derived as 8300 − tollBps. */
  bagBps: number;
  /** → outgoing King (the Reign Toll). */
  tollBps: number;
  /** → house. UNCHANGED across tiers. */
  rakeBps: number;
  /** → progressive jackpot. UNCHANGED across tiers. */
  jackpotBps: number;
  /** → nominal drain line item. UNCHANGED across tiers. */
  drainBps: number;
}

/** Decomposition of one yoink fee, in SOL. By construction the parts sum to `fee`. */
export interface YoinkSplit {
  toBag: number;
  /** Credited to the King being dethroned. */
  toToll: number;
  toRake: number;
  toJackpot: number;
  toDrain: number;
}

/** Per-actor SOL deltas for one settled yoink (zero-sum by construction). */
export interface YoinkDeltas {
  /** The incoming King (payer): −fee. */
  payer: number;
  /** +toToll. */
  outgoingKing: number;
  /** +toBag. */
  bag: number;
  /** +toRake + toDrain. */
  house: number;
  /** +toJackpot. */
  jackpot: number;
}

// ── Published constants ───────────────────────────────────────────────────────

/** Per-room toll rate in basis points. Strictly increasing across tiers. */
export const TOLL_BPS_BY_ROOM: Record<BagTierId, number> = {
  pit: 400,
  grind: 600,
  arena: 700,
  court: 800,
};

/** Combined player-side share in bps (pot + toll), invariant across all tiers. */
export const PLAYER_SIDE_BPS = 8_300;

/** House-side line items in bps — identical across every tier. */
export const RAKE_BPS = 1_000;
export const JACKPOT_BPS = 500;
export const DRAIN_BPS = 200;

/**
 * Escrow seam — mirrors siege's `ESCROW_ENABLED`/`isEscrowLive`. When `false`
 * (default) the engine applies settlement deltas to local React state; when
 * `true` a future on-chain program would settle using the SAME bagMath
 * functions. Kept OFF for this feature.
 */
export const BAG_ESCROW_LIVE = false;

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Round a SOL amount to 6 decimal places (consistent with `bagAddFor`). */
function round6(n: number): number {
  return +n.toFixed(6);
}

/** A fee is only spendable when it is a finite, non-negative number. */
function validFee(fee: number): boolean {
  return Number.isFinite(fee) && fee >= 0;
}

/** The canonical Arena params used as the fallback for unknown room ids. */
function arenaParams(): BagSplitParams {
  return paramsFor("arena");
}

function paramsFor(id: BagTierId): BagSplitParams {
  const tollBps = TOLL_BPS_BY_ROOM[id];
  return {
    id,
    bagBps: PLAYER_SIDE_BPS - tollBps,
    tollBps,
    rakeBps: RAKE_BPS,
    jackpotBps: JACKPOT_BPS,
    drainBps: DRAIN_BPS,
  };
}

// ── Tier resolution ───────────────────────────────────────────────────────────

/**
 * Resolve the `BagSplitParams` for a room id. A valid `BagTierId` returns that
 * tier's params (five bps fields sum to 10000); any unknown/invalid id falls
 * back to the Arena params (mirrors `payouts.ts` `DEFAULT_CURVE`). Total.
 */
export function bagSplitParamsFor(roomId: string): BagSplitParams {
  if (roomId === "pit" || roomId === "grind" || roomId === "arena" || roomId === "court") {
    return paramsFor(roomId);
  }
  return arenaParams();
}

// ── Fee → component amounts ───────────────────────────────────────────────────

/**
 * The Reign Toll credited to the outgoing King: `fee · tollBps/10000`, rounded
 * to 6 dp and capped at `fee`. Returns 0 for a negative/non-finite fee.
 * Post: `0 ≤ tollFor(fee) ≤ fee`.
 */
export function tollFor(fee: number, p: BagSplitParams): number {
  if (!validFee(fee)) return 0;
  return Math.min(round6((fee * p.tollBps) / 10_000), fee);
}

/**
 * SOL that flows into the bag from a fee: `fee · bagBps/10000`, rounded to 6 dp.
 * Returns 0 for a negative/non-finite fee.
 */
export function bagAddFor(fee: number, p: BagSplitParams): number {
  if (!validFee(fee)) return 0;
  return round6((fee * p.bagBps) / 10_000);
}

/**
 * Split a yoink fee into its five destinations (all in SOL, 6 dp). For a valid
 * `fee ≥ 0` every part is `≥ 0`, the parts sum to `fee`, `toBag + toToll`
 * equals the 83% player-side share and `toRake + toJackpot + toDrain` equals
 * the 17% house-side share. A negative/non-finite fee yields all-zero parts.
 */
export function splitYoinkFee(fee: number, p: BagSplitParams): YoinkSplit {
  if (!validFee(fee)) {
    return { toBag: 0, toToll: 0, toRake: 0, toJackpot: 0, toDrain: 0 };
  }
  return {
    toBag: round6((fee * p.bagBps) / 10_000),
    toToll: Math.min(round6((fee * p.tollBps) / 10_000), fee),
    toRake: round6((fee * p.rakeBps) / 10_000),
    toJackpot: round6((fee * p.jackpotBps) / 10_000),
    toDrain: round6((fee * p.drainBps) / 10_000),
  };
}

// ── Settlement deltas (zero-sum by construction) ──────────────────────────────

/**
 * Per-actor deltas for one settled yoink. The payer (incoming King) loses the
 * fee; the outgoing King banks the toll; the bag, house, and jackpot take their
 * shares. Post: `payer + outgoingKing + bag + house + jackpot === 0`.
 */
export function settleYoink(fee: number, p: BagSplitParams): YoinkDeltas {
  const s = splitYoinkFee(fee, p);
  return {
    payer: validFee(fee) ? -fee : 0,
    outgoingKing: s.toToll,
    bag: s.toBag,
    house: round6(s.toRake + s.toDrain),
    jackpot: s.toJackpot,
  };
}

// ── House economics & anti-exploit ────────────────────────────────────────────

/**
 * House revenue per yoink as a fraction of the fee: `(rakeBps + drainBps)/10000`
 * = 0.12. Strictly positive. The toll and jackpot reserve are NOT house revenue.
 */
export function evHousePerYoink(p: BagSplitParams): number {
  return (p.rakeBps + p.drainBps) / 10_000;
}

/**
 * The maximum a closed colluding group can recover from `totalFees` of internal
 * yoinks: `totalFees · (1 − houseEdge)`, where `houseEdge = evHousePerYoink`.
 * The group's net is therefore `≤ −houseEdge · totalFees < 0` for `totalFees > 0`.
 */
export function collusionFloor(totalFees: number, p: BagSplitParams): number {
  if (!validFee(totalFees)) return 0;
  return round6(totalFees * (1 - evHousePerYoink(p)));
}

/**
 * Combined player-side share in bps (`bagBps + tollBps`). Invariant === 8300 for
 * every tier — the identity that makes the toll "free" to players.
 */
export function playerSideBps(p: BagSplitParams): number {
  return p.bagBps + p.tollBps;
}
