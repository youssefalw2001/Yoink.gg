/**
 * YoinkButton — Trinity Model update
 *
 * Temporal pricing removed. Escalating fee replaces it.
 * roundFeeMultiplier: 1.0 = fresh round, 2.5 = maximum heat.
 *
 * Button states:
 *   king     → ShieldAlert "You hold the bag — defend it"
 *   cooldown → Timer + progress bar
 *   hot (fee > 1.5) → Flame badge warning cost is escalating
 *   normal   → Swords + cost display
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Swords, ShieldAlert, Timer, Flame } from "lucide-react";
import { FUSE_CONFIG } from "@/lib/types";
import { formatSol } from "@/lib/utils";

interface YoinkButtonProps {
  onYoink: () => void;
  critical: boolean;
  disabled?: boolean;
  youAreKing?: boolean;
  cost: number;
  cooldownLeft: number;
  yoinkCount: number;
  /**
   * Escalating fee multiplier for this round (1.0 = fresh, 2.5 = max heat).
   * Drives the "HOT" badge and cost colour intensity.
   */
  roundFeeMultiplier?: number;
}

export function YoinkButton({
  onYoink,
  critical,
  disabled = false,
  youAreKing = false,
  cost,
  cooldownLeft,
  yoinkCount,
  roundFeeMultiplier = 1,
}: YoinkButtonProps) {
  const [bursts, setBursts] = useState<number[]>([]);
  const onCooldown = cooldownLeft > 0;
  const isBlocked  = disabled || youAreKing || onCooldown;

  const handleClick = () => {
    if (isBlocked) return;
    const id = Date.now();
    setBursts((b) => [...b, id]);
    setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 650);
    onYoink();
  };

  // ── Escalating fee state ───────────────────────────────────────────────────
  const feeIntensity = (roundFeeMultiplier - 1) / (FUSE_CONFIG.FEE_MAX_MULT - 1);
  const isHot        = roundFeeMultiplier > 1.5;
  const isBlazing    = roundFeeMultiplier > 2.0;

  // ── Burst colour ───────────────────────────────────────────────────────────
  const burstColor = critical
    ? "rgba(255,34,0,0.55)"
    : isBlazing
      ? "rgba(255,100,0,0.55)"
      : "rgba(255,215,0,0.5)";

  // ── Button tint ───────────────────────────────────────────────────────────
  const tintColor = critical
    ? "rgba(255,34,0,0.18)"
    : isBlazing
      ? "rgba(255,100,0,0.14)"
      : isHot
        ? "rgba(255,153,0,0.08)"
        : "transparent";

  // ── Label ──────────────────────────────────────────────────────────────────
  let label: string;
  let sublabel: string | null = null;

  if (youAreKing) {
    label = "You hold the bag — defend it";
  } else if (onCooldown) {
    const secs = (cooldownLeft / 1000).toFixed(1);
    label    = `Anti-snipe cooldown — ${secs}s`;
    sublabel = "One YOINK per 3 seconds — no bots allowed";
  } else {
    label = `YOINK THE BAG — ${formatSol(cost, 3)} SOL`;
    if (isBlazing) {
      sublabel = `Fee blazing — ${roundFeeMultiplier.toFixed(1)}× base. Act now or pay more.`;
    } else if (isHot) {
      sublabel = `Fee heating up — ${((roundFeeMultiplier - 1) * 100).toFixed(0)}% above base cost`;
    } else if (yoinkCount > 0) {
      sublabel = `+${(FUSE_CONFIG.FEE_STEP * 100).toFixed(0)}% per YOINK this round`;
    }
  }

  return (
    <>
      {/* Full-screen radial burst on click */}
      <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center overflow-hidden">
        <AnimatePresence>
          {bursts.map((id) => (
            <motion.div
              key={id}
              initial={{ scale: 0, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="absolute rounded-full"
              style={{
                width: "100vmax",
                height: "100vmax",
                background: `radial-gradient(circle, ${burstColor}, transparent 60%)`,
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="flex w-full flex-col gap-2">

        {/* ── HOT badge — escalating fee warning ───────────────────────── */}
        <AnimatePresence>
          {isHot && !onCooldown && !youAreKing && (
            <motion.div
              key="hot-badge"
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-center gap-2 rounded-xl py-2"
              style={{
                background: isBlazing ? "rgba(255,34,0,0.10)" : "rgba(255,100,0,0.07)",
                border:     isBlazing ? "1px solid rgba(255,34,0,0.25)" : "1px solid rgba(255,100,0,0.18)",
                willChange: "transform",
              }}
            >
              <Flame
                className="h-3.5 w-3.5"
                style={{ color: isBlazing ? "#FF2200" : "#FF6600" }}
                aria-hidden
              />
              <span
                className="font-mono text-xs font-bold uppercase tracking-[0.12em]"
                style={{ color: isBlazing ? "#FF2200" : "#FF6600" }}
              >
                {isBlazing
                  ? `Blazing — ${roundFeeMultiplier.toFixed(1)}× base`
                  : `Hot — ${((roundFeeMultiplier - 1) * 100).toFixed(0)}% fee added`}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main button ──────────────────────────────────────────────── */}
        <motion.button
          type="button"
          onClick={handleClick}
          disabled={isBlocked}
          whileHover={!isBlocked ? { scale: 1.04 } : undefined}
          whileTap={!isBlocked ? { scale: 0.96 } : undefined}
          transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
          data-critical={critical && !onCooldown}
          className="gold-button relative flex w-full items-center justify-center gap-2.5 overflow-hidden px-8 py-4 text-base disabled:cursor-not-allowed disabled:opacity-60 sm:text-lg"
          aria-label={label}
          style={{ willChange: "transform" }}
        >
          {/* Cooldown bar */}
          <AnimatePresence>
            {onCooldown && (
              <motion.span
                key="coolbar"
                className="pointer-events-none absolute inset-0 origin-left"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: cooldownLeft / 3000 }}
                exit={{ scaleX: 0 }}
                transition={{ duration: 0.1, ease: "linear" }}
                style={{
                  background:      "rgba(255,255,255,0.12)",
                  transformOrigin: "left center",
                  willChange:      "transform",
                }}
                aria-hidden
              />
            )}
          </AnimatePresence>

          {/* Heat tint overlay */}
          {!onCooldown && !youAreKing && (
            <span
              className="pointer-events-none absolute inset-0 rounded-[inherit] transition-colors duration-500"
              style={{ background: tintColor }}
              aria-hidden
            />
          )}

          {/* Fee intensity heat fill (left→right gradient as fee builds) */}
          {isHot && !onCooldown && !youAreKing && (
            <span
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                background: `linear-gradient(90deg, transparent, rgba(255,${isBlazing ? "34" : "100"},0,${feeIntensity * 0.22}))`,
              }}
              aria-hidden
            />
          )}

          {/* Icon */}
          {onCooldown ? (
            <Timer className="h-5 w-5 shrink-0" aria-hidden />
          ) : youAreKing ? (
            <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
          ) : (
            <Swords className="h-5 w-5 shrink-0" aria-hidden />
          )}

          {/* Cost — animates on change */}
          <span className="relative z-10 flex items-center gap-2">
            {!youAreKing && !onCooldown ? (
              <>
                <span>YOINK THE BAG —</span>
                <motion.span
                  key={cost.toFixed(3)}
                  initial={{
                    scale: 1.12,
                    color: isBlazing ? "#FF2200" : isHot ? "#FF6600" : "#FFE566",
                  }}
                  animate={{ scale: 1, color: "#08080f" }}
                  transition={{ duration: 0.3 }}
                  className="font-mono font-black tabular-nums"
                  style={{ willChange: "transform" }}
                >
                  {formatSol(cost, 3)} SOL
                </motion.span>
              </>
            ) : (
              label
            )}
          </span>
        </motion.button>

        {/* ── Sublabel ─────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {sublabel && (
            <motion.p
              key={sublabel}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="text-center font-mono text-[10px] text-slate"
            >
              {onCooldown ? (
                <span className="flex items-center justify-center gap-1.5 text-blood">
                  <ShieldAlert className="h-3 w-3" aria-hidden />
                  {sublabel}
                </span>
              ) : (
                sublabel
              )}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
