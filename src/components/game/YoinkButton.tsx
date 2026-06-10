import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Swords, ShieldAlert, Timer, TrendingDown, TrendingUp } from "lucide-react";
import { formatSol } from "@/lib/utils";

interface YoinkButtonProps {
  onYoink: () => void;
  critical: boolean;
  disabled?: boolean;
  youAreKing?: boolean;
  /** Current cost in SOL — already includes temporal multiplier */
  cost: number;
  /** ms remaining on player cooldown (0 = ready) */
  cooldownLeft: number;
  /** How many yoinks this round */
  yoinkCount: number;
  /**
   * The temporal multiplier currently applied (from GameState.temporalMultiplier).
   * 1.0 = neutral. <1 = cheap window. >1 = expensive early phase.
   * undefined = temporal pricing not active for this room (The Pit).
   */
  temporalMultiplier?: number;
}

export function YoinkButton({
  onYoink,
  critical,
  disabled = false,
  youAreKing = false,
  cost,
  cooldownLeft,
  yoinkCount,
  temporalMultiplier,
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

  // ── Temporal state classification ────────────────────────────────────────
  const hasTemporalPricing = temporalMultiplier !== undefined;
  const isCheapWindow    = hasTemporalPricing && temporalMultiplier < 0.75;
  const isExpensiveEarly = hasTemporalPricing && temporalMultiplier > 1.25;

  // ── Escalation intensity from yoink count (unchanged) ───────────────────
  const escalationFrac = Math.min((cost - 0.1) / 0.4, 1);
  const isBurning = escalationFrac > 0.4;

  // ── Label logic ───────────────────────────────────────────────────────────
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
    if (isCheapWindow) {
      sublabel = `Cheap snipe window — ${(temporalMultiplier! * 100).toFixed(0)}% of base price`;
    } else if (isExpensiveEarly) {
      sublabel = `Early lock-in — ${(temporalMultiplier! * 100).toFixed(0)}% of base price`;
    } else if (yoinkCount > 0) {
      sublabel = `Cost escalates each round · was ${formatSol(cost - 0.025 < 0.1 ? 0.1 : cost - 0.025, 3)} SOL`;
    }
  }

  // ── Button accent colour based on temporal state ─────────────────────────
  // Cheap window = green tint hint (opportunity)
  // Expensive early = orange/red tint (warning)
  // Critical countdown overrides everything with blood red
  const temporalTint = critical
    ? "rgba(255,34,0,0.18)"
    : isCheapWindow
      ? "rgba(0,230,118,0.10)"
      : isExpensiveEarly
        ? "rgba(255,100,0,0.12)"
        : "transparent";

  return (
    <>
      {/* full-screen radial burst on click */}
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
                background: critical
                  ? "radial-gradient(circle, rgba(255,34,0,0.55), transparent 60%)"
                  : isCheapWindow
                    ? "radial-gradient(circle, rgba(0,230,118,0.45), transparent 60%)"
                    : isBurning
                      ? "radial-gradient(circle, rgba(255,153,0,0.55), transparent 60%)"
                      : "radial-gradient(circle, rgba(255,215,0,0.5), transparent 60%)",
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="flex w-full flex-col gap-2">

        {/* ── Cheap window badge — appears above button ────────────────── */}
        <AnimatePresence>
          {isCheapWindow && !onCooldown && !youAreKing && (
            <motion.div
              key="cheap-badge"
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-center gap-2 rounded-xl border border-emerald/30 bg-emerald/10 py-2"
              style={{ willChange: "transform" }}
            >
              <TrendingDown className="h-3.5 w-3.5 text-emerald" aria-hidden />
              <span className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-emerald">
                Cheap snipe window — {formatSol(cost, 3)} SOL
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Expensive early badge ─────────────────────────────────────── */}
        <AnimatePresence>
          {isExpensiveEarly && !onCooldown && !youAreKing && !isCheapWindow && (
            <motion.div
              key="expensive-badge"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-center gap-2 rounded-xl border border-gold/20 bg-gold/[0.06] py-2"
              style={{ willChange: "transform" }}
            >
              <TrendingUp className="h-3.5 w-3.5 text-gold" aria-hidden />
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-gold/70">
                Early position — {(temporalMultiplier! * 100).toFixed(0)}% premium
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
          {/* cooldown progress bar */}
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

          {/* temporal tint overlay */}
          {hasTemporalPricing && !onCooldown && !youAreKing && (
            <span
              className="pointer-events-none absolute inset-0 rounded-[inherit] transition-colors duration-500"
              style={{ background: temporalTint }}
              aria-hidden
            />
          )}

          {onCooldown ? (
            <Timer className="h-5 w-5 shrink-0" aria-hidden />
          ) : youAreKing ? (
            <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
          ) : (
            <Swords className="h-5 w-5 shrink-0" aria-hidden />
          )}

          {/* Cost display with live animation when temporal pricing is active */}
          <span className="relative z-10 flex items-center gap-2">
            {!youAreKing && !onCooldown && hasTemporalPricing ? (
              <>
                <span>YOINK THE BAG —</span>
                <motion.span
                  key={cost.toFixed(3)}
                  initial={{ scale: 1.15, color: isCheapWindow ? "#00E676" : "#FFE566" }}
                  animate={{ scale: 1, color: "#08080f" }}
                  transition={{ duration: 0.35 }}
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

          {/* escalation heat tint */}
          {isBurning && !onCooldown && !youAreKing && (
            <span
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                background: `linear-gradient(90deg, transparent, rgba(255,100,0,${escalationFrac * 0.25}))`,
              }}
              aria-hidden
            />
          )}
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

        {/* ── Cost ladder (non-temporal rooms only) ────────────────────── */}
        {!hasTemporalPricing && !onCooldown && !youAreKing && yoinkCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2"
          >
            <span className="font-mono text-[10px] text-dim">Cost ladder:</span>
            {[0, 1, 2, 3, 4].map((step) => {
              const stepCost = Math.min(0.1 + step * 0.025, 0.5);
              const active   = Math.abs(stepCost - cost) < 0.001;
              const past     = stepCost < cost - 0.001;
              return (
                <span
                  key={step}
                  className="font-mono text-[10px] tabular-nums transition-colors duration-200"
                  style={{
                    color:      active ? "#FFD700" : past ? "#3a3f4f" : "#8892a4",
                    fontWeight: active ? 700 : 400,
                  }}
                >
                  {formatSol(stepCost, 2)}
                </span>
              );
            })}
            {cost >= 0.2 && (
              <span className="font-mono text-[10px] text-gold-deep">…</span>
            )}
          </motion.div>
        )}
      </div>
    </>
  );
}
