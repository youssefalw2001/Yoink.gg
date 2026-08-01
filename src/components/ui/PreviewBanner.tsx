/**
 * PreviewBanner — persistent, honest indicator that the visitor is in guest mode.
 *
 * Shown directly under the header for the whole session while `previewMode` is
 * active (launch-hardening Req 2.6), so the guest state is never ambiguous on any
 * screen. Offers the two exits a guest needs: connect a wallet (Req 2.8) or drop
 * back to the landing gate.
 *
 * GPU-safe (opacity/transform only), reduced-motion aware, lucide icons only,
 * zero emojis — consistent with the rest of the UI.
 */

import { motion } from "framer-motion";
import { Eye, Wallet, X } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { formatSol } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/components/walletwars/useReducedMotion";

/**
 * The standard "where do these stakes come from" footnote under a stake control.
 *
 * Connected → shows the real on-chain balance next to the simulated-stakes note.
 * Preview   → saying "Real balance: 0.00 SOL" to a guest reads as a broken
 *             wallet, so it names the guest state instead.
 * Either way the simulated nature of the stakes is stated, never implied.
 */
export function SimStakesNote({ walletBalance }: { walletBalance: number }) {
  const { previewMode } = useWallet();
  return (
    <p className="text-center font-mono text-[10px] text-dim">
      {previewMode
        ? "Preview mode · no wallet connected · stakes are simulated (devnet)"
        : `Real balance: ${formatSol(walletBalance, 2)} SOL · stakes are simulated (devnet)`}
    </p>
  );
}

export function PreviewBanner() {
  const { previewMode, connect, exitPreview, connecting } = useWallet();
  const reduced = usePrefersReducedMotion();

  if (!previewMode) return null;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-30 w-full border-b border-gold/20"
      style={{ background: "rgba(255,215,0,0.06)", willChange: "transform" }}
      role="status"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 sm:px-6">
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-gold">
          <Eye className="h-3.5 w-3.5" aria-hidden />
          Preview mode
        </span>
        <span className="font-mono text-[10px] leading-relaxed text-slate">
          You are exploring as a guest — no wallet connected. Stakes are simulated, so nothing
          you do here moves real SOL. Progress is saved to this browser only.
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void connect()}
            disabled={connecting}
            className="flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-gold transition-colors duration-150 hover:bg-gold/20 disabled:opacity-60"
            aria-label="Connect a wallet"
          >
            <Wallet className="h-3 w-3" aria-hidden />
            {connecting ? "Connecting…" : "Connect"}
          </button>
          <button
            type="button"
            onClick={exitPreview}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-dim transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            aria-label="Exit preview mode"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
