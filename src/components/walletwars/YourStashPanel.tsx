/**
 * YourStashPanel — open a stash, watch fees bank in real time, or cash out.
 * This is the "be the house" side of Wallet Wars.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Vault, Coins, ShieldCheck, Swords, LogOut, Plus, ShieldOff, Trophy } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { OPEN_STAKES, type Stash, tierForAmount } from "@/lib/walletWarsState";
import { formatSol } from "@/lib/utils";
import { playPurchase } from "@/lib/sounds";
import { PurgeAvatar } from "./PurgeAvatar";

interface YourStashPanelProps {
  you: Stash | null;
  walletBalance: number;
  onOpen: (amount: number) => void;
  onClose: () => void;
  displayName?: string;
  avatarSeed?: string;
  avatarVariant?: number | null;
  avatarColor?: string | null;
  /** The player's raid win/loss record (raids they initiated). */
  raidRecord?: { wins: number; losses: number };
}

export function YourStashPanel({
  you, walletBalance, onOpen, onClose,
  displayName = "", avatarSeed = "You", avatarVariant = null, avatarColor = null,
  raidRecord = { wins: 0, losses: 0 },
}: YourStashPanelProps) {
  // Live shield countdown — ticks every 250ms while a shield is active.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const shieldLeftMs = you ? Math.max(0, you.shieldUntil - now) : 0;
  const shielded = shieldLeftMs > 0;
  const shieldLabel = shielded
    ? `${Math.floor(shieldLeftMs / 60000)}m ${Math.floor((shieldLeftMs % 60000) / 1000)}s`
    : null;
  // ── Not staked yet → open-a-stash CTA ─────────────────────────────────────
  if (!you) {
    return (
      <SpotlightCard spotlightColor="rgba(112,0,255,0.16)" radius={280} className="premium-card rounded-[24px]">
        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-phantom/30 bg-phantom/10">
              <Vault className="h-5 w-5 text-phantom" aria-hidden />
            </div>
            <div>
              <h3 className="font-display text-base font-black text-white">Open your stash</h3>
              <p className="font-mono text-[10px] text-dim">Stake it · bait them · bank the fees</p>
            </div>
          </div>

          <p className="font-mono text-[11px] leading-relaxed text-slate">
            Lock SOL to become a target. Every failed raid on you banks fees — even if
            someone eventually cracks it, you can out-earn the risk. Your stake sets your
            weight class; you can only raid stashes in the same tier.
          </p>

          <div className="grid grid-cols-4 gap-2">
            {OPEN_STAKES.map((amt) => {
              const tier = tierForAmount(amt);
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => { playPurchase(); onOpen(amt); }}
                  className="flex flex-col items-center gap-0.5 rounded-xl border py-2.5 font-mono transition-colors hover:bg-white/[0.04]"
                  style={{ background: `${tier.accent}0d`, borderColor: `${tier.accent}40` }}
                >
                  <span className="text-sm font-black tabular-nums text-white">{amt}</span>
                  <span className="text-[8px] uppercase tracking-[0.08em]" style={{ color: tier.accent }}>{tier.label.replace("The ", "")}</span>
                </button>
              );
            })}
          </div>
          <p className="text-center font-mono text-[10px] text-dim">
            Real balance: {formatSol(walletBalance, 2)} SOL · stakes are simulated (devnet)
          </p>
        </div>
      </SpotlightCard>
    );
  }

  // ── Staked → live stash dashboard ─────────────────────────────────────────
  return (
    <SpotlightCard spotlightColor="rgba(255,215,0,0.16)" radius={280} className="premium-card rounded-[24px]">
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PurgeAvatar seed={avatarSeed} size={40} pulse variant={avatarVariant} color={avatarColor} />
            <div>
              <h3 className="font-display text-sm font-black text-white">{displayName || "Your stash"}</h3>
              <p className="font-mono text-[10px] text-dim">Live · on the board</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald/20 bg-emerald/10 px-2 py-0.5 font-mono text-[10px] text-emerald">
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-emerald"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              style={{ willChange: "opacity" }}
            />
            Active
          </span>
        </div>

        {/* stash value */}
        <div className="flex items-end justify-between rounded-2xl px-4 py-3" style={{ background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.16)" }}>
          <div className="flex flex-col">
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim">Stash value</span>
            <motion.span
              key={you.amount}
              initial={{ scale: 1.06 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.25 }}
              className="font-display text-3xl font-black tabular-nums gold-text-gradient"
              style={{ willChange: "transform" }}
            >
              {formatSol(you.amount, 3)}
            </motion.span>
          </div>
          <span className="font-display text-sm text-gold/60">SOL</span>
        </div>

        {/* banked ticker */}
        <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "rgba(0,230,118,0.06)", border: "1px solid rgba(0,230,118,0.16)" }}>
          <span className="flex items-center gap-2 font-mono text-[11px] text-slate">
            <Coins className="h-3.5 w-3.5 text-emerald" aria-hidden /> Fees banked
          </span>
          <motion.span
            key={you.banked}
            initial={{ scale: 1.1, color: "#7CFFB0" }}
            animate={{ scale: 1, color: "#00E676" }}
            transition={{ duration: 0.3 }}
            className="font-mono text-sm font-black tabular-nums"
            style={{ willChange: "transform" }}
          >
            +{formatSol(you.banked, 3)}
          </motion.span>
        </div>

        {/* shield status */}
        <div
          className="flex items-center justify-between rounded-xl px-3 py-2.5"
          style={{
            background: shielded ? "rgba(0,230,118,0.06)" : "rgba(136,146,164,0.06)",
            border: `1px solid ${shielded ? "rgba(0,230,118,0.16)" : "rgba(136,146,164,0.16)"}`,
          }}
        >
          <span className="flex items-center gap-2 font-mono text-[11px] text-slate">
            {shielded
              ? <ShieldCheck className="h-3.5 w-3.5 text-emerald" aria-hidden />
              : <ShieldOff className="h-3.5 w-3.5 text-slate" aria-hidden />}
            {shielded ? "Shield active" : "No shield — you're raidable"}
          </span>
          <span className="font-mono text-sm font-bold tabular-nums" style={{ color: shielded ? "#00E676" : "#8892a4" }}>
            {shielded ? shieldLabel : "OPEN"}
          </span>
        </div>

        {/* stats row — raid W/L + defense + odds */}
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.03] py-2">
            <Trophy className="h-3.5 w-3.5 text-gold" aria-hidden />
            <span className="font-mono text-sm font-bold tabular-nums text-white">
              {raidRecord.wins}<span className="text-dim">/</span>{raidRecord.losses}
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-dim">raid W/L</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.03] py-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald" aria-hidden />
            <span className="font-mono text-sm font-bold tabular-nums text-white">{you.survived}</span>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-dim">survived</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.03] py-2">
            <Swords className="h-3.5 w-3.5 text-blood" aria-hidden />
            <span className="font-mono text-sm font-bold tabular-nums text-white">{you.cracked}</span>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-dim">cracked</span>
          </div>
        </div>

        <motion.button
          type="button"
          onClick={onClose}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12 }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 font-display text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/[0.08]"
          style={{ willChange: "transform" }}
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Cash out {formatSol(you.amount + you.banked, 3)} SOL
        </motion.button>
        <p className="-mt-1 flex items-center justify-center gap-1 text-center font-mono text-[10px] text-dim">
          <Plus className="h-3 w-3" aria-hidden /> Stash + banked fees returns to your wallet
        </p>
      </div>
    </SpotlightCard>
  );
}
