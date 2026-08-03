/**
 * YOINK.GG — Wallet Wars Screen (two-sided yield marketplace)
 *
 * The flagship two-sided experience, split into two role tabs:
 *   BUILD (Vault Lord terminal) — open a vault, become the house, earn fees.
 *   HUNT  (Siege Runner board)  — find a whale vault and crack it for 10×.
 *
 * Orchestration only — the asymmetric "Siege the Vault" engine + the frozen
 * economy live in lib/walletWarsState.ts + lib/siegeMath.ts. ESCROW_ENABLED is
 * false (local sim).
 *
 * Layout (top → bottom): hero → BUILD/HUNT selector → persistent Position
 * status bar → the active tab → war feed (Lords/Runners filters) → war boards.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LineChart, Crosshair, Radio, Crown, Swords } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { SnatchIcon } from "@/components/ui/YoinkLogo";
import {
  useWalletWars, tierIndexForAmount,
  type SiegeResolution, type Vault as VaultModel, type RaidEvent,
} from "@/lib/walletWarsState";
import { useWallet } from "@/lib/wallet";
import {
  loadRole, saveRole, tabForRole, roleForTab, type WarTab, type WarRole,
  loadRunnerStats, saveRunnerStats, recordSiege, type RunnerStats,
} from "@/lib/walletWarsRole";
import { opportunityScore } from "@/lib/walletWarsActivity";
import { vaultEconomics } from "./riskProfilePresentation";
import { BuildTab } from "./BuildTab";
import { HuntTab } from "./HuntTab";
import { CrownTab } from "./CrownTab";
import { SiegeModal } from "./SiegeModal";
import { WarFeed } from "./WarFeed";
import { PositionStatusBar, type LastSiege } from "./PositionStatusBar";
import { RoleOnboarding } from "./RoleOnboarding";
import { useEarningsLedger } from "./useEarningsLedger";
import { type UseReferral } from "@/hooks/useReferral";
import { useFreeSiege } from "@/hooks/useFreeRound";
import { makeTrainingVault, freeSiegeResolution } from "@/lib/freeSiege";
import {
  parseChallengeFromUrl, challengeLink, challengeShareText, CHALLENGE_PARAM,
} from "@/lib/challengeLink";
import { formatSol, truncateAddress } from "@/lib/utils";
import type { RiskProfile } from "@/lib/siegeMath";

const ONBOARD_KEY = "yoink_ww_onboarded_v2";

/** The three sub-tabs. Build/Hunt map to roles; Crown is role-agnostic. */
type ScreenTab = WarTab | "crown";
type FeedView = "lords" | "runners";

/** Pure war-feed split: Lords see fee-banking + survival; Runners see cracks. */
function filterFeed(events: RaidEvent[], view: FeedView): RaidEvent[] {
  return events.filter((e) => {
    if (view === "runners") return e.outcome === "win";
    return e.kind === "refund" || e.outcome === "loss"; // lords: fee banking
  });
}

