/**
 * YOINK.GG — Wallet Wars supporting UI
 *
 * Small, self-contained pieces for the redesigned Wallet Wars screen:
 *   - ProvablyFairBadge : always-visible trust badge, expands to explain
 *   - StatusBar         : one-line "last action" so users always know their state
 *   - BountyBoard       : promoted phantom-accent list of bountied targets
 *   - FeeToast          : emerald toast when your stash banks a survived raid
 *   - WarOnboarding     : 3-slide first-run tutorial + a risk-free practice raid
 *
 * Design system: void/gold/blood/phantom/emerald/slate, Orbitron/Space Grotesk/
 * JetBrains Mono, lucide icons, zero emojis. All animation respects
 * prefers-reduced-motion and uses transform/opacity only.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShieldCheck, Target, Crosshair, Vault, Swords, ChevronRight,
  X, Sparkles, TrendingUp, ShieldAlert,
} from "lucide-react";
import type { Vault as VaultModel } from "@/lib/walletWarsState";
import { isEscrowLive } from "@/lib/walletWarsChain";
import { formatSol, truncateAddress } from "@/lib/utils";
import { PurgeAvatar } from "./PurgeAvatar";

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ─── Provably-fair trust badge ─────────────────────────────────────────────────

export function ProvablyFairBadge() {
  const [open, setOpen] = useState(false);
  const live = isEscrowLive();
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate transition-colors hover:text-white"
        aria-expanded={open}
      >
        <ShieldCheck className="h-3 w-3 text-emerald" aria-hidden />
        {live ? "Provably Fair · On-Chain" : "Provably Fair · Client-Side Sim"}
      </button>
      <AnimatePresence>
        {open && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 max-w-md overflow-hidden text-center font-mono text-[10px] leading-relaxed text-dim"
          >
            {live ? (
              <>
                Each siege is settled on-chain: a win is <span className="text-slate">hash(seed) &lt; p</span>,
                the published per-tier crack chance. The seed is revealed with every result so anyone can recompute it.
              </>
            ) : (
              <>
                Stakes are simulated locally (devnet) — no real SOL moves while escrow is off.
                Every siege still runs the real provable-fairness check: a win is{" "}
                <span className="text-slate">roll(seed) &lt; p</span>, the published per-tier crack chance.
                The seed and roll are revealed with each result so you can verify it yourself.
              </>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Status bar — always shows the player's last action ─────────────────────────

export function StatusBar({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
      <span className="truncate font-mono text-[11px] text-slate">{text}</span>
    </div>
  );
}

// ─── Fee-banked toast — fires when your stash survives a raid ────────────────────

export interface FeeToastData { id: number; amount: number; from: string; }

export function FeeToast({ toast }: { toast: FeeToastData | null }) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[95] -translate-x-1/2" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 360, damping: 24 }}
            className="flex items-center gap-2.5 rounded-2xl px-4 py-2.5"
            style={{
              background: "rgba(0,230,118,0.12)",
              border: "1px solid rgba(0,230,118,0.4)",
              backdropFilter: "blur(8px)",
              willChange: "transform",
            }}
          >
            <ShieldCheck className="h-4 w-4 text-emerald" aria-hidden />
            <span className="font-mono text-xs font-bold text-emerald">
              +{formatSol(toast.amount, 3)} SOL BANKED
            </span>
            <span className="font-mono text-[10px] text-emerald/70">
              {truncateAddress(toast.from, 4, 4)} failed to raid you
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Bounty board — promoted phantom-accent targeting ────────────────────────────

interface BountyBoardProps {
  stashes: VaultModel[];
  canRaid: (s: VaultModel) => boolean;
  onCrack: (id: string) => void;
}

export function BountyBoard({ stashes, canRaid, onCrack }: BountyBoardProps) {
  const bountied = useMemo(
    () => stashes.filter((s) => !s.isYou && (s.bountyPool ?? 0) > 0).sort((a, b) => b.bountyPool - a.bountyPool),
    [stashes],
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 px-1">
        <Target className="h-4 w-4 text-phantom" aria-hidden />
        <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-phantom">Bounties</h2>
        <span className="font-mono text-[10px] text-dim">{bountied.length} live</span>
      </div>

      {bountied.length === 0 ? (
        <div className="rounded-2xl border border-phantom/15 bg-phantom/[0.04] px-4 py-3 text-center font-mono text-[11px] text-slate">
          No bounties yet — pledge SOL on a wallet inside a raid to put a price on their head.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {bountied.slice(0, 6).map((s) => {
            const raidable = canRaid(s);
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-2xl border border-phantom/25 bg-phantom/[0.06] px-3 py-2.5"
              >
                <PurgeAvatar seed={s.wallet} size={32} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-mono text-xs font-bold text-white">
                    {truncateAddress(s.wallet, 4, 4)}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-[10px] text-phantom">
                    <Target className="h-3 w-3" aria-hidden />
                    {formatSol(s.bountyPool, 2)} SOL pool
                  </span>
                </div>
                <motion.button
                  type="button"
                  onClick={() => raidable && onCrack(s.id)}
                  disabled={!raidable}
                  whileTap={raidable ? { scale: 0.95 } : undefined}
                  transition={{ duration: 0.12 }}
                  className="shrink-0 rounded-xl border border-phantom/40 bg-phantom/15 px-3 py-2 font-display text-[11px] font-bold uppercase tracking-[0.1em] text-phantom transition-colors hover:bg-phantom/25 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ willChange: "transform" }}
                >
                  Crack it
                </motion.button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── First-run onboarding — 3 slides + a risk-free practice raid ─────────────────

const SLIDES = [
  {
    icon: Vault,
    color: "#7000FF",
    title: "OPEN A VAULT",
    body: "Stake SOL to become a target. Your corpus is the prize — and your war chest.",
  },
  {
    icon: Swords,
    color: "#FF2200",
    title: "SIEGE OR GET SIEGED",
    body: "Pay a small fee to siege a vault — it's all you risk. Survive raids and bank their fees.",
  },
  {
    icon: ShieldCheck,
    color: "#00E676",
    title: "CHEAP FEE IN, BIG CRACK OUT",
    body: "A rare crack pays a fat slice (~10× the fee). After every siege a shield protects the vault.",
  },
] as const;

export function WarOnboarding({ onDone }: { onDone: () => void }) {
  const [slide, setSlide] = useState(0);
  // practice raid: null = not run, "win"/"loss" = result
  const [practice, setPractice] = useState<null | "win" | "loss">(null);
  const [rolling, setRolling] = useState(false);

  const isLast = slide === SLIDES.length - 1;

  function runPractice() {
    setRolling(true);
    const outcome: "win" | "loss" = Math.random() < 0.5 ? "win" : "loss";
    const delay = reduced() ? 0 : 900;
    window.setTimeout(() => {
      setRolling(false);
      setPractice(outcome);
    }, delay);
  }

  const current = SLIDES[slide] ?? SLIDES[0];
  const Icon = current.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[110] flex items-center justify-center px-5"
      style={{ background: "rgba(8,8,15,0.94)", backdropFilter: "blur(12px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="How Wallet Wars works"
    >
      <motion.div
        initial={{ scale: 0.94, y: 14, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="premium-card relative w-full max-w-sm rounded-[24px] px-6 py-7"
      >
        <button
          type="button"
          onClick={onDone}
          className="absolute right-4 top-4 text-dim transition-colors hover:text-white"
          aria-label="Skip tutorial"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        <AnimatePresence mode="wait">
          {practice === null ? (
            <motion.div
              key={`slide-${slide}`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22 }}
              className="flex flex-col items-center gap-5 text-center"
            >
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="flex h-20 w-20 items-center justify-center rounded-3xl"
                style={{ background: `${current.color}1a`, border: `1px solid ${current.color}44` }}
              >
                <Icon className="h-9 w-9" style={{ color: current.color }} aria-hidden />
              </motion.div>

              <div className="flex flex-col gap-2">
                <h2 className="font-display text-2xl font-black tracking-tight text-white">{current.title}</h2>
                <p className="font-mono text-xs leading-relaxed text-slate">{current.body}</p>
              </div>

              {/* dots */}
              <div className="flex items-center gap-1.5">
                {SLIDES.map((_, i) => (
                  <span
                    key={i}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: i === slide ? 18 : 6,
                      background: i === slide ? current.color : "rgba(255,255,255,0.15)",
                    }}
                    aria-hidden
                  />
                ))}
              </div>

              {!isLast ? (
                <motion.button
                  type="button"
                  onClick={() => setSlide((s) => Math.min(s + 1, SLIDES.length - 1))}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12 }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/[0.1]"
                  style={{ willChange: "transform" }}
                >
                  Next <ChevronRight className="h-4 w-4" aria-hidden />
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  onClick={runPractice}
                  disabled={rolling}
                  whileTap={rolling ? undefined : { scale: 0.97 }}
                  transition={{ duration: 0.12 }}
                  className="gold-button flex w-full items-center justify-center gap-2 py-3.5 text-sm"
                  style={{ willChange: "transform", opacity: rolling ? 0.8 : 1 }}
                >
                  <Crosshair className="h-4 w-4" aria-hidden />
                  {rolling ? "Cracking…" : "Let's go — free practice raid"}
                </motion.button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="practice-result"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className="flex flex-col items-center gap-4 py-2 text-center"
            >
              {practice === "win" ? (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/40 bg-gold/15">
                    <TrendingUp className="h-8 w-8 text-gold" aria-hidden />
                  </div>
                  <span className="font-display text-2xl font-black uppercase tracking-[0.1em] gold-text-gradient">
                    You cracked it!
                  </span>
                  <p className="font-mono text-xs text-slate">
                    That's a crack — you'd take a fat slice of their vault (~10× your fee), minus the house rake.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate/30 bg-slate/10">
                    <ShieldAlert className="h-8 w-8 text-slate" aria-hidden />
                  </div>
                  <span className="font-display text-2xl font-black uppercase tracking-[0.1em] text-slate">
                    Bounced
                  </span>
                  <p className="font-mono text-xs text-slate">
                    That's a bounce — you'd only lose the small fee, and it banks the defender. Cheap to try again.
                  </p>
                </>
              )}
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald">
                <Sparkles className="h-3 w-3" aria-hidden /> Practice only — no SOL moved
              </span>
              <motion.button
                type="button"
                onClick={onDone}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="gold-button flex w-full items-center justify-center gap-2 py-3.5 text-sm"
                style={{ willChange: "transform" }}
              >
                Enter Wallet Wars
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
