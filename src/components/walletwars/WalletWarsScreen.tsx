/**
 * YOINK.GG — Wallet Wars Screen (flagship PvP mode)
 *
 * Redesigned layout (top → bottom):
 *   1. YOUR POSITION   — staked, shield, banked, W/L, open/manage (home base)
 *   2. STATUS BAR      — your last action, always visible
 *   3. TIER SELECTOR   — weight classes with live counts + empty states
 *   4. TARGET CARDS    — scannable raid targets in the selected tier
 *   5. BOUNTY BOARD    — promoted phantom-accent targeting
 *   6. WAR FEED        — live siege stream (social proof / FOMO)
 *   7. WAR BOARDS      — season-scoped fee-farming / survival leaderboards
 *
 * Game logic lives in lib/walletWarsState.ts (the "Siege the Vault" engine):
 * asymmetric defender-vs-raider, a cheap attempt fee, published per-tier crack
 * odds, and partial-slice prizes. ESCROW_ENABLED stays false (local sim).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, Vault, Coins, Trophy, ListRestart } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { SnatchIcon } from "@/components/ui/YoinkLogo";
import {
  useWalletWars, TIERS, tierIndexForAmount,
  type SiegeResolution, type Vault as VaultModel,
} from "@/lib/walletWarsState";
import { useWallet } from "@/lib/wallet";
import { formatSol, truncateAddress } from "@/lib/utils";
import { VaultCard } from "./VaultCard";
import { YourVaultPanel } from "./YourVaultPanel";
import { SiegeModal } from "./SiegeModal";
import { WarFeed } from "./WarFeed";
import { WalletWarsLeaderboard } from "./WalletWarsLeaderboard";
import {
  ProvablyFairBadge, StatusBar, BountyBoard, FeeToast, WarOnboarding,
  type FeeToastData,
} from "./WalletWarsExtras";

const ONBOARD_KEY = "yoink_ww_onboarded";

/** Human-readable copy for a typed siege rejection (no silent failures). */
function describeRejection(reason: import("@/lib/walletWarsState").SiegeRejection): string {
  switch (reason.kind) {
    case "cooldown":
      return `on cooldown (${Math.ceil(reason.remainingMs / 1000)}s)`;
    case "shielded":
      return reason.shieldRemainingMs > 0
        ? `target shielded (${Math.ceil(reason.shieldRemainingMs / 1000)}s)`
        : "target unavailable";
    case "self_siege":
      return "you can't siege your own vault";
    case "tier_mismatch":
      return "different weight class";
    case "insufficient_funds":
      return `fee ${formatSol(reason.required, 3)} > your ${formatSol(reason.available, 3)} SOL`;
  }
}

