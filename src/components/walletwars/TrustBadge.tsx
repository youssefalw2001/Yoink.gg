/**
 * TrustBadge — always-visible header trust signal (NOT a disclaimer).
 *
 * Shows "Provably Fair · {Network} · Sim Stakes". Tapping it opens a modal that
 * explains, in plain language, exactly how far the fairness guarantee goes in the
 * CURRENT build — including what it does not yet cover — and links to the
 * published `siegeMath.ts` so anyone can read the crack thresholds and money math
 * themselves.
 *
 * The copy is gated on `isEscrowLive()`: while escrow is off it never claims
 * on-chain settlement or that manipulation is impossible, because the seed is
 * generated client-side (launch-hardening Req 3).
 *
 * Self-contained (owns its own modal state) so it can live in the shared Header
 * without threading state through the app. GPU-safe, reduced-motion aware,
 * lucide icons only, zero emojis.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck, X, ExternalLink, Hash, Lock, Eye } from "lucide-react";
import { NETWORK_LABEL } from "@/lib/solana";
import { isEscrowLive } from "@/lib/walletWarsChain";
import { usePrefersReducedMotion } from "./useReducedMotion";

/** Public source link for the frozen siege money-math + crack thresholds. */
const SIEGE_MATH_URL = "https://github.com/youssefalw2001/Yoink.gg/blob/main/src/lib/siegeMath.ts";

/**
 * Fairness claims for the CURRENT simulation build (launch-hardening Req 3).
 *
 * Deliberately does NOT claim on-chain verifiability or that manipulation is
 * impossible: `ESCROW_ENABLED` is false and the seed is generated client-side, so
 * either claim would be false. The third point states that limitation outright —
 * an honest boundary earns more trust than an overclaim a user can disprove.
 */
const POINTS_SIM = [
  {
    icon: Hash,
    title: "Revealed seed",
    body: "Every siege outcome comes from a seed that is revealed with the result. You can recompute the roll yourself and check it matches.",
  },
  {
    icon: Lock,
    title: "Fixed, published odds",
    body: "The crack chance is fixed and published per tier and risk profile before you commit. A siege wins only if the roll lands below that line.",
  },
  {
    icon: Eye,
    title: "What this build does NOT do yet",
    body: "Outcomes are computed in your browser from a locally generated seed — not settled on-chain. So this is verifiable, but not yet trustless. No real SOL is at stake, and on-chain settlement is what will close that gap.",
  },
] as const;

/** Claims permitted only once real escrow + on-chain settlement are live (Req 3.5). */
const POINTS_LIVE = [
  {
    icon: Hash,
    title: "On-chain seed",
    body: "Every siege outcome comes from a seed committed and revealed on-chain. You can recompute the roll from public data.",
  },
  {
    icon: Lock,
    title: "Fixed, published odds",
    body: "The crack chance is fixed and published per tier and risk profile before you commit. A siege wins only if the roll lands below that line.",
  },
  {
    icon: Eye,
    title: "Settled by the program",
    body: "Payouts are executed by the on-chain program, so the seed, the roll, and the threshold are all independently auditable.",
  },
] as const;

export function TrustBadge() {
  const [open, setOpen] = useState(false);
  const reduced = usePrefersReducedMotion();
  const live = isEscrowLive();
  const settlement = live ? "On-Chain" : "Sim Stakes";
  const points = live ? POINTS_LIVE : POINTS_SIM;
  /**
   * "Provably fair" is a term of art that implies trustless, on-chain
   * verification. While outcomes are computed in the browser the accurate claim is
   * the weaker one — and it would be self-defeating to headline a stronger claim
   * directly above a panel explaining the build does not meet it.
   */
  const headline = live ? "Provably Fair" : "Verifiable";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald/25 bg-emerald/[0.08] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-emerald transition-colors hover:bg-emerald/[0.14]"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="How provable fairness works"
        title="Provably fair — tap to see how it works"
      >
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">{headline} · {NETWORK_LABEL} · {settlement}</span>
        <span className="sm:hidden">Fair</span>
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[120] flex items-center justify-center px-5"
                style={{ background: "rgba(8,8,15,0.92)", backdropFilter: "blur(12px)" }}
                role="dialog"
                aria-modal="true"
                aria-label="Provable fairness"
                onClick={() => setOpen(false)}
              >
                <motion.div
                  initial={{ scale: 0.94, y: 14, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 26 }}
                  className="premium-card relative w-full max-w-md rounded-[24px] px-6 py-7"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="absolute right-4 top-4 text-dim transition-colors hover:text-white"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>

                  <div className="flex flex-col items-center gap-2 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald/40 bg-emerald/15">
                      <ShieldCheck className="h-6 w-6 text-emerald" aria-hidden />
                    </span>
                    <h2 className="font-display text-xl font-black uppercase tracking-[0.08em] text-white">{headline}</h2>
                    <p className="font-mono text-[11px] leading-relaxed text-slate">
                      {live
                        ? "Sieges settle on-chain. Outcomes are verifiable by anyone."
                        : "Stakes are simulated on devnet — no real SOL moves. The fairness check is still real and verifiable."}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-col gap-2.5">
                    {points.map(({ icon: Icon, title, body }) => (
                      <div key={title} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald/25 bg-emerald/[0.08]">
                          <Icon className="h-3.5 w-3.5 text-emerald" aria-hidden />
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-display text-xs font-bold uppercase tracking-[0.1em] text-white">{title}</span>
                          <span className="font-mono text-[10px] leading-relaxed text-slate">{body}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <a
                    href={SIEGE_MATH_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald/30 bg-emerald/10 py-3 font-display text-xs font-bold uppercase tracking-[0.12em] text-emerald transition-colors hover:bg-emerald/20"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden /> View the siege math (siegeMath.ts)
                  </a>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
