import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Swords, ShieldAlert, Timer } from "lucide-react";
import { formatSol } from "@/lib/utils";

interface YoinkButtonProps {
  onYoink: () => void;
  critical: boolean;
  disabled?: boolean;
  youAreKing?: boolean;
  /** current cost in SOL */
  cost: number;
  /** ms remaining on player cooldown (0 = ready) */
  cooldownLeft: number;
  /** how many yoinks this round — drives escalation label */
  yoinkCount: number;
}

export function YoinkButton({
  onYoink,
  critical,
  disabled = false,
  youAreKing = false,
  cost,
  cooldownLeft,
  yoinkCount,
}: YoinkButtonProps) {
  const [bursts, setBursts] = useState<number[]>([]);
  const onCooldown = cooldownLeft > 0;
  const isBlocked = disabled || youAreKing || onCooldown;

  const handleClick = () => {
    if (isBlocked) return;
    const id = Date.now();
    setBursts((b) => [...b, id]);
    setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 650);
    onYoink();
  };

  /* ── label logic ── */
  let label: string;
  let sublabel: string | null = null;

  if (youAreKing) {
    label = "You hold the bag — defend it";
  } else if (onCooldown) {
    const secs = (cooldownLeft / 1000).toFixed(1);
    label = `Anti-snipe cooldown — ${secs}s`;
    sublabel = "One YOINK per 3 seconds — no bots allowed";
  } else {
    label = `YOINK THE BAG — ${formatSol(cost, 3)} SOL`;
    if (yoinkCount > 0) {
      sublabel = `Cost escalates each round · was ${formatSol(cost - 0.025 < 0.1 ? 0.1 : cost - 0.025, 3)} SOL`;
    }
  }

  /* ── escalation intensity: how "hot" is the cost compared to base ── */
  const escalationFrac = Math.min((cost - 0.1) / 0.4, 1); // 0 at base, 1 at max
  const isBurning = escalationFrac > 0.4;

  return (
    <>
      {/* full-screen radial burst */}
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
                  : isBurning
                    ? "radial-gradient(circle, rgba(255,153,0,0.55), transparent 60%)"
                    : "radial-gradient(circle, rgba(255,215,0,0.5), transparent 60%)",
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="flex w-full flex-col gap-2">
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
        >
          {/* cooldown progress bar — fills from left */}
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
                  background: "rgba(255,255,255,0.12)",
                  transformOrigin: "left center",
                }}
                aria-hidden
              />
            )}
          </AnimatePresence>

          {onCooldown ? (
            <Timer className="h-5 w-5 shrink-0" aria-hidden />
          ) : youAreKing ? (
            <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
          ) : (
            <Swords className="h-5 w-5 shrink-0" aria-hidden />
          )}
          <span className="relative z-10">{label}</span>

          {/* escalation heat tint overlay */}
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

        {/* sublabel row */}
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

        {/* escalation cost ladder — shows when cost is rising */}
        {!onCooldown && !youAreKing && yoinkCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2"
          >
            <span className="font-mono text-[10px] text-dim">Cost ladder:</span>
            {[0, 1, 2, 3, 4].map((step) => {
              const stepCost = Math.min(0.1 + step * 0.025, 0.5);
              const active = Math.abs(stepCost - cost) < 0.001;
              const past = stepCost < cost - 0.001;
              return (
                <span
                  key={step}
                  className="font-mono text-[10px] tabular-nums transition-colors duration-200"
                  style={{
                    color: active
                      ? "#FFD700"
                      : past
                        ? "#3a3f4f"
                        : "#8892a4",
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
