/**
 * YOINK.GG — Wallet Tracker Panel
 *
 * Shows simulated SOL balances of all players at the table.
 * When Wallet Tracker is owned and active, the panel reveals balances.
 * When inactive, shows a locked purchase prompt.
 *
 * Simulation: balances are seeded from wallet string hash + drift every 3s.
 * Production: replace seedBalance() with Solana RPC getBalance() calls.
 *
 * Pump Fake: if pumpFakeBalance is set, the owning player's row shows
 * the decoy balance to others. They see their own row marked with EyeOff.
 *
 * GPU rules: transform + opacity only, will-change on perpetual anims.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, TrendingUp, TrendingDown, Minus, EyeOff, Eye } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { truncateAddress, formatSol } from "@/lib/utils";

interface PlayerBalance {
  wallet:         string;
  displayBalance: number;
  isYou:          boolean;
  isKing:         boolean;
  trend:          "up" | "down" | "flat";
  isFaked:        boolean;
}

interface WalletTrackerPanelProps {
  wallets:         string[];
  currentKing:     string;
  pumpFakeBalance: number | null;
  active:          boolean;
  onActivate:      () => void;
}

function seedBalance(wallet: string): number {
  let hash = 0;
  for (let i = 0; i < wallet.length; i++) {
    hash = (hash * 31 + wallet.charCodeAt(i)) >>> 0;
  }
  const r = ((hash * 1664525 + 1013904223) >>> 0) / 0xffffffff;
  if (r < 0.6) return +(0.5 + r / 0.6 * 4.5).toFixed(3);
  if (r < 0.9) return +(5 + ((r - 0.6) / 0.3) * 15).toFixed(3);
  return +(20 + ((r - 0.9) / 0.1) * 60).toFixed(3);
}

export function WalletTrackerPanel({
  wallets,
  currentKing,
  pumpFakeBalance,
  active,
  onActivate,
}: WalletTrackerPanelProps) {
  const reduced = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  ).current;

  const [balances, setBalances] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = { You: seedBalance("You_player") };
    wallets.forEach((w) => { map[w] = seedBalance(w); });
    return map;
  });

  useEffect(() => {
    if (reduced || !active) return;
    const id = setInterval(() => {
      setBalances((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((w) => {
          next[w] = Math.max(0.01, +(next[w] + (Math.random() - 0.5) * 0.3).toFixed(3));
        });
        return next;
      });
    }, 3_000);
    return () => clearInterval(id);
  }, [active, reduced]);

  const prevBalances = useRef<Record<string, number>>({});
  useEffect(() => { prevBalances.current = { ...balances }; });

  if (!active) {
    return (
      <SpotlightCard spotlightColor="rgba(0,230,118,0.10)" radius={220} className="premium-card rounded-[24px]">
        <div className="flex flex-col items-center gap-4 px-5 py-5 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald/20 bg-emerald/10">
            <Wallet className="h-5 w-5 text-emerald" aria-hidden />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-sm font-bold text-white">Wallet Tracker</h3>
            <p className="font-mono text-[11px] leading-relaxed text-slate">
              See every player's live SOL balance. Know who can keep fighting.
            </p>
          </div>
          <motion.button
            type="button"
            onClick={onActivate}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald/30 bg-emerald/10 py-2.5 font-display text-xs font-bold uppercase tracking-[0.15em] text-emerald transition-colors hover:bg-emerald/15"
            style={{ willChange: "transform" }}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden />
            Activate — 0.15 SOL
          </motion.button>
          <p className="font-mono text-[10px] text-dim">Single use · active this round only</p>
        </div>
      </SpotlightCard>
    );
  }

  const allWallets = Array.from(new Set(["You", ...wallets])).slice(0, 10);
  const rows: PlayerBalance[] = allWallets.map((w) => {
    const raw = balances[w] ?? seedBalance(w);
    const isYou = w === "You";
    const display = isYou && pumpFakeBalance !== null ? pumpFakeBalance : raw;
    const prev = prevBalances.current[w] ?? raw;
    const trend: "up" | "down" | "flat" = reduced ? "flat"
      : display > prev + 0.001 ? "up"
      : display < prev - 0.001 ? "down"
      : "flat";
    return {
      wallet: w, displayBalance: display, isYou,
      isKing: w === currentKing || (isYou && currentKing === "You"),
      trend, isFaked: isYou && pumpFakeBalance !== null,
    };
  }).sort((a, b) => {
    if (a.isKing && !b.isKing) return -1;
    if (!a.isKing && b.isKing) return 1;
    return b.displayBalance - a.displayBalance;
  });

  const maxBal = Math.max(...rows.map((r) => r.displayBalance), 1);
  const total  = rows.reduce((s, r) => s + r.displayBalance, 0);

  return (
    <SpotlightCard spotlightColor="rgba(0,230,118,0.10)" radius={220} className="premium-card rounded-[24px]">
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-emerald" aria-hidden />
            <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">Wallet Tracker</h3>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald/20 bg-emerald/10 px-2 py-0.5 font-mono text-[10px] text-emerald">
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-emerald"
              animate={reduced ? {} : { opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
            Live
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "rgba(0,230,118,0.05)", border: "1px solid rgba(0,230,118,0.1)" }}>
          <span className="font-mono text-[10px] text-slate">Combined pool</span>
          <span className="font-mono text-sm font-bold text-emerald tabular-nums">{formatSol(total, 2)} SOL</span>
        </div>

        <AnimatePresence>
          {pumpFakeBalance !== null && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: "rgba(255,34,0,0.07)", border: "1px solid rgba(255,34,0,0.18)" }}
            >
              <EyeOff className="h-3.5 w-3.5 shrink-0 text-blood" aria-hidden />
              <p className="font-mono text-[10px] text-blood">
                Pump Fake active — others see <span className="font-bold">~{formatSol(pumpFakeBalance, 2)} SOL</span> on your row
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col divide-y divide-white/[0.04]">
          {rows.map((row, i) => {
            const barPct = row.displayBalance / maxBal;
            return (
              <motion.div
                key={row.wallet}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: reduced ? 0 : 0.22, delay: reduced ? 0 : i * 0.04 }}
                className="flex flex-col gap-1 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {row.isKing && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />}
                    <span className="truncate font-mono text-[11px]" style={{
                      color: row.isKing ? "#FFD700" : row.isYou ? "#eef1f6" : "#8892a4",
                      fontWeight: row.isYou || row.isKing ? 700 : 400,
                    }}>
                      {row.isYou ? "You" : truncateAddress(row.wallet, 4, 4)}
                    </span>
                    {row.isFaked && <EyeOff className="h-3 w-3 shrink-0 text-blood" aria-label="Pump Fake" />}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {row.trend === "up" && <TrendingUp className="h-3 w-3 text-emerald" aria-hidden />}
                    {row.trend === "down" && <TrendingDown className="h-3 w-3 text-blood" aria-hidden />}
                    {row.trend === "flat" && <Minus className="h-3 w-3 text-dim" aria-hidden />}
                    <motion.span
                      key={row.displayBalance.toFixed(2)}
                      initial={reduced ? {} : { scale: 1.1 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.25 }}
                      className="font-mono text-xs font-bold tabular-nums"
                      style={{ color: row.isYou ? "#eef1f6" : "#8892a4", willChange: "transform" }}
                    >
                      {row.isFaked ? "~" : ""}{formatSol(row.displayBalance, 2)} SOL
                    </motion.span>
                  </div>
                </div>
                <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: row.isKing ? "#FFD700" : row.isYou ? "#eef1f6" : "#8892a4",
                      opacity: 0.3, transformOrigin: "left center", willChange: "transform",
                    }}
                    animate={{ scaleX: barPct }}
                    initial={{ scaleX: 0 }}
                    transition={{ duration: reduced ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
        <p className="font-mono text-[10px] text-dim">Updates every few seconds · expires end of round</p>
      </div>
    </SpotlightCard>
  );
}
