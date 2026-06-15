/**
 * LandingScreen — the first thing any user sees, BEFORE connecting a wallet.
 *
 * Wallet Wars is a two-sided yield marketplace. This screen makes the player
 * pick a side up front:
 *
 *   VAULT LORD  (phantom)  — "BECOME THE HOUSE." Deploy SOL, become a target,
 *                            earn fees from every failed siege. A live (fake)
 *                            fee counter demonstrates the earn mechanic before
 *                            they even connect.
 *   SIEGE RUNNER (blood)   — "CRACK THE VAULT." Small fee, massive upside. A
 *                            sample opportunity (0.3 SOL risk → 3.0 SOL slice at
 *                            8% odds) shows the asymmetric bet immediately.
 *
 * A single gold connect button sits below. The tapped card is remembered
 * (persisted) so the app routes the player straight to the matching tab after
 * connecting. Two cards side-by-side on desktop, stacked on mobile.
 *
 * Brand line, everywhere: "In every other app the house wins. Here you can be
 * the house." GPU-safe (transform/opacity only), reduced-motion aware, lucide
 * icons only, zero emojis.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Wallet, ShieldCheck, Key, LineChart, Crosshair, Loader, Coins, Trophy, Percent, Check,
} from "lucide-react";
import { SnatchIcon } from "@/components/ui/YoinkLogo";
import { useWallet } from "@/lib/wallet";
import { saveRole, type WarRole } from "@/lib/walletWarsRole";
import { formatSol } from "@/lib/utils";
import { usePrefersReducedMotion } from "./useReducedMotion";

const EASE = [0.22, 1, 0.36, 1] as const;

/** A simulated live fee counter — demonstrates "earning while defending" pre-connect. */
function LiveFeeCounter({ reduced }: { reduced: boolean }) {
  const [banked, setBanked] = useState(0.0462);
  const ref = useRef(banked);
  ref.current = banked;

  useEffect(() => {
    if (reduced) return; // static representative value under reduced motion
    const id = setInterval(() => {
      // small, irregular toll increments — the "fees piling up" feel
      setBanked((b) => +(b + 0.0003 + Math.random() * 0.0011).toFixed(4));
    }, 1400);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <div className="flex items-center justify-between rounded-xl border border-emerald/20 bg-emerald/[0.06] px-3 py-2">
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-slate">
        <Coins className="h-3.5 w-3.5 text-emerald" aria-hidden /> Fees banked today
      </span>
      <motion.span
        key={Math.round(banked * 1000)}
        initial={reduced ? false : { opacity: 0.6, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="font-mono text-sm font-black tabular-nums text-emerald"
        style={{ willChange: "transform" }}
      >
        +{formatSol(banked, 4)}
      </motion.span>
    </div>
  );
}

/** The asymmetric-bet sample shown on the Siege Runner card. */
function SampleOpportunity() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-blood/20 bg-blood/[0.05] px-3 py-2.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Sample target</span>
      <div className="grid grid-cols-3 gap-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-dim">You risk</span>
          <span className="font-mono text-sm font-black tabular-nums text-blood">0.3</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-dim">Crack slice</span>
          <span className="flex items-center gap-1 font-mono text-sm font-black tabular-nums text-gold">
            <Trophy className="h-3 w-3" aria-hidden />3.0
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-dim">Odds</span>
          <span className="flex items-center gap-0.5 font-mono text-sm font-black tabular-nums text-emerald">
            <Percent className="h-3 w-3" aria-hidden />8
          </span>
        </div>
      </div>
      <span className="font-mono text-[10px] text-slate">0.3 SOL in · walk away with 10× the fee.</span>
    </div>
  );
}

interface RoleCardProps {
  role: WarRole;
  selected: boolean;
  onSelect: (role: WarRole) => void;
  accent: string;
  icon: React.ReactNode;
  headline: string;
  subtext: string;
  children: React.ReactNode;
  reduced: boolean;
}

function RoleCard({ role, selected, onSelect, accent, icon, headline, subtext, children, reduced }: RoleCardProps) {
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(role)}
      aria-pressed={selected}
      whileHover={reduced ? undefined : { y: -4 }}
      whileTap={reduced ? undefined : { scale: 0.99 }}
      transition={{ duration: 0.18 }}
      className="group relative flex flex-1 flex-col gap-3 overflow-hidden rounded-[24px] px-5 py-5 text-left"
      style={{
        background: selected ? `${accent}14` : "rgba(255,255,255,0.02)",
        border: `1px solid ${selected ? `${accent}88` : `${accent}33`}`,
        boxShadow: selected ? `0 0 28px ${accent}33, inset 0 0 22px ${accent}10` : undefined,
        willChange: "transform",
      }}
    >
      {/* selected check */}
      <span
        className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full transition-opacity"
        style={{ background: `${accent}26`, border: `1px solid ${accent}66`, opacity: selected ? 1 : 0 }}
        aria-hidden
      >
        <Check className="h-3.5 w-3.5" style={{ color: accent }} />
      </span>

      <span
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: `${accent}1a`, border: `1px solid ${accent}44` }}
      >
        {icon}
      </span>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: accent }}>
          {role === "lord" ? "Vault Lord" : "Siege Runner"}
        </span>
        <h2 className="font-display text-xl font-black leading-none tracking-tight text-white sm:text-2xl">
          {headline}
        </h2>
      </div>

      <p className="font-mono text-[11px] leading-relaxed text-slate">{subtext}</p>

      {children}
    </motion.button>
  );
}

