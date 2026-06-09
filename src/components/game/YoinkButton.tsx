import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Swords } from "lucide-react";
import { GAME_CONFIG } from "@/lib/types";

interface YoinkButtonProps {
  onYoink: () => void;
  critical: boolean;
  disabled?: boolean;
  youAreKing?: boolean;
}

export function YoinkButton({
  onYoink,
  critical,
  disabled = false,
  youAreKing = false,
}: YoinkButtonProps) {
  const [bursts, setBursts] = useState<number[]>([]);

  const handleClick = () => {
    if (disabled || youAreKing) return;
    const id = Date.now();
    setBursts((b) => [...b, id]);
    setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 650);
    onYoink();
  };

  const label = youAreKing
    ? "You hold the bag"
    : `Yoink the Bag — ${GAME_CONFIG.YOINK_COST} SOL`;

  return (
    <>
      {/* full-screen radial burst layer */}
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
                  : "radial-gradient(circle, rgba(255,215,0,0.5), transparent 60%)",
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      <motion.button
        type="button"
        onClick={handleClick}
        disabled={disabled || youAreKing}
        whileHover={!youAreKing && !disabled ? { scale: 1.04 } : undefined}
        whileTap={!youAreKing && !disabled ? { scale: 0.96 } : undefined}
        transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
        data-critical={critical}
        className="gold-button flex w-full items-center justify-center gap-2.5 px-8 py-4 text-base disabled:cursor-not-allowed disabled:opacity-50 sm:text-lg"
        aria-label={label}
      >
        <Swords className="h-5 w-5" aria-hidden />
        {label}
      </motion.button>
    </>
  );
}
