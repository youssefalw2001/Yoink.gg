import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Check } from "lucide-react";
import { truncateAddress } from "@/lib/utils";
import { randomWallet } from "@/lib/wallets";

/**
 * WalletButton — simulated Solana wallet connect.
 * Connected state surfaces a truncated address + live dot.
 */
export function WalletButton() {
  const [address, setAddress] = useState<string | null>(null);

  const connect = () => setAddress(randomWallet());

  return (
    <motion.button
      type="button"
      onClick={connect}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
      className="group relative flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm font-medium backdrop-blur-md sm:px-4"
      aria-label={address ? "Wallet connected" : "Connect wallet"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {address ? (
          <motion.span
            key="connected"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2"
          >
            <span className="blink-dot" aria-hidden />
            <span className="font-mono text-[13px] text-gold-soft">
              {truncateAddress(address)}
            </span>
            <Check className="h-3.5 w-3.5 text-emerald" aria-hidden />
          </motion.span>
        ) : (
          <motion.span
            key="disconnected"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2"
          >
            <Wallet className="h-4 w-4 text-gold" aria-hidden />
            <span className="hidden sm:inline">Connect Wallet</span>
            <span className="sm:hidden">Connect</span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
