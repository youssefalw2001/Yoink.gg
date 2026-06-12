/**
 * YOINK.GG — Wallet Wars Screen (flagship PvP mode)
 *
 * Open lobby. Stake a stash, hunt other stashes, bank fees off failed raids.
 * Replaces Bid Wars. Treated as a primary, hero-grade mode.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, Vault, Flame, Coins, Trophy } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { SnatchIcon } from "@/components/ui/YoinkLogo";
import { useWalletWars } from "@/lib/walletWarsState";
import { useWallet } from "@/lib/wallet";
import { formatSol } from "@/lib/utils";
import { StashCard } from "./StashCard";
import { YourStashPanel } from "./YourStashPanel";
import { RaidModal } from "./RaidModal";
import { WarFeed } from "./WarFeed";

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

export function WalletWarsScreen() {
  const { state, openStash, closeStash, raid } = useWalletWars();
  const { walletBalance } = useWallet();
  const [raidTargetId, setRaidTargetId] = useState<string | null>(null);

  const target = useMemo(
    () => state.stashes.find((s) => s.id === raidTargetId) ?? null,
    [state.stashes, raidTargetId],
  );

  const canRaid = !!state.you;

  function handleRaidClick(id: string) {
    if (!state.you) return;
    setRaidTargetId(id);
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">

      {/* ── HERO ── */}
      <div
        className="relative mb-6 overflow-hidden rounded-[28px]"
        style={{ background: "linear-gradient(150deg, #120a1f 0%, #08080f 55%, #1a0810 100%)" }}
      >
        {/* aurora pools */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute" style={{ top: "-20%", left: "-5%", width: "50%", height: "100%", background: "radial-gradient(ellipse, rgba(112,0,255,0.28), transparent 70%)", willChange: "transform", animation: "aurora-breathe 20s cubic-bezier(0.22,1,0.36,1) infinite" }} />
          <div className="absolute" style={{ bottom: "-20%", right: "-5%", width: "45%", height: "90%", background: "radial-gradient(ellipse, rgba(255,34,0,0.18), transparent 70%)", willChange: "transform", animation: "aurora-drift 26s ease-in-out infinite" }} />
        </div>
        <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #7000FF 30%, #FFD700 50%, #FF2200 70%, transparent)" }} />

        <div className="relative z-10 flex flex-col items-center gap-5 px-6 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-10">
          <div className="flex items-center gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ filter: "drop-shadow(0 0 28px rgba(112,0,255,0.35))" }}
            >
              <SnatchIcon size={72} variant="gold" pulse />
            </motion.div>
            <div className="flex flex-col gap-1.5">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-phantom/30 bg-phantom/10 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.25em] text-phantom">
                <Crosshair className="h-3 w-3" aria-hidden /> PvP · Open Lobby
              </span>
              <h1 className="font-display font-black leading-none tracking-tight" style={{ fontSize: "clamp(2.2rem, 6vw, 3.6rem)" }}>
                <span className="text-white">WALLET </span>
                <span style={{ color: "#FF2200" }}>WARS</span>
              </h1>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate">
                Stake a stash. Yoink theirs. Bank the fees.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3 sm:justify-end">
            <HeroStat icon={<Trophy className="h-3.5 w-3.5 text-gold" aria-hidden />} label="Biggest Heist" value={`${formatSol(state.biggestHeist, 2)} SOL`} color="#FFD700" accent="rgba(255,215,0,0.1)" border="rgba(255,215,0,0.22)" />
            <HeroStat icon={<Coins className="h-3.5 w-3.5 text-emerald" aria-hidden />} label="Total Banked" value={`${formatSol(state.totalBanked, 0)} SOL`} color="#00E676" accent="rgba(0,230,118,0.08)" border="rgba(0,230,118,0.2)" />
            <HeroStat icon={<Vault className="h-3.5 w-3.5 text-phantom" aria-hidden />} label="Stashes Live" value={`${state.stashes.length}`} color="#7000FF" accent="rgba(112,0,255,0.08)" border="rgba(112,0,255,0.2)" />
          </div>
        </div>
      </div>

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">

        {/* LEFT — your stash + the board */}
        <div className="flex flex-col gap-5">
          <YourStashPanel
            you={state.you}
            walletBalance={walletBalance}
            onOpen={openStash}
            onClose={closeStash}
          />

          {/* prompt to open a stash before raiding */}
          {!state.you && (
            <div className="flex items-center gap-2 rounded-xl border border-phantom/15 bg-phantom/[0.06] px-4 py-3">
              <Flame className="h-4 w-4 shrink-0 text-phantom" aria-hidden />
              <p className="font-mono text-[11px] text-slate">
                Open a stash above to start raiding — you must be in the game to hunt.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Crosshair className="h-4 w-4 text-blood" aria-hidden />
              <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-slate">The board · pick a target</h2>
            </div>
            <span className="font-mono text-[10px] text-dim">{state.stashes.length} stashes</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {state.stashes.map((s) => (
                <StashCard key={s.id} stash={s} canRaid={canRaid} onRaid={handleRaidClick} />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT — live feed */}
        <div className="flex flex-col gap-5">
          <SpotlightCard spotlightColor="rgba(0,230,118,0.1)" radius={280} className="premium-card rounded-[24px]">
            <div className="px-5 py-4">
              <WarFeed events={state.feed} />
            </div>
          </SpotlightCard>

          {/* how it works */}
          <SpotlightCard spotlightColor="rgba(112,0,255,0.14)" radius={240} className="premium-card hidden rounded-[24px] lg:block">
            <div className="flex flex-col gap-2 px-5 py-4">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">How it works</h3>
              <ol className="flex flex-col gap-2 text-xs text-slate">
                <li><span className="font-mono text-phantom">01</span> Open a stash — it's your war chest and the prize.</li>
                <li><span className="font-mono text-phantom">02</span> Raid a target. Bigger bid = better odds.</li>
                <li><span className="font-mono text-blood">03</span> Win → snatch 25% of their stash (capped).</li>
                <li><span className="font-mono text-emerald">04</span> Survive a raid → you bank their forfeited bid.</li>
                <li><span className="font-mono text-gold">05</span> Cash out anytime — stash + banked fees.</li>
              </ol>
            </div>
          </SpotlightCard>
        </div>
      </div>

      {/* ── RAID MODAL ── */}
      <AnimatePresence>
        {target && state.you && (
          <RaidModal
            target={target}
            yourStash={state.you.amount}
            onCommit={(bid) => raid(target.id, bid)}
            onClose={() => setRaidTargetId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