function HeroStat({ icon, label, value, color, accent, border }: {
  icon: React.ReactNode; label: string; value: string; color: string; accent: string; border: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl px-4 py-3" style={{ background: accent, border: `1px solid ${border}`, minWidth: 120 }}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate">{label}</span>
      </div>
      <span className="font-mono text-lg font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
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
  const { state, openVault, cashOut, withdrawBanked, setCompound, siege, placeBounty, repeatTaxMult, resortBoard } = useWalletWars();
  const { walletBalance, publicKey } = useWallet();

  const [raidTargetId, setRaidTargetId] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState(0);
  const [raidRecord, setRaidRecord]     = useState({ wins: 0, losses: 0 });
  const [lastAction, setLastAction]     = useState<string | null>(null);
  const [feeToast, setFeeToast]         = useState<FeeToastData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const avatarSeed = publicKey ?? (displayName || "You");

  const playerTier = state.you ? tierIndexForAmount(state.you.amount) : null;

  // First-run onboarding — show once per browser.
  useEffect(() => {
    try {
      if (localStorage.getItem(ONBOARD_KEY) !== "1") setShowOnboarding(true);
    } catch { /* private mode — skip */ }
  }, []);

  function dismissOnboarding() {
    setShowOnboarding(false);
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch { /* ignore */ }
  }

  // Follow the player into their weight class when they stake / move tiers.
  useEffect(() => {
    if (playerTier !== null) setSelectedTier(playerTier);
  }, [playerTier]);

  // ── Fee feedback: when YOUR stash survives a raid, bank + toast in real time.
  // A feed event with targetIsYou + outcome "loss" means a raider hit you and
  // failed — you just banked their wager.
  const lastFeeTsRef = useRef<number>(Date.now());
  useEffect(() => {
    const banked = state.feed.find(
      (e) => e.targetIsYou && e.outcome === "loss" && e.ts > lastFeeTsRef.current,
    );
    if (banked) {
      lastFeeTsRef.current = banked.ts;
      setFeeToast({ id: banked.ts, amount: banked.amount, from: banked.raider });
      setLastAction(`Vault survived — banked +${formatSol(banked.amount, 3)} SOL from ${truncateAddress(banked.raider, 4, 4)}`);
      const t = window.setTimeout(() => setFeeToast(null), 3200);
      return () => clearTimeout(t);
    }
  }, [state.feed]);

  const boardForTier = useMemo(
    () => state.stashes.filter((s) => tierIndexForAmount(s.amount) === selectedTier),
    [state.stashes, selectedTier],
  );

  const target = useMemo(
    () => state.stashes.find((s) => s.id === raidTargetId) ?? null,
    [state.stashes, raidTargetId],
  );

  // You can siege a vault only inside your own weight class, when unshielded.
  function canRaidStash(s: VaultModel): boolean {
    if (!state.you) return false;
    if (tierIndexForAmount(s.amount) !== tierIndexForAmount(state.you.amount)) return false;
    return Date.now() >= s.shieldUntil;
  }

  const canRaidTier = !!state.you && playerTier === selectedTier;
  const targetRaidable = !!target && !!state.you && canRaidStash(target);

  function handleRaidClick(id: string) {
    const s = state.stashes.find((x) => x.id === id);
    if (!s || !canRaidStash(s)) return;
    setRaidTargetId(id);
  }

  // Wrap the siege commit so we can update the W/L record + status bar.
  // Returns the typed resolution so the modal can surface a rejection reason
  // instead of failing silently (full SiegeModal polish is Task 7).
  function handleSiegeCommit(): SiegeResolution {
    if (!target) return { ok: false, reason: { kind: "self_siege" } };
    const res = siege(target.id);
    if (res.ok) {
      const r = res.result;
      setRaidRecord((rec) =>
        r.outcome === "win"
          ? { ...rec, wins: rec.wins + 1 }
          : { ...rec, losses: rec.losses + 1 },
      );
      setLastAction(
        r.outcome === "win"
          ? `Last siege: cracked +${formatSol(r.seized, 3)} SOL from ${truncateAddress(r.targetWallet, 4, 4)}`
          : `Last siege: bounced — lost ${formatSol(r.lost, 3)} SOL fee on ${truncateAddress(r.targetWallet, 4, 4)}`,
      );
    } else {
      setLastAction(`Siege declined — ${describeRejection(res.reason)}`);
    }
    return res;
  }

  // Default status text when nothing has happened yet.
  const statusText =
    lastAction ??
    (state.you ? "Vault open — pick a target in your tier to siege" : "No sieges yet — open a vault to start earning");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">

      {/* First-run tutorial */}
      <AnimatePresence>
        {showOnboarding && <WarOnboarding onDone={dismissOnboarding} />}
      </AnimatePresence>

      {/* ── Compact hero + provably-fair badge ── */}
      <div
        className="relative mb-5 overflow-hidden rounded-[24px]"
        style={{ background: "linear-gradient(150deg, #120a1f 0%, #08080f 55%, #1a0810 100%)" }}
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute" style={{ top: "-20%", left: "-5%", width: "50%", height: "100%", background: "radial-gradient(ellipse, rgba(112,0,255,0.22), transparent 70%)", willChange: "transform", animation: "aurora-breathe 20s cubic-bezier(0.22,1,0.36,1) infinite" }} />
          <div className="absolute" style={{ bottom: "-20%", right: "-5%", width: "45%", height: "90%", background: "radial-gradient(ellipse, rgba(255,34,0,0.16), transparent 70%)", willChange: "transform", animation: "aurora-drift 26s ease-in-out infinite" }} />
        </div>
        <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #7000FF 30%, #FFD700 50%, #FF2200 70%, transparent)" }} />

        <div className="relative z-10 flex flex-col items-center gap-4 px-6 py-7">
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ filter: "drop-shadow(0 0 24px rgba(112,0,255,0.35))" }}
            >
              <SnatchIcon size={52} variant="gold" pulse />
            </motion.div>
            <h1 className="font-display font-black leading-none tracking-tight" style={{ fontSize: "clamp(1.9rem, 6vw, 2.8rem)" }}>
              <span className="text-white">WALLET </span>
              <span style={{ color: "#FF2200" }}>WARS</span>
            </h1>
          </div>

          <div className="flex flex-wrap justify-center gap-2.5">
            <HeroStat icon={<Trophy className="h-3.5 w-3.5 text-gold" aria-hidden />} label="Biggest Heist" value={`${formatSol(state.biggestHeist, 2)} SOL`} color="#FFD700" accent="rgba(255,215,0,0.1)" border="rgba(255,215,0,0.22)" />
            <HeroStat icon={<Coins className="h-3.5 w-3.5 text-emerald" aria-hidden />} label="Total Banked" value={`${formatSol(state.totalBanked, 0)} SOL`} color="#00E676" accent="rgba(0,230,118,0.08)" border="rgba(0,230,118,0.2)" />
            <HeroStat icon={<Vault className="h-3.5 w-3.5 text-phantom" aria-hidden />} label="Stashes Live" value={`${state.stashes.length}`} color="#7000FF" accent="rgba(112,0,255,0.08)" border="rgba(112,0,255,0.2)" />
          </div>

          <ProvablyFairBadge />
        </div>
      </div>

      <div className="flex flex-col gap-5">

        {/* 1 — YOUR POSITION */}
        <YourVaultPanel
          you={state.you}
          walletBalance={walletBalance}
          onOpen={openVault}
          onClose={cashOut}
          onWithdrawBanked={withdrawBanked}
          onToggleCompound={setCompound}
          displayName={displayName}
          avatarSeed={avatarSeed}
          avatarVariant={avatarVariant}
          avatarColor={avatarColor}
          raidRecord={raidRecord}
        />

        {/* 2 — STATUS BAR */}
        <StatusBar text={statusText} />

        {/* 3 — TIER SELECTOR */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIERS.map((t, i) => {
            const isYours = playerTier === i;
            const active  = selectedTier === i;
            const count   = state.stashes.filter((s) => tierIndexForAmount(s.amount) === i).length;
            const empty   = count === 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTier(i)}
                className="flex flex-col gap-0.5 rounded-2xl border px-3 py-2.5 text-left transition-colors"
                style={{
                  background: active ? `${t.accent}14` : "rgba(255,255,255,0.02)",
                  borderColor: active ? `${t.accent}55` : "rgba(255,255,255,0.06)",
                  opacity: empty && !active ? 0.5 : 1,
                }}
              >
                <span className="flex items-center justify-between">
                  <span className="font-display text-xs font-black" style={{ color: active ? t.accent : "#eef1f6" }}>{t.label}</span>
                  {isYours && <span className="rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.1em]" style={{ background: `${t.accent}22`, color: t.accent }}>You</span>}
                </span>
                <span className="font-mono text-[9px] text-dim">
                  {empty
                    ? "No targets — be first"
                    : `${t.max === Infinity ? `${t.min}+` : `${t.min}–${t.max}`} SOL · ${count} active`}
                </span>
              </button>
            );
          })}
        </div>

        {/* 4 — TARGET CARDS */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Crosshair className="h-4 w-4 text-blood" aria-hidden />
              <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-slate">
                {TIERS[selectedTier]?.label ?? "Targets"} · {canRaidTier ? "pick a target" : state.you ? "spectating (not your class)" : "preview"}
              </h2>
            </div>
            <span className="font-mono text-[10px] text-dim">{boardForTier.length} stashes</span>
          </div>

          {/* Re-rank board — the board holds position between explicit ranking
              moments (mount / open / cashout); this re-sorts hottest-first now. */}
          <div className="flex justify-end px-1">
            <button
              type="button"
              onClick={resortBoard}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <ListRestart className="h-3 w-3" aria-hidden /> Re-rank board
            </button>
          </div>

          {boardForTier.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center font-mono text-[11px] text-slate">
              No active stashes in {TIERS[selectedTier]?.label ?? "this tier"} right now — be the first to open one.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AnimatePresence mode="popLayout">
                {boardForTier.map((s) => (
                  <VaultCard key={s.id} vault={s} canRaid={canRaidTier} onRaid={handleRaidClick} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* 5 — BOUNTY BOARD */}
        <BountyBoard
          stashes={state.stashes}
          canRaid={canRaidStash}
          onCrack={(id) => {
            const s = state.stashes.find((x) => x.id === id);
            if (s) setSelectedTier(tierIndexForAmount(s.amount));
            handleRaidClick(id);
          }}
        />

        {/* 6 — LIVE WAR FEED */}
        <SpotlightCard spotlightColor="rgba(0,230,118,0.1)" radius={280} className="premium-card rounded-[24px]">
          <div className="px-5 py-4">
            <WarFeed
              events={state.feed}
              playerName={displayName}
              playerAvatarSeed={avatarSeed}
              playerAvatarVariant={avatarVariant}
              playerAvatarColor={avatarColor}
            />
          </div>
        </SpotlightCard>

        {/* 7 — WAR BOARDS (season-scoped leaderboards) */}
        <WalletWarsLeaderboard
          stashes={state.stashes}
          you={state.you}
          biggestHeist={state.biggestHeist}
          displayName={displayName}
        />
      </div>

      {/* ── SIEGE MODAL ── */}
      <AnimatePresence>
        {target && state.you && targetRaidable && (
          <SiegeModal
            target={target}
            yourVault={state.you.amount}
            taxMult={repeatTaxMult(target.id)}
            onCommit={handleSiegeCommit}
            onPlaceBounty={(amt) => placeBounty(target.id, amt)}
            onClose={() => setRaidTargetId(null)}
          />
        )}
      </AnimatePresence>

      {/* ── FEE-BANKED TOAST ── */}
      <FeeToast toast={feeToast} />
    </div>
  );
}
