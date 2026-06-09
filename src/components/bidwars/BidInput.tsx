/**
 * Bid Wars — BidInput
 *
 * The savage bid placement panel.
 * Shows min bid, quick-raise buttons, custom input, submit.
 * Has a live "you'll win if you bid X now" calculation.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, ChevronUp, AlertTriangle } from "lucide-react";
import { formatSol } from "@/lib/utils";
import { BID_CONFIG } from "@/lib/bidWarsState";

interface BidInputProps {
  minNextBid: number;
  currentBag: number;
  onBid: (amount: number) => boolean;
  disabled?: boolean;
  youAreLeader?: boolean;
}

const QUICK_RAISES = [0.25, 0.5, 1.0, 2.5];

export function BidInput({
  minNextBid,
  currentBag,
  onBid,
  disabled = false,
  youAreLeader = false,
}: BidInputProps) {
  const [amount, setAmount] = useState(minNextBid.toFixed(3));
  const [flash,  setFlash]  = useState<"success" | "error" | null>(null);

  const numAmount = parseFloat(amount) || 0;
  const isValid   = numAmount >= minNextBid - 0.001;
  const profit    = currentBag - numAmount;

  function handleBid() {
    if (disabled || youAreLeader) return;
    const val = parseFloat(amount);
    if (isNaN(val) || val < minNextBid - 0.001) {
      setFlash("error");
      setTimeout(() => setFlash(null), 800);
      return;
    }
    const ok = onBid(val);
    if (ok) {
      setFlash("success");
      setTimeout(() => setFlash(null), 600);
      // Auto-bump amount for next bid
      setAmount((val + BID_CONFIG.MIN_RAISE).toFixed(3));
    } else {
      setFlash("error");
      setTimeout(() => setFlash(null), 800);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">

      {/* You are leader message */}
      {youAreLeader && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gold/20 bg-gold/[0.06] px-4 py-3">
          <Swords className="h-4 w-4 text-gold" aria-hidden />
          <span className="font-mono text-xs text-gold">You lead — defend until zero</span>
        </div>
      )}

      {/* Minimum bid info */}
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[11px] text-dim">Min bid</span>
        <span className="font-mono text-sm font-bold text-slate">
          {formatSol(minNextBid, 3)} SOL
        </span>
      </div>

      {/* Quick-raise buttons */}
      <div className="flex gap-2">
        {QUICK_RAISES.map((raise) => {
          const val = +(minNextBid + raise).toFixed(3);
          return (
            <button
              key={raise}
              type="button"
              onClick={() => setAmount(val.toFixed(3))}
              disabled={disabled || youAreLeader}
              className="flex flex-1 flex-col items-center rounded-xl border border-white/[0.08] bg-white/[0.04] py-2 transition-colors duration-150 hover:border-blood/40 hover:bg-blood/[0.06] disabled:opacity-40"
            >
              <span className="font-mono text-[10px] text-dim">+{formatSol(raise, 2)}</span>
              <span className="font-mono text-xs font-bold text-white">
                {formatSol(val, 2)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom input + submit */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleBid()}
            min={minNextBid}
            step={0.25}
            disabled={disabled || youAreLeader}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 font-mono text-sm text-white outline-none transition-colors duration-150 focus:border-blood/50 focus:bg-white/[0.06] disabled:opacity-40"
            placeholder={minNextBid.toFixed(3)}
            aria-label="Bid amount in SOL"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-dim">
            SOL
          </span>
        </div>

        <motion.button
          type="button"
          onClick={handleBid}
          disabled={disabled || youAreLeader || !isValid}
          whileHover={!disabled && !youAreLeader ? { scale: 1.04 } : undefined}
          whileTap={!disabled && !youAreLeader ? { scale: 0.96 } : undefined}
          transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
          className="relative flex items-center gap-2 overflow-hidden rounded-xl px-5 py-3.5 font-sans text-sm font-bold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: flash === "error"
              ? "#b81700"
              : isValid
                ? "linear-gradient(180deg, #FF5533, #FF2200 55%, #B81700)"
                : "rgba(255,34,0,0.3)",
            boxShadow: isValid && !disabled
              ? "0 8px 24px rgba(255,34,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)"
              : "none",
          }}
          aria-label={`Place bid of ${amount} SOL`}
        >
          <ChevronUp className="h-4 w-4" aria-hidden />
          BID
          {/* flash overlay */}
          <AnimatePresence>
            {flash === "success" && (
              <motion.span
                key="ok"
                className="absolute inset-0 rounded-xl bg-emerald/40"
                initial={{ opacity: 0.8 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              />
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Profit display */}
      {isValid && numAmount > 0 && (
        <div
          className="flex items-center justify-between rounded-xl border px-4 py-2.5"
          style={{
            borderColor: profit > 0 ? "rgba(0,230,118,0.2)" : "rgba(255,34,0,0.2)",
            background:  profit > 0 ? "rgba(0,230,118,0.05)" : "rgba(255,34,0,0.05)",
          }}
        >
          <span className="font-mono text-[11px] text-slate">If you win →</span>
          <span
            className="font-mono text-sm font-bold tabular-nums"
            style={{ color: profit > 0 ? "#00E676" : "#FF2200" }}
          >
            {profit > 0 ? "+" : ""}{formatSol(profit, 3)} SOL
          </span>
        </div>
      )}

      {/* Warning if bidding high */}
      {numAmount > 10 && (
        <div className="flex items-center gap-2 rounded-xl border border-gold/20 bg-gold/[0.04] px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-gold/70" aria-hidden />
          <span className="font-mono text-[10px] text-gold/70">
            Big bid. Others will know you want this bag.
          </span>
        </div>
      )}
    </div>
  );
}
