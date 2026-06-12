/**
 * StashCard — a raidable target on the Wallet Wars board.
 * Shows the prize (stash), strength, banked fees, and a RAID button.
 */

import { memo, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crosshair, ShieldHalf, Coins, Lock, Target } from "lucide-react";
import { type Stash, stashStrengthPct } from "@/lib/walletWarsState";
import { formatSol, truncateAddress } from "@/lib/utils";
import { PurgeAvatar } from "./PurgeAvatar";

interface StashCardProps {
  stash: Stash;
  canRaid: boolean;
  onRaid: (id: string) => void;
}

export const StashCard = memo(function StashCard({ stash, canRaid, onRaid }: StashCardProps) {
  const strength = stashStrengthPct(stash.amount);
  const isWhale  = stash.amount >= 5;

  // Live shield countdown
  const [shieldLeft, setShieldLeft] = useState(0);
  useEffect(() => {
    const tick = () => setShieldLeft(Math.max(0, stash.shieldUntil - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [stash.shieldUntil]);

  const shielded = shieldLeft > 0;
  const accent   = isWhale ? "#FFD700" : "#7000FF";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="premium-card flex flex-col gap-3 rounded-[20px] px-4 py-3.5"
      style={{
        border: `1px solid ${isWhale ? "rgba(255,215,0,0.28)" : "rgba(255,255,255,0.06)"}`,
        boxShadow: isWhale ? "0 0 24px rgba(255,215,0,0.12), inset 0 0 20px rgba(255,215,0,0.04)" : undefined,
      }}
    >
      {/* header: avatar + wallet + whale tag */}
      <div className="flex items-center gap-2.5">
        <PurgeAvatar seed={stash.wallet} size={40} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono text-xs font-bold text-white">
            {truncateAddress(stash.wallet, 4, 4)}
          </span>
          <span className="font-mono text-[10px] text-dim">
            {stash.survived} survived · {stash.cracked} cracked
          </span>
        </div>
        {isWhale && (
          <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-gold">
            Whale
          </span>
        )}
      </div>

      {stash.bounty > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-gold/25 bg-gold/[0.07] px-2.5 py-1.5">
          <Target className="h-3 w-3 shrink-0 text-gold" aria-hidden />
          <span className="font-mono text-[10px] text-gold">
            <span className="font-bold">{formatSol(stash.bounty, 2)} SOL</span> bounty — crack them, take it
          </span>
        </div>
      )}

      {/* prize */}
      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim">Stash</span>
          <span className="font-display text-2xl font-black tabular-nums" style={{ color: accent }}>
            {formatSol(stash.amount, 2)}
            <span className="ml-1 text-xs text-slate">SOL</span>
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="flex items-center gap-1 font-mono text-[10px] text-emerald">
            <Coins className="h-3 w-3" aria-hidden />
            {formatSol(stash.banked, 2)} banked
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-slate">
            <ShieldHalf className="h-3 w-3" aria-hidden />
            {strength}% strength
          </span>
        </div>
      </div>

      {/* strength bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full"
          style={{ width: `${strength}%`, background: `linear-gradient(90deg, #00E676, ${accent})` }}
        />
      </div>

      {/* raid button */}
      <motion.button
        type="button"
        onClick={() => onRaid(stash.id)}
        disabled={!canRaid || shielded}
        whileHover={canRaid && !shielded ? { scale: 1.03 } : undefined}
        whileTap={canRaid && !shielded ? { scale: 0.96 } : undefined}
        transition={{ duration: 0.14 }}
        className="flex items-center justify-center gap-2 rounded-xl border border-blood/35 bg-blood/10 py-2.5 font-display text-xs font-bold uppercase tracking-[0.12em] text-blood transition-colors hover:bg-blood/20 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ willChange: "transform" }}
      >
        {shielded ? (
          <>
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Shielded {(shieldLeft / 1000).toFixed(0)}s
          </>
        ) : !canRaid ? (
          <>
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Different weight class
          </>
        ) : (
          <>
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
            Raid this stash
          </>
        )}
      </motion.button>
    </motion.div>
  );
});
