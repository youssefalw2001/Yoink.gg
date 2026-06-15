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

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LineChart, Crosshair, Radio } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { SnatchIcon } from "@/components/ui/YoinkLogo";
import {
  useWalletWars, tierIndexForAmount,
  type SiegeResolution, type Vault as VaultModel, type RaidEvent,
} from "@/lib/walletWarsState";
import { useWallet } from "@/lib/wallet";
import {
  loadRole, saveRole, tabForRole, roleForTab, type WarTab,
  loadRunnerStats, saveRunnerStats, recordSiege, type RunnerStats,
} from "@/lib/walletWarsRole";
import { opportunityScore } from "@/lib/walletWarsActivity";
import { vaultEconomics } from "./riskProfilePresentation";
import { BuildTab } from "./BuildTab";
import { HuntTab } from "./HuntTab";
import { SiegeModal } from "./SiegeModal";
import { WarFeed } from "./WarFeed";
import { WalletWarsLeaderboard } from "./WalletWarsLeaderboard";
import { FeeToast, type FeeToastData } from "./WalletWarsExtras";
import { PositionStatusBar, type LastSiege } from "./PositionStatusBar";
import { RoleOnboarding } from "./RoleOnboarding";
import { useEarningsLedger } from "./useEarningsLedger";

const ONBOARD_KEY = "yoink_ww_onboarded_v2";

type FeedView = "lords" | "runners";

/** Pure war-feed split: Lords see fee-banking + survival; Runners see cracks + bounties. */
function filterFeed(events: RaidEvent[], view: FeedView): RaidEvent[] {
  return events.filter((e) => {
    if (view === "runners") return e.outcome === "win" || (e.bounty ?? 0) > 0;
    // lords
    return e.kind === "refund" || (e.outcome === "loss" && !(e.bounty ?? 0));
  });
}

export function WalletWarsScreen({
  displayName = "",
  avatarVariant = null,
  avatarColor = null,
}: {
  displayName?: string;
  avatarVariant?: number | null;
  avatarColor?: string | null;
}) {
  const { state, openVault, cashOut, withdrawBanked, setCompound, setRiskProfile, siege, placeBounty, repeatTaxMult } = useWalletWars();
  const { walletBalance, publicKey } = useWallet();

  const avatarSeed = publicKey ?? (displayName || "You");

  // Which side are we playing? Default from the landing-card choice.
  const [tab, setTab] = useState<WarTab>(() => tabForRole(loadRole() ?? "runner"));
  const role = roleForTab(tab);

  const [raidTargetId, setRaidTargetId] = useState<string | null>(null);
  const [raidRecord, setRaidRecord] = useState({ wins: 0, losses: 0 });
  const [runnerStats, setRunnerStats] = useState<RunnerStats>(() => loadRunnerStats());
  const [lastSiege, setLastSiege] = useState<LastSiege | null>(null);
  const [feeToast, setFeeToast] = useState<FeeToastData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // War-feed filter follows the active tab by default; manual pills override.
  const [feedView, setFeedView] = useState<FeedView>(role === "lord" ? "lords" : "runners");
  useEffect(() => { setFeedView(roleForTab(tab) === "lord" ? "lords" : "runners"); }, [tab]);

  // Single earnings ledger (avoid double-counting feesEarned deltas).
  const earnings = useEarningsLedger(state.you?.id ?? null, state.you?.feesEarned ?? 0);

  // First-run, role-branched onboarding (once per browser).
  useEffect(() => {
    try { if (localStorage.getItem(ONBOARD_KEY) !== "1") setShowOnboarding(true); } catch { /* private mode */ }
  }, []);

  function switchTab(next: WarTab) {
    setTab(next);
    saveRole(roleForTab(next));
    setLastSiege(null);
  }

  // ── Fee feedback: your vault survives a raid → emerald toast + banked status.
  const [lastFeeTs, setLastFeeTs] = useState<number>(() => Date.now());
  useEffect(() => {
    const banked = state.feed.find((e) => e.targetIsYou && e.outcome === "loss" && e.ts > lastFeeTs && e.kind !== "refund");
    if (banked) {
      setLastFeeTs(banked.ts);
      setFeeToast({ id: banked.ts, amount: banked.amount, from: banked.raider });
      const t = window.setTimeout(() => setFeeToast(null), 3200);
      return () => clearTimeout(t);
    }
  }, [state.feed, lastFeeTs]);

  const target = useMemo(() => state.stashes.find((s) => s.id === raidTargetId) ?? null, [state.stashes, raidTargetId]);

  function canRaidStash(s: VaultModel): boolean {
    if (!state.you) return false;
    if (tierIndexForAmount(s.amount) !== tierIndexForAmount(state.you.amount)) return false;
    return Date.now() >= s.shieldUntil;
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
    const res = siege(target.id);
    if (res.ok) {
      const r = res.result;
      setRaidRecord((rec) => (r.outcome === "win" ? { ...rec, wins: rec.wins + 1 } : { ...rec, losses: rec.losses + 1 }));
      setLastSiege({ outcome: r.outcome, roll: r.roll, needed: r.pWin, seized: r.seized });
      setRunnerStats((prev) => {
        const next = recordSiege(prev, r.outcome, r.seized);
        saveRunnerStats(next);
        return next;
      });
    }
    return res;
  }

  /** Loop the runner into the next best raidable target (skip the just-shielded one). */
  function handleSiegeAgain() {
    if (!state.you) { setRaidTargetId(null); return; }
    const myTier = tierIndexForAmount(state.you.amount);
    const candidates = state.stashes
      .filter((s) => !s.isYou && s.id !== raidTargetId && tierIndexForAmount(s.amount) === myTier && Date.now() >= s.shieldUntil)
      .sort((a, b) => b.amount - a.amount);
    setRaidTargetId(candidates[0]?.id ?? null);
  }

  // Clear the lastSiege line when the player changes their vault posture.
  function handleOpen(amount: number, profile: Parameters<typeof openVault>[1]) { setLastSiege(null); openVault(amount, profile); }
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

      {/* BUILD / HUNT selector */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <TabButton active={tab === "build"} onClick={() => switchTab("build")} accent="#7000FF" icon={<LineChart className="h-4 w-4" aria-hidden />} label="Build" sublabel="Vault Lord" />
        <TabButton active={tab === "hunt"} onClick={() => switchTab("hunt")} accent="#FF2200" icon={<Crosshair className="h-4 w-4" aria-hidden />} label="Hunt" sublabel="Siege Runner" />
      </div>

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
              onPlaceBounty={placeBounty}
              displayName={displayName}
              avatarSeed={avatarSeed}
              avatarVariant={avatarVariant}
              avatarColor={avatarColor}
              raidRecord={raidRecord}
            />
          ) : (
            <HuntTab
              you={state.you}
              stashes={state.stashes}
              runnerStats={runnerStats}
              canRaid={canRaidStash}
              onSiege={handleSiege}
              onOpenVaultCta={() => switchTab("build")}
              highlightId={highlightId}
            />
          )}
        </motion.div>
      </AnimatePresence>

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

      {/* war boards */}
      <div className="mt-5">
        <WalletWarsLeaderboard stashes={state.stashes} you={state.you} biggestHeist={state.biggestHeist} displayName={displayName} />
      </div>

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
            onPlaceBounty={(amt) => placeBounty(target.id, amt)}
            onSiegeAgain={handleSiegeAgain}
            onClose={() => setRaidTargetId(null)}
          />
        )}
      </AnimatePresence>

      <FeeToast toast={feeToast} />
    </div>
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
