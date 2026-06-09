import { motion } from "framer-motion";
import { formatSol } from "@/lib/utils";

interface BagAmountProps {
  amount: number;
}

/**
 * BagAmount — the centerpiece prize counter.
 * A key-change on the rounded value triggers a spring pop (scale 1 → 1.06 → 1).
 */
export function BagAmount({ amount }: BagAmountProps) {
  const display = formatSol(amount);

  return (
    <div className="flex flex-col items-center">
      <motion.div
        key={display}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
        className="flex items-baseline gap-3"
      >
        <span
          className="gold-text-gradient font-display font-black leading-none"
          style={{ fontSize: "clamp(64px, 10vw, 120px)" }}
        >
          {display}
        </span>
        <span className="font-display text-2xl font-bold text-gold/70 sm:text-3xl">
          SOL
        </span>
      </motion.div>
      <span className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
        Bounty Bag
      </span>
    </div>
  );
}
