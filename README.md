# YOINK.GG

Two Solana-themed PvP games in one app. Built with Vite + React 19 + TypeScript,
Tailwind v4 and Framer Motion.

> **Stakes are simulated.** Nothing in this build settles on-chain: `ESCROW_ENABLED`
> and `BAG_ESCROW_LIVE` are both `false`, and no instruction is ever submitted. The
> only real chain interaction is connecting a wallet and reading its balance —
> which moves zero funds. All balances, payouts and leaderboards are computed in
> the browser and persisted to `localStorage`.

---

## The games

### Wallet Wars — "Siege the Vault" (flagship)

An asymmetric defender-vs-raider yield marketplace. The pitch: *in every other app
the house wins — here you can be the house.*

- A **Vault Lord** deploys SOL into a vault (corpus `V`) and becomes a fee-earning
  target. Every siege that fails against them banks a toll.
- A **Siege Runner** pays an attempt fee `F = f·V·m_k` — a fraction of the *target's*
  vault, not a matched wager. That fee is the only thing at risk per attempt.
- A crack succeeds at a **fixed, published per-tier probability** and pays a **slice**
  `s·V·m_k` of the target's corpus (roughly 10× the fee). The vault is then shielded
  for 6s.
- Four tiers by vault size: **The Pit** (0.1–1) · **The Grind** (1–5) · **The Arena**
  (5–20) · **King's Court** (20+). You may siege your own tier or punch *up*, never down.
- A survival streak scales both fee and slice: `m_k = 1 + 0.04·min(k, 25)`.
- **Variable-Risk Vaults** — at open time the owner locks a profile: Fortified
  (κ=0.6), Standard (κ=1.0) or Exposed (κ=1.5). This scales the crack odds
  `p' = p·κ` and re-derives the fee so **defender EV is held exactly constant**. The
  profile trades variance, never edge.

By design: `evRaider < 0`, `evDefender ≥ 0`, `evHouse > 0` — all asserted by property
tests in [`src/lib/siegeMath.test.ts`](src/lib/siegeMath.test.ts).

### The Bag — king of the hill (launch-gated)

Yoink the bag to become King. A **hidden fuse** — redrawn on *every* yoink and never
shown as a number — ends the round; the last King standing wins. Each yoink escalates
the fee, and the dethroned King instantly banks a **Reign Toll**. Payouts split across
King, runner-up, podium and a held-time pool, plus a progressive jackpot.

Currently behind `BAG_COMING_SOON` in [`src/lib/featureFlags.ts`](src/lib/featureFlags.ts).
Flip that flag to `false` to restore it — no other change needed.

---

## Architecture

```
src/
  App.tsx              Single-file router: screen state + AnimatePresence, no react-router
  lib/
    siegeMath.ts       FROZEN pure economy for Wallet Wars (tier params, fees, prizes, EV, risk profiles)
    bagMath.ts         FROZEN pure economy for The Bag (83/10/5/2 fee split, Reign Toll bps)
    walletWarsState.ts Siege engine: pure transitions + useWalletWars hook + bot sim + persistence
    walletWarsSync.ts  Multi-tab leader lease so two tabs can't clobber one vault
    payouts.ts         Bag payout curves    referral.ts   House-rake-only referral split
    reignToll.ts       Toll accrual         jackpot.ts    Progressive jackpot
    walletWarsChain.ts On-chain escrow seam (guarded stubs; ESCROW_ENABLED = false)
  hooks/               useGameState (Bag engine) · usePlayerProgress · useReferral · useFreeRound · useRoomInstances
  components/          game/ · walletwars/ · leaderboard/ · shop/ · reveal/ · layout/ · ui/
solana/                Anchor workspace — SCAFFOLD ONLY, not deployed (see caveat below)
```

### Conventions

These are enforced by the specs in `.kiro/specs/` and by the test suite:

1. **All SOL math lives in the pure modules** (`siegeMath.ts` / `bagMath.ts`). Engines
   and components never do inline payout arithmetic.
2. **The two economies are decoupled.** `bagMath` owns its own tier types and must not
   import from `siegeMath`.
3. **Pure core first.** Land the pure math, thread it through the engine, then the UI —
   the app must typecheck and build at every step.
4. **No silent failures.** Engine actions return discriminated unions with typed,
   precedence-ordered rejection reasons, never a bare `null`/`false`.
5. **Property tests with fast-check**, ≥100 runs, named
   `Feature: <spec>, Property N: <name>`, each citing the requirement it validates.
6. **Presentation is Framer Motion only** — transform/opacity, honouring
   `prefers-reduced-motion`. Lucide icons, no emojis.

---

## Getting started

```bash
npm ci
npm run dev            # dev server
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` then production bundle to `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | `tsc --noEmit` |
| `npm test` | `vitest run` — the economy/fairness property suite |
| `npm run deploy:cf` | `wrangler deploy` (Cloudflare static assets) |

### Environment

Copy `.env.example` to `.env`. Both variables are optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SOLANA_NETWORK` | `devnet` | Network label + default RPC |
| `VITE_SOLANA_RPC` | cluster default | Custom RPC endpoint |

### Deployment

Two independent paths, both from `main`:

- **GitHub Pages** — `.github/workflows/deploy.yml` (typecheck → test → build → deploy).
- **Cloudflare Workers** — `npm run deploy:cf`, static assets with SPA fallback.

`vite.config.ts` sets `base: "./"` so the bundle works from a sub-path and inside the
Phantom in-app browser.

> ⚠️ **Do not add `bs58`, `@solana/*`, or the node polyfills to `manualChunks`.**
> Splitting them breaks initialisation order and crashes `publicKey.toBase58()` at
> runtime. See the comment block in `vite.config.ts`.

---

## Known caveats

Worth reading before you touch these areas:

- **`solana/` is not deployed.** Both programs carry placeholder IDs
  (`KBagXXXX…`, `WWarsXXXX…`) and the frontend never calls them.
- **`programs/wallet-wars` is economically stale.** It implements the pre-rework model
  (50/50 matched stakes, flat 15% rake) and does *not* match the current asymmetric
  siege economy in `siegeMath.ts`. It needs a rewrite before any deployment.
  `programs/kings-bag` likewise lacks the hidden fuse, Reign Toll and tiered payouts.
- **Fairness is commit–reveal, not VRF.** Seeds are generated client-side. Outcomes are
  recomputable and verifiable (`verifySiege`), but not trustless — that requires the
  on-chain program. The in-app trust badge states this limitation explicitly.
- **Board activity is simulated.** Bot vaults, ambient sieges, seeded leaderboards and
  referral accrual are all local simulation. Ambient events are tagged `simulated` in
  the war feed.
- **Progress is per-browser.** Everything lives in `localStorage`; there is no backend.
  A `supabase/` schema exists but nothing in `src/` imports it.
