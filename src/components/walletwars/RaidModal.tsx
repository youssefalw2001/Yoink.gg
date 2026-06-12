/**
 * RaidModal — the heist flow.
 *   1. Pick your muscle (bid) → see live win % + potential snatch
 *   2. CRACK → tense roll animation
 *   3. Reveal: WIN (snatch, gold flash) or LOSS (you funded their yield)
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Crosshair, Flame, TrendingUp, ShieldAlert } from "lucide-react";
import {
  WAR_CONFIG, winChance, seizeAmount,
  type Stash, type RaidResult,
} from "@/lib/walletWarsState";
import { formatSol, truncateAddress } from "@/lib/utils";
import { playYoink, playWin, playCooldownBlock } from "@/lib/sounds";
import { PurgeAvatar } from "./PurgeAvatar";

interface RaidModalProps {
  target: Stash;
  yourStash: number;
  onCommit: (bid: number) => RaidResult | null;
  onClose: () => void;
}

type Phase = "select" | "rolling" | "result";

export function RaidModal({ target, yourStash, onCommit, onClose }: RaidModalProps) {
  const presets = useMemo(
    () => WAR_CONFIG.BID_PRESETS.filter((b) => b <= yourStash),
    [yourStash],
  );
  const [bid, setBid]       = useState(presets[Math.min(1, presets.length - 1)] ?? 0);
  const [phase, setPhase]   = useState<Phase>("select");
  const [result, setResult] = useState<RaidResult | null>(null);

  const pWin   = winChance(bid, target.amount);
  const reward = seizeAmount(target.amount) * (1 - WAR_CONFIG.HOUSE_RAKE);

  function commit() {
    if (bid <= 0 || bid > yourStash) { playCooldownBlock(); return; }
    playYoink();
    setPhase("rolling");
    // Compute the result up-front, reveal after the roll animation
    const r = onCommit(bid);
    window.setTimeout(() => {
      if (!r) { onClose(); return; }
      setResult(r);
      setPhase("result");
      if (r.outcome === "win") playWin();
    }, 1400);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: "rgba(8,8,15,0.9)", backdropFilter: "blur(12px)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`Raid ${truncateAddress(target.wallet)}`}
    >
      <motion.div
        initial={{ scale: 0.92, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="premium-card relative w-full max-w-sm rounded-[24px] px-6 py-7"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-dim transition-colors hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        <AnimatePresence mode="wait">
          {/* ── SELECT ── */}
          {phase === "select" && (
            <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="flex items-center gap-2 rounded-full border border-blood/30 bg-blood/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-blood">
                  <Crosshair className="h-3 w-3" aria-hidden /> Raiding
                </span>
                <div className="my-1">
                  <PurgeAvatar seed={target.wallet} size={64} pulse />
                </div>
                <span className="font-mono text-sm font-bold text-white">{truncateAddress(target.wallet, 4, 4)}</span>
                <span className="font-display text-3xl font-black tabular-nums gold-text-gradient">
                  {formatSol(target.amount, 2)} <span className="text-base text-slate">SOL</span>
                </span>
              </div>

              {/* muscle presets */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate">Your muscle (bid)</span>
                <div className="grid grid-cols-4 gap-2">
                  {presets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setBid(p)}
                      className="rounded-xl border py-2 font-mono text-xs font-bold tabular-nums transition-colors"
                      style={{
                        background: bid === p ? "rgba(255,215,0,0.14)" : "rgba(255,255,255,0.03)",
                        borderColor: bid === p ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.08)",
                        color: bid === p ? "#FFD700" : "#8892a4",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* odds + reward */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5" style={{ background: "rgba(0,230,118,0.06)", border: "1px solid rgba(0,230,118,0.16)" }}>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Win chance</span>
                  <span className="font-mono text-lg font-black tabular-nums text-emerald">{Math.round(pWin * 100)}%</span>
                </div>
                <div className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,153,0,0.06)", border: "1px solid rgba(255,153,0,0.16)" }}>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">You snatch</span>
                  <span className="font-mono text-lg font-black tabular-nums text-[#FF9900]">{formatSol(reward, 2)}</span>
                </div>
              </div>

              <p className="text-center font-mono text-[10px] text-dim">
                Lose and your {formatSol(bid, 2)} SOL bid funds their stash. House rakes {Math.round(WAR_CONFIG.HOUSE_RAKE * 100)}%.
              </p>

              <motion.button
                type="button"
                onClick={commit}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.14 }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-blood/40 bg-blood/15 py-3.5 font-display text-sm font-black uppercase tracking-[0.14em] text-blood transition-colors hover:bg-blood/25"
                style={{ willChange: "transform" }}
              >
                <Flame className="h-4 w-4" aria-hidden />
                Crack it — {formatSol(bid, 2)} SOL
              </motion.button>
            </motion.div>
          )}

          {/* ── ROLLING ── */}
          {phase === "rolling" && (
            <motion.div key="rolling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5 py-8">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
                style={{ willChange: "transform" }}
                className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-blood/50"
              >
                <Crosshair className="h-8 w-8 text-blood" aria-hidden />
              </motion.div>
              <span className="font-display text-lg font-black uppercase tracking-[0.2em] text-white">Cracking…</span>
              <span className="font-mono text-[10px] text-dim">Rolling the vault (VRF)</span>
            </motion.div>
          )}

          {/* ── RESULT ── */}
          {phase === "result" && result && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 22 }} className="flex flex-col items-center gap-4 py-4 text-center">
              {result.outcome === "win" ? (
                <>
                  <motion.div
                    initial={{ scale: 0.4, rotate: -12 }}
                    animate={{ scale: [0.4, 1.15, 1], rotate: 0 }}
                    transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                    className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/40 bg-gold/15"
                    style={{ willChange: "transform" }}
                  >
                    <TrendingUp className="h-8 w-8 text-gold" aria-hidden />
                  </motion.div>
                  <span className="font-display text-3xl font-black uppercase tracking-[0.1em] gold-text-gradient">Snatched!</span>
                  <span className="font-mono text-sm text-slate">You cracked {truncateAddress(result.targetWallet, 4, 4)}</span>
                  <span className="font-display text-4xl font-black tabular-nums text-[#FF9900]">+{formatSol(result.seized, 3)}</span>
                  <span className="font-mono text-[11px] text-dim">Stash now {formatSol(result.yourStashAfter, 3)} SOL</span>
                </>
              ) : (
                <>
                  <motion.div
                    initial={{ scale: 0.4 }}
                    animate={{ scale: [0.4, 1.1, 1] }}
                    transition={{ duration: 0.4 }}
                    className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate/30 bg-slate/10"
                    style={{ willChange: "transform" }}
                  >
                    <ShieldAlert className="h-8 w-8 text-slate" aria-hidden />
                  </motion.div>
                  <span className="font-display text-3xl font-black uppercase tracking-[0.1em] text-slate">Bounced</span>
                  <span className="font-mono text-sm text-slate">{truncateAddress(result.targetWallet, 4, 4)} held the vault</span>
                  <span className="font-display text-3xl font-black tabular-nums text-blood">−{formatSol(result.bid, 3)}</span>
                  <span className="font-mono text-[11px] text-dim">Your bid funded their stash</span>
                </>
              )}

              <motion.button
                type="button"
                onClick={onClose}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.14 }}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.05] py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/[0.1]"
                style={{ willChange: "transform" }}
              >
                Back to the board
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
