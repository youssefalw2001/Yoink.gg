/**
 * CrownTab — "this is your empire." The third, deliberately-simplest Wallet Wars
 * tab: no risk profiles, no tier selectors, no decisions.
 *
 *   1. Lifetime referral earnings — large, gold, JetBrains Mono (0 → "start earning").
 *   2. One plain-language sentence explaining the lifetime-rake mechanic.
 *   3. One big "INVITE A LORD" button → native share sheet + your referral link.
 *   4. A compact list of every wallet you've referred: shortened address, current
 *      tier, lifetime SOL earned from them, and a cap indicator when reached.
 *   5. An aspirational line from real platform data: top single referral earned.
 *
 * Visual identity: gold + phantom purple, more ornate than Build's calm terminal
 * or Hunt's fast board. Orbitron headline numbers. GPU-safe, reduced-motion aware.
 *
 * Referral earnings are client-side SIMULATED while ESCROW_ENABLED is false
 * (same as the bot economy), driven by the audited `splitHouseRake` math.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Crown, Users, Share2, Check, Lock, Sparkles, Infinity as InfinityIcon } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { formatSol, truncateAddress } from "@/lib/utils";
import { type UseReferral } from "@/hooks/useReferral";
import { usePrefersReducedMotion } from "./useReducedMotion";
import { useCountUp } from "./useCountUp";

const TIER_LABEL: Record<string, string> = { pit: "Pit", grind: "Grind", arena: "Arena", court: "Court" };
const TIER_ACCENT: Record<string, string> = { pit: "#8892A4", grind: "#00E676", arena: "#FFD700", court: "#7000FF" };

export function CrownTab({ referral }: { referral: UseReferral }) {
  const reduced = usePrefersReducedMotion();
  const [copied, setCopied] = useState(false);
  const earned = useCountUp(referral.lifetimeEarned, reduced, 700);

  async function invite() {
    const text = "I'm building my empire on YOINK.GG Wallet Wars — become the house and earn lifetime rake, or crack my vault. Join me:";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "YOINK.GG · Wallet Wars", text, url: referral.link });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${referral.link}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* user dismissed the share sheet — no-op */
    }
  }

  const hasEarnings = referral.lifetimeEarned > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* 1 — lifetime earnings hero (gold + phantom, ornate) */}
      <div
        className="relative overflow-hidden rounded-[24px] px-6 py-7 text-center"
        style={{ background: "linear-gradient(150deg, #1a0f00 0%, #08080f 55%, #160a2b 100%)", border: "1px solid rgba(255,215,0,0.22)" }}
      >
        <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #FFD700 35%, #7000FF 65%, transparent)" }} aria-hidden />
        <div className="pointer-events-none absolute -right-6 -top-6 opacity-[0.12]" aria-hidden>
          <Crown className="h-28 w-28 text-gold" />
        </div>

        <div className="relative flex flex-col items-center gap-1">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-slate">
            <Crown className="h-3.5 w-3.5 text-gold" aria-hidden /> Lifetime referral earnings
          </span>
          {hasEarnings ? (
            <div className="flex items-end gap-2">
              <span className="font-mono font-black tabular-nums gold-text-gradient" style={{ fontSize: "clamp(2.4rem, 11vw, 3.6rem)", lineHeight: 1 }}>
                {formatSol(earned, 4)}
              </span>
              <span className="mb-1 font-display text-sm font-black text-gold/60">SOL</span>
            </div>
          ) : (
            <span className="font-mono font-black tabular-nums gold-text-gradient" style={{ fontSize: "clamp(1.6rem, 7vw, 2.4rem)", lineHeight: 1.1 }}>
              0.00 SOL <span className="text-slate">— start earning</span>
            </span>
          )}

          {/* 2 — the mechanic, in plain language */}
          <p className="mt-3 max-w-sm font-mono text-[11px] leading-relaxed text-slate">
            Earn a lifetime share of house rake from everyone you invite. The bigger they play, the more you earn.
            <span className="text-gold"> Forever.</span>
          </p>
        </div>
      </div>

      {/* 3 — invite button */}
      <motion.button
        type="button"
        onClick={invite}
        whileTap={reduced ? undefined : { scale: 0.98 }}
        className="gold-button flex w-full items-center justify-center gap-2.5 py-4 text-base"
        style={{ borderRadius: 18, willChange: "transform" }}
      >
        {copied ? <Check className="h-5 w-5" aria-hidden /> : <Share2 className="h-5 w-5" aria-hidden />}
        <span className="font-display text-sm font-black uppercase tracking-[0.14em]">
          {copied ? "Link copied" : "Invite a Lord"}
        </span>
      </motion.button>
      <p className="-mt-3 flex items-center justify-center gap-1.5 text-center font-mono text-[10px] text-dim">
        <InfinityIcon className="h-3 w-3 text-phantom" aria-hidden /> Lifetime rake · no expiry · paid from the house's cut, never theirs
      </p>

      {/* 4 — referred wallets */}
      <SpotlightCard spotlightColor="rgba(112,0,255,0.14)" radius={280} className="premium-card rounded-[24px]">
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-phantom" aria-hidden />
            <h2 className="font-display text-sm font-black text-white">Your Lords</h2>
            <span className="ml-auto font-mono text-[10px] text-dim">{referral.referred.length} invited</span>
          </div>

          {referral.referred.length === 0 ? (
            <div className="rounded-2xl border border-phantom/15 bg-phantom/[0.04] px-4 py-6 text-center font-mono text-[11px] text-slate">
              No one yet — share your link and start earning lifetime rake from every Lord you bring in.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {referral.referred.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2"
                  style={{ background: u.capReached ? "rgba(255,255,255,0.02)" : "rgba(112,0,255,0.06)", border: `1px solid ${u.capReached ? "rgba(255,255,255,0.06)" : "rgba(112,0,255,0.18)"}` }}
                >
                  <span className="font-mono text-xs font-bold text-white">{truncateAddress(u.wallet, 4, 4)}</span>
                  <span
                    className="rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.1em]"
                    style={{ background: `${TIER_ACCENT[u.tier]}1f`, border: `1px solid ${TIER_ACCENT[u.tier]}55`, color: TIER_ACCENT[u.tier] }}
                  >
                    {TIER_LABEL[u.tier]}
                  </span>
                  {u.capReached && (
                    <span className="flex items-center gap-1 rounded-full border border-slate/30 bg-slate/10 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-slate">
                      <Lock className="h-2.5 w-2.5" aria-hidden /> Capped
                    </span>
                  )}
                  <span className="ml-auto font-mono text-sm font-black tabular-nums text-gold">{formatSol(u.earned, 4)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SpotlightCard>

      {/* 5 — aspirational line from real (in-app) data */}
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-gold/15 bg-gold/[0.05] px-4 py-3 text-center">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
        <span className="font-mono text-[11px] text-slate">
          {referral.topReferral > 0
            ? <>Top referral this week earned <span className="font-bold text-gold">{formatSol(referral.topReferral, 3)} SOL</span></>
            : <>Be the first — your top referral could be earning here</>}
        </span>
      </div>
    </div>
  );
}