export function LandingScreen() {
  const { connect, connecting } = useWallet();
  const reduced = usePrefersReducedMotion();
  const [role, setRole] = useState<WarRole | null>(null);

  function pick(r: WarRole) {
    setRole(r);
    saveRole(r); // remember the tapped card so we route to the right tab post-connect
  }

  function handleConnect() {
    // Default to Siege Runner (the broad, action side) if they connect without picking.
    saveRole(role ?? "runner");
    void connect();
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-14">
      {/* aurora pools */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute" style={{ top: "-10%", left: "-10%", width: "60%", height: "70%", background: "radial-gradient(ellipse, rgba(112,0,255,0.2) 0%, transparent 70%)", willChange: "transform", animation: reduced ? undefined : "aurora-breathe 22s cubic-bezier(0.22,1,0.36,1) infinite" }} />
        <div className="absolute" style={{ bottom: "-10%", right: "-10%", width: "55%", height: "65%", background: "radial-gradient(ellipse, rgba(255,34,0,0.14) 0%, transparent 70%)", willChange: "transform", animation: reduced ? undefined : "aurora-drift 28s ease-in-out infinite" }} />
      </div>

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-7">
        {/* brand mark + wordmark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex flex-col items-center gap-3"
          style={{ filter: "drop-shadow(0 0 36px rgba(255,215,0,0.22))" }}
        >
          <SnatchIcon size={72} variant="gold" pulse={!reduced} />
          <h1 className="font-display font-black leading-none tracking-tight" style={{ fontSize: "clamp(2.2rem, 9vw, 3.4rem)" }}>
            <span className="text-white">WALLET </span>
            <span style={{ color: "#FF2200" }}>WARS</span>
          </h1>
        </motion.div>

        {/* brand line */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12, ease: EASE }}
          className="max-w-md text-center font-display text-sm font-bold uppercase leading-relaxed tracking-[0.06em] sm:text-base"
        >
          <span className="text-slate">In every other app the house wins. </span>
          <span className="gold-text-gradient">Here you can be the house.</span>
        </motion.p>

        {/* two role cards — stacked on mobile, side by side on desktop */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2, ease: EASE }}
          className="flex w-full flex-col gap-3 sm:flex-row"
        >
          <RoleCard
            role="lord"
            selected={role === "lord"}
            onSelect={pick}
            reduced={reduced}
            accent="#7000FF"
            icon={<LineChart className="h-6 w-6 text-phantom" aria-hidden />}
            headline="BECOME THE HOUSE"
            subtext="Deploy SOL. Earn fees from every siege that fails against you. The longer you survive the more you earn."
          >
            <LiveFeeCounter reduced={reduced} />
          </RoleCard>

          <RoleCard
            role="runner"
            selected={role === "runner"}
            onSelect={pick}
            reduced={reduced}
            accent="#FF2200"
            icon={<Crosshair className="h-6 w-6 text-blood" aria-hidden />}
            headline="CRACK THE VAULT"
            subtext="Small fee. Massive upside. Find a whale vault. Storm the gates. Walk away with 10×."
          >
            <SampleOpportunity />
          </RoleCard>
        </motion.div>

        {/* single gold connect button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.32, ease: EASE }}
          className="flex w-full max-w-sm flex-col items-center gap-3"
        >
          <motion.button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            whileTap={connecting ? undefined : { scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="gold-button relative flex w-full items-center justify-center gap-3 py-4 text-base"
            style={{ borderRadius: 18, willChange: "transform", opacity: connecting ? 0.8 : 1 }}
            aria-label="Connect wallet"
          >
            {connecting ? (
              <>
                <Loader className="h-5 w-5 animate-spin" aria-hidden style={{ willChange: "transform" }} />
                <span className="font-display text-sm font-black uppercase tracking-[0.12em]">Connecting…</span>
              </>
            ) : (
              <>
                <Wallet className="h-5 w-5" aria-hidden />
                <span className="font-display text-sm font-black uppercase tracking-[0.12em]">
                  {role === "lord" ? "Connect — Become the House" : role === "runner" ? "Connect — Start Hunting" : "Connect Wallet"}
                </span>
              </>
            )}
          </motion.button>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="trust-chip">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald" aria-hidden /> No private key access
            </span>
            <span className="trust-chip">
              <Key className="h-3.5 w-3.5 text-slate" aria-hidden /> Self-custody · Devnet · Sim stakes
            </span>
          </div>

          <p className="text-center font-mono text-[10px] text-dim">18+ only · Not available in restricted jurisdictions</p>
        </motion.div>
      </div>
    </div>
  );
}
