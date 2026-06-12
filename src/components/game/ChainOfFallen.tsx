import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame } from "lucide-react";
import type { King } from "@/lib/types";
import { truncateAddress } from "@/lib/utils";

interface ChainOfFallenProps {
  kings: King[];
}

export const ChainOfFallen = memo(function ChainOfFallen({ kings }: ChainOfFallenProps) {
  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Flame className="h-3.5 w-3.5 text-gold-deep" aria-hidden />
        <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
          Chain of Fallen
        </h3>
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        <AnimatePresence initial={false} mode="popLayout">
          {kings.map((k) => (
            <motion.div
              key={k.id}
              layout
              initial={{ x: 120, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 340, damping: 30 }}
              className="premium-card flex min-w-[140px] shrink-0 flex-col gap-1.5 px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-white/90">
                  {k.isYou ? "You" : truncateAddress(k.wallet)}
                </span>
                <Flame
                  className="h-3 w-3 text-dim"
                  aria-hidden
                  style={{ opacity: 0.5 }}
                />
              </div>
              <span className="font-mono text-[11px] text-slate">
                held {k.heldFor}s
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
});
