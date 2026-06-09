import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useSpring } from "@react-spring/web";
import { annotate } from "rough-notation";
import { formatSol } from "@/lib/utils";

interface BagAmountProps {
  amount: number;
}

/**
 * BagAmount — upgraded with:
 *  1. React Spring number count-up (smoother than RAF)
 *  2. Rough Notation gold bracket highlight on first mount
 *  3. Framer Motion spring pop on value change (original mechanic preserved)
 */
export function BagAmount({ amount }: BagAmountProps) {
  const [displayAmount, setDisplayAmount] = useState(amount);
  const prevAmount = useRef(amount);
  const labelRef = useRef<HTMLSpanElement>(null);
  const annotationRef = useRef<ReturnType<typeof annotate> | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  // React Spring spring physics — drives the display number
  useSpring({
    val: amount,
    from: { val: prevAmount.current },
    config: { tension: 180, friction: 22, precision: 0.001 },
    onChange: ({ value }: { value: { val: number } }) => {
      setDisplayAmount(value.val);
    },
  });

  useEffect(() => {
    prevAmount.current = amount;
  }, [amount]);

  // Rough Notation gold bracket on mount — fires once
  useEffect(() => {
    if (labelRef.current && !hasMounted) {
      setHasMounted(true);
      // Small delay so page is painted first
      const t = setTimeout(() => {
        if (!labelRef.current) return;
        const a = annotate(labelRef.current, {
          type: "bracket",
          color: "#FFD700",
          padding: 8,
          brackets: ["left", "right"],
          strokeWidth: 2,
          animationDuration: 800,
        });
        annotationRef.current = a;
        a.show();
      }, 600);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const display = formatSol(displayAmount);

  // Check prefers-reduced-motion
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="flex flex-col items-center">
      <motion.div
        key={Math.round(amount * 10)}
        initial={{ scale: 1 }}
        animate={prefersReduced ? {} : { scale: [1, 1.06, 1] }}
        transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
        className="flex items-baseline gap-3"
      >
        <span
          ref={labelRef}
          className="gold-text-gradient font-display font-black leading-none"
          style={{ fontSize: "clamp(64px, 10vw, 120px)" }}
          aria-live="polite"
          aria-label={`Bounty bag: ${display} SOL`}
        >
          {prefersReduced ? formatSol(amount) : display}
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