export function WalletWarsScreen({
  war,
  referral,
  displayName = "",
  avatarVariant = null,
  avatarColor = null,
}: {
  war: ReturnType<typeof useWalletWars>;
  referral: UseReferral;
  displayName?: string;
  avatarVariant?: number | null;
  avatarColor?: string | null;
}) {
  const { state, openVault, cashOut, withdrawBanked, setCompound, setRiskProfile, siege, repeatTaxMult } = war;
  const { walletBalance, publicKey } = useWallet();

  const avatarSeed = publicKey ?? (displayName || "You");

  // Which side are we playing? Default from the landing-card choice.
  const [tab, setTab] = useState<ScreenTab>(() => tabForRole(loadRole() ?? "runner"));
  const role: WarRole = tab === "crown" ? (loadRole() ?? "runner") : roleForTab(tab);

  const [raidTargetId, setRaidTargetId] = useState<string | null>(null);
  /**
   * FREE-SIEGE ON-RAMP. Separate from `raidTargetId` because a free siege has no
   * board target and — critically — no `state.you` requirement, so it must not
   * flow through `canRaidStash`. This is the seam that lets a first-time visitor
   * play before committing any capital.
   */
  const freeSiege = useFreeSiege();
  const [freeSiegeOpen, setFreeSiegeOpen] = useState(false);
  /**
   * Bumped to force-remount the free SiegeModal. `SiegeModal` owns its own
   * `select → strain → result` phase state, so "Siege again" can only work by
   * giving it a fresh key — without this the button would appear live and do
   * nothing.
   */
  const [freeSiegeSeq, setFreeSiegeSeq] = useState(0);
  const [runnerStats, setRunnerStats] = useState<RunnerStats>(() => loadRunnerStats());
  const [lastSiege, setLastSiege] = useState<LastSiege | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  /** Label of an inbound challenger, for the "you've been challenged" banner. */
  const [challengeLabel, setChallengeLabel] = useState<string | null>(null);
  /** Challenge vault awaiting an auto-opened siege once it becomes raidable. */
  const [pendingChallengeId, setPendingChallengeId] = useState<string | null>(null);

  // War-feed filter follows the active tab by default; manual pills override.
  const [feedView, setFeedView] = useState<FeedView>(role === "lord" ? "lords" : "runners");
  useEffect(() => { if (tab !== "crown") setFeedView(roleForTab(tab) === "lord" ? "lords" : "runners"); }, [tab]);

  // Single earnings ledger (avoid double-counting feesEarned deltas).
  const earnings = useEarningsLedger(state.you?.id ?? null, state.you?.feesEarned ?? 0);

  // First-run, role-branched onboarding (once per browser).
  useEffect(() => {
    try { if (localStorage.getItem(ONBOARD_KEY) !== "1") setShowOnboarding(true); } catch { /* private mode */ }
  }, []);

  /**
   * INBOUND CHALLENGE LINK ("crack my vault").
   *
   * The link is self-describing (corpus + published risk profile + label), so we
   * rebuild the challenger's vault locally and put it on the board — see
   * `addChallengeVaultState` for why injection beats a bespoke siege path.
   *
   * The URL parameter is stripped immediately afterwards so a refresh cannot
   * stack duplicate vaults and so the address bar stops advertising a challenge
   * that has already been accepted. Runs once; `addChallengeVault` is itself
   * idempotent as a second line of defence against a StrictMode double-invoke.
   */
  const challengeHandled = useRef(false);
  useEffect(() => {
    if (challengeHandled.current) return;
    challengeHandled.current = true;

    const challenge = parseChallengeFromUrl();
    if (!challenge) return;

    const id = war.addChallengeVault(challenge);
    setChallengeLabel(challenge.label);
    // Land the player on the board that contains the vault they were sent.
    setTab("hunt");
    saveRole("runner");
    if (id) {
      setHighlightId(id);
      setPendingChallengeId(id);
    }

    // Drop ?c= (keep any other params, e.g. ?ref=) without a reload.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(CHALLENGE_PARAM);
      window.history.replaceState({}, "", url.toString());
    } catch { /* non-browser or blocked history API — harmless */ }
  }, [war]);

  /**
   * Once the challenge vault is on the board, open the siege automatically — but
   * ONLY if the player can actually raid it. Auto-opening a modal whose commit
   * button is disabled (no vault, or the fee exceeds their corpus) would be a
   * dead end, so in that case the vault stays highlighted with a banner instead.
   */
  useEffect(() => {
    if (!pendingChallengeId) return;
    const v = state.stashes.find((s) => s.id === pendingChallengeId);
    if (!v) { setPendingChallengeId(null); return; }
    if (canRaidStash(v)) {
      setRaidTargetId(pendingChallengeId);
      setPendingChallengeId(null);
    }
  }, [pendingChallengeId, state.stashes, state.you]);

  function switchTab(next: ScreenTab) {
    setTab(next);
    if (next !== "crown") saveRole(roleForTab(next));
    setLastSiege(null);
  }

  // ── Fee feedback: your vault survives a raid → reflected in the status bar
  // ("X SOL banked today") and the war feed. No popup toast (kept calm).

  const target = useMemo(() => state.stashes.find((s) => s.id === raidTargetId) ?? null, [state.stashes, raidTargetId]);

  function canRaidStash(s: VaultModel): boolean {
    if (!state.you) return false;
    // Raid up: you may siege your own tier or any HIGHER tier; never punch down.
    if (tierIndexForAmount(s.amount) < tierIndexForAmount(state.you.amount)) return false;
    if (Date.now() < s.shieldUntil) return false;
    // Affordable: the target-scaled fee must fit your corpus (the natural governor).
    return vaultEconomics(s).feeRisked <= state.you.amount;
  }

  // Best opportunity (for onboarding highlight) — highest value score on the board.
  const bestTargetId = useMemo(() => {
    let bestId: string | null = null;
    let bestScore = -Infinity;
    for (const s of state.stashes) {
      if (s.isYou) continue;
      const econ = vaultEconomics(s);
      const score = opportunityScore({
        crackChance: econ.crackChance, sliceWon: econ.sliceWon, feeRisked: econ.feeRisked,
        sizeSol: s.amount, bountyPool: s.bountyPool ?? 0, streak: s.streak, idleMs: 0,
        shielded: Date.now() < s.shieldUntil,
      });
      if (score > bestScore) { bestScore = score; bestId = s.id; }
    }
    return bestId;
  }, [state.stashes]);

  function dismissOnboarding() {
    setShowOnboarding(false);
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch { /* ignore */ }
    const r = loadRole() ?? role;
    if (r === "lord") {
      switchTab("build");
    } else {
      switchTab("hunt");
      setHighlightId(bestTargetId);
      window.setTimeout(() => setHighlightId(null), 6000);
    }
  }

  // ── Siege flow ───────────────────────────────────────────────────────────────
  function handleSiege(id: string) {
    const s = state.stashes.find((x) => x.id === id);
    if (!s || !canRaidStash(s)) return;
    setRaidTargetId(id);
  }

  function handleSiegeCommit(): SiegeResolution {
    if (!target) return { ok: false, reason: { kind: "self_siege" } };
    // Pass the player's referral context so any referrer cut is carved from the
    // house rake INSIDE resolveSiege (the raider fee + defender toll are untouched).
    const { resolution, referral: refOut } = siege(target.id, referral.myReferralContext());
    if (resolution.ok) {
      const r = resolution.result;
      setLastSiege({ outcome: r.outcome, roll: r.roll, needed: r.pWin, seized: r.seized });
      setRunnerStats((prev) => {
        const next = recordSiege(prev, r.outcome, r.seized);
        saveRunnerStats(next);
        return next;
      });
      if (refOut && refOut.cut > 0) referral.recordSentToReferrer(refOut.cut);
    }
    return resolution;
  }

  // ── Free-siege flow (no wallet, no vault, nothing risked) ───────────────────

  /** The synthetic house training vault a free siege targets. Never on the board. */
  const trainingVault = useMemo(() => makeTrainingVault(Date.now()), []);

  /**
   * Settle a free siege. The quota + house promo pool live in `useFreeSiege`;
   * this only adapts the outcome into the paid flow's `SiegeResolution` and
   * records the attempt in the player's Runner stats so free play still builds
   * progression (the reason to come back tomorrow).
   */
  function handleFreeSiegeCommit(): SiegeResolution {
    const result = freeSiege.claim();
    const resolution = freeSiegeResolution(result, freeSiege.nextResetMins);
    if (resolution.ok) {
      const r = resolution.result;
      setLastSiege({ outcome: r.outcome, roll: r.roll, needed: r.pWin, seized: r.seized });
      setRunnerStats((prev) => {
        const next = recordSiege(prev, r.outcome, r.seized);
        saveRunnerStats(next);
        return next;
      });
    }
    return resolution;
  }

  /** Loop the runner into the next best raidable target (same/higher tier, affordable, unshielded). */
  function handleSiegeAgain() {
    if (!state.you) { setRaidTargetId(null); return; }
    const myTier = tierIndexForAmount(state.you.amount);
    const corpus = state.you.amount;
    const candidates = state.stashes
      .filter((s) => !s.isYou && s.id !== raidTargetId && tierIndexForAmount(s.amount) >= myTier && Date.now() >= s.shieldUntil && vaultEconomics(s).feeRisked <= corpus)
      .sort((a, b) => b.amount - a.amount);
    setRaidTargetId(candidates[0]?.id ?? null);
  }

  // Clear the lastSiege line when the player changes their vault posture.
  function handleOpen(amount: number, profile: Parameters<typeof openVault>[1]) {
    setLastSiege(null);
    referral.noteStake(amount); // updates the player's largest-stake cap basis
    openVault(amount, profile);
  }
  function handleClose() { setLastSiege(null); cashOut(); }

  const filteredFeed = useMemo(() => filterFeed(state.feed, feedView), [state.feed, feedView]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <AnimatePresence>
        {showOnboarding && <RoleOnboarding role={loadRole() ?? role} onDone={dismissOnboarding} />}
      </AnimatePresence>

      {/* hero */}
      <div className="relative mb-5 overflow-hidden rounded-[24px]" style={{ background: "linear-gradient(150deg, #120a1f 0%, #08080f 55%, #1a0810 100%)" }}>
        <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #7000FF 30%, #FFD700 50%, #FF2200 70%, transparent)" }} aria-hidden />
        <div className="relative z-10 flex flex-col items-center gap-2 px-6 py-5 text-center">
          <div className="flex items-center gap-3">
            <SnatchIcon size={40} variant="gold" pulse />
            <h1 className="font-display font-black leading-none tracking-tight" style={{ fontSize: "clamp(1.6rem, 5vw, 2.2rem)" }}>
              <span className="text-white">WALLET </span><span style={{ color: "#FF2200" }}>WARS</span>
            </h1>
          </div>
          <p className="max-w-md font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-slate">
            In every other app the house wins. <span className="gold-text-gradient font-bold">Here you can be the house.</span>
          </p>
        </div>
      </div>

      {/* BUILD / HUNT / CROWN selector */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <TabButton active={tab === "build"} onClick={() => switchTab("build")} accent="#7000FF" icon={<LineChart className="h-4 w-4" aria-hidden />} label="Build" sublabel="Vault Lord" />
        <TabButton active={tab === "hunt"} onClick={() => switchTab("hunt")} accent="#FF2200" icon={<Crosshair className="h-4 w-4" aria-hidden />} label="Hunt" sublabel="Siege Runner" />
        <TabButton active={tab === "crown"} onClick={() => switchTab("crown")} accent="#FFD700" icon={<Crown className="h-4 w-4" aria-hidden />} label="Crown" sublabel="Referrals" />
      </div>

      {/* inbound challenge banner — shown when a challenge link could not be
          auto-opened (no vault yet, or the fee exceeds the player's corpus). */}
      {challengeLabel && pendingChallengeId && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-3 rounded-2xl border border-blood/30 bg-blood/[0.07] px-4 py-3"
        >
          <Swords className="h-4 w-4 shrink-0 text-blood" aria-hidden />
          <div className="flex flex-1 flex-col">
            <span className="font-display text-xs font-black uppercase tracking-[0.08em] text-blood">
              {challengeLabel} challenged you
            </span>
            <span className="font-mono text-[10px] leading-relaxed text-slate">
              Their vault is at the top of your board. Take a free siege to warm
              up, or open a vault to hit it for real.
            </span>
          </div>
        </motion.div>
      )}

      {/* persistent position status bar */}
      <div className="mb-5">
        <PositionStatusBar you={state.you} earningsToday={earnings.today} lastSiege={lastSiege} role={role} />
      </div>

      {/* active tab */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === "build" ? (
            <BuildTab
              you={state.you}
              walletBalance={walletBalance}
              stashes={state.stashes}
              earnings={earnings}
              onOpen={handleOpen}
              onClose={handleClose}
              onWithdrawBanked={withdrawBanked}
              onToggleCompound={setCompound}
              onSetRiskProfile={setRiskProfile}
              displayName={displayName}
              avatarSeed={avatarSeed}
              avatarVariant={avatarVariant}
              avatarColor={avatarColor}
            />
          ) : tab === "hunt" ? (
            <HuntTab
              you={state.you}
              stashes={state.stashes}
              runnerStats={runnerStats}
              canRaid={canRaidStash}
              onSiege={handleSiege}
              onOpenVaultCta={() => switchTab("build")}
              highlightId={highlightId}
              freeLeft={freeSiege.dailyLeft}
              onFreeSiege={() => setFreeSiegeOpen(true)}
              freeResetMins={freeSiege.nextResetMins}
            />
          ) : (
            <CrownTab referral={referral} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Build-tab growth pair: taunt raiders at your own vault, then the
          lifetime-referral nudge. The challenge button is deliberately FIRST —
          it is the higher-intent action and the one that recruits players. */}
      {tab === "build" && state.you && (
        <div className="mt-3 flex flex-col gap-2">
          <ChallengeButton
            amount={state.you.amount}
            profile={state.you.riskProfile}
            /**
             * The label the RECIPIENT sees, so it must never be self-referential.
             * `truncateAddress(publicKey ?? "You")` yielded the literal "You" for
             * guests, which made a shared challenge arrive as "You challenged
             * you". Fall back to the player's unique referral code instead, which
             * reads as an identity to a stranger.
             */
            label={
              displayName
              || (publicKey ? truncateAddress(publicKey, 4, 4) : referral.code.replace("LORD-", "Lord "))
            }
            refCode={referral.code}
          />
          <button
            type="button"
            onClick={() => switchTab("crown")}
            className="flex w-full items-center gap-2 rounded-xl border border-gold/20 bg-gold/[0.05] px-3.5 py-2.5 text-left transition-colors hover:bg-gold/[0.1]"
          >
            <Crown className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
            <span className="font-mono text-[10px] leading-relaxed text-slate">
              Multiply this. <span className="text-gold">Invite a Lord</span> and earn lifetime rake from their fees too.
            </span>
          </button>
        </div>
      )}

      {/* war feed with dual filters */}
      <div className="mt-5">
        <SpotlightCard spotlightColor="rgba(0,230,118,0.1)" radius={280} className="premium-card rounded-[24px]">
          <div className="flex flex-col gap-3 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-emerald" aria-hidden />
                <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">War feed</h3>
              </div>
              <div className="flex gap-1.5">
                <FeedPill label="Lords" active={feedView === "lords"} onClick={() => setFeedView("lords")} accent="#7000FF" />
                <FeedPill label="Runners" active={feedView === "runners"} onClick={() => setFeedView("runners")} accent="#FF2200" />
              </div>
            </div>
            <WarFeed
              events={filteredFeed}
              playerName={displayName}
              playerAvatarSeed={avatarSeed}
              playerAvatarVariant={avatarVariant}
              playerAvatarColor={avatarColor}
            />
          </div>
        </SpotlightCard>
      </div>

      {/* war boards live on the dedicated Hall of Kings page now */}

      {/* siege modal — stays mounted through strain/result (raidability is
          checked at open); a settled siege shields the target, so we must NOT
          gate on raidability here or the result/takeover would unmount. */}
      <AnimatePresence>
        {target && state.you && (
          <SiegeModal
            key={target.id}
            target={target}
            yourVault={state.you.amount}
            taxMult={repeatTaxMult(target.id)}
            onCommit={handleSiegeCommit}
            onSiegeAgain={handleSiegeAgain}
            onClose={() => setRaidTargetId(null)}
            onInvite={() => { setRaidTargetId(null); switchTab("crown"); }}
            referralCode={referral.code}
            referralLink={referral.link}
          />
        )}
      </AnimatePresence>

      {/* FREE siege — deliberately NOT gated on `state.you`. This is the whole
          point: a first-time visitor can complete a real, provably-fair siege
          before owning a vault or even connecting a wallet. */}
      <AnimatePresence>
        {freeSiegeOpen && (
          <SiegeModal
            key={`free-siege-${freeSiegeSeq}`}
            target={trainingVault}
            yourVault={0}
            taxMult={0}
            freeMode
            freeLeft={freeSiege.dailyLeft}
            onCommit={handleFreeSiegeCommit}
            onSiegeAgain={() => {
              // Another free shot at the training vault if quota remains,
              // otherwise fall out to the board.
              if (freeSiege.dailyLeft > 0) setFreeSiegeSeq((n) => n + 1);
              else setFreeSiegeOpen(false);
            }}
            onClose={() => setFreeSiegeOpen(false)}
            onOpenVault={() => { setFreeSiegeOpen(false); switchTab("build"); }}
            referralCode={referral.code}
            referralLink={referral.link}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * ChallengeButton — the Vault Lord's recruiting tool.
 *
 * Generates a self-describing "crack my vault" link and shares it. This is the
 * mechanic that makes the +EV, passive side of the market do the marketing: a
 * defender taunts raiders at their own vault because their ego is on the line,
 * and every accepted challenge is a raider arriving with intent. It also
 * bootstraps the cold-start problem — a two-sided market that has to be seeded
 * from one side is exactly what a shareable challenge solves.
 *
 * The player's referral code rides along inside the payload, so a recruited
 * raider is attributable.
 */
function ChallengeButton({ amount, profile, label, refCode }: {
  amount: number; profile: RiskProfile; label: string; refCode: string;
}) {
  const [state, setState] = useState<"idle" | "shared" | "copied" | "failed">("idle");

  async function share() {
    const challenge = { amount, profile, label, ref: refCode };
    const origin = typeof window !== "undefined" ? window.location.origin : undefined;
    const url = challengeLink(challenge, origin);
    const text = challengeShareText(challenge, url);
    try {
      const nav = navigator as Navigator & { share?: (d: { text: string; title?: string }) => Promise<void> };
      if (nav.share) {
        await nav.share({ text, title: "YOINK.GG · Crack my vault" });
        setState("shared");
        return;
      }
      await navigator.clipboard.writeText(text);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2200);
    } catch {
      setState("failed");
      window.setTimeout(() => setState("idle"), 2200);
    }
  }

  const copy =
    state === "shared" ? "Challenge sent — good luck to them"
    : state === "copied" ? "Link copied — go post it"
    : state === "failed" ? "Couldn't share — try again"
    : null;

  return (
    <button
      type="button"
      onClick={share}
      className="flex w-full items-center gap-2 rounded-xl border border-blood/25 bg-blood/[0.06] px-3.5 py-2.5 text-left transition-colors hover:bg-blood/[0.11]"
    >
      <Swords className="h-3.5 w-3.5 shrink-0 text-blood" aria-hidden />
      <span className="font-mono text-[10px] leading-relaxed text-slate">
        {copy ?? (
          <>
            <span className="text-blood">Dare them to crack it.</span> Share a link
            straight at your {formatSol(amount, 2)} SOL vault — every failed siege pays you.
          </>
        )}
      </span>
    </button>
  );
}

function TabButton({ active, onClick, accent, icon, label, sublabel }: {
  active: boolean; onClick: () => void; accent: string; icon: React.ReactNode; label: string; sublabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="relative flex items-center justify-center gap-2.5 rounded-2xl border px-3 py-3 transition-colors"
      style={{
        background: active ? `${accent}16` : "rgba(255,255,255,0.02)",
        borderColor: active ? `${accent}77` : "rgba(255,255,255,0.07)",
        boxShadow: active ? `0 0 20px ${accent}22` : undefined,
      }}
    >
      <span style={{ color: active ? accent : "#8892a4" }}>{icon}</span>
      <div className="flex flex-col items-start leading-none">
        <span className="font-display text-sm font-black uppercase tracking-[0.08em]" style={{ color: active ? "#fff" : "#8892a4" }}>{label}</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: active ? accent : "#5b6472" }}>{sublabel}</span>
      </div>
    </button>
  );
}

function FeedPill({ label, active, onClick, accent }: { label: string; active: boolean; onClick: () => void; accent: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] transition-colors"
      style={{ background: active ? `${accent}1f` : "rgba(255,255,255,0.02)", borderColor: active ? `${accent}77` : "rgba(255,255,255,0.08)", color: active ? accent : "#8892a4" }}
    >
      {label}
    </button>
  );
}
