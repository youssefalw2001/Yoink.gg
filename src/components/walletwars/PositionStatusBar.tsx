/**
 * PositionStatusBar — the persistent one-line "where you stand right now" bar,
 * always shown between the sub-tab selector and the content. Always accurate,
 * always current (live shield countdown), never needs a refresh.
 *
 * Examples:
 *   "Vault active — 0.046 SOL banked today — Shield drops in 4m 12s"
 *   "No vault open — open one to start earning"
 *   "Last siege: rolled 0.11 needed 0.08 — try again"
 *   "VAULT CRACKED — you earned 2.900 SOL"
 */

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Vault, Crosshair, Trophy } from "lucide-react";
import type { Vault as VaultType } from "@/lib/walletWarsState";
import type { WarRole } from "@/lib/walletWarsRole";
import { formatSol } from "@/lib/utils";

export interface LastSiege {
  outcome: "win" | "loss";
  roll: number;
  needed: number;
  seized: number;
}

interface PositionStatusBarProps {
  you: VaultType | null;
  earningsToday: number;
  lastSiege: LastSiege | null;
  role: WarRole;
}

function fmtCountdown(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function PositionStatusBar({ you, earningsToday, lastSiege, role }: PositionStatusBarProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  let dot = "#FFD700";
  let icon = <Vault className="h-3.5 w-3.5 text-gold" aria-hidden />;
  let text: React.ReactNode;

  if (lastSiege?.outcome === "win") {
    dot = "#FFD700";
    icon = <Trophy className="h-3.5 w-3.5 text-gold" aria-hidden />;
    text = (
      <span className="text-white">
        <span className="font-black text-gold">VAULT CRACKED</span> — you earned {formatSol(lastSiege.seized, 3)} SOL
      </span>
    );
  } else if (lastSiege) {
    dot = "#8892A4";
    icon = <Crosshair className="h-3.5 w-3.5 text-slate" aria-hidden />;
    text = (
      <span className="text-slate">
        Last siege: rolled <span className="text-white">{lastSiege.roll.toFixed(2)}</span> needed{" "}
        <span className="text-emerald">{lastSiege.needed.toFixed(2)}</span> — try again
      </span>
    );
  } else if (you) {
    const shieldLeft = Math.max(0, you.shieldUntil - now);
    const shielded = shieldLeft > 0;
    dot = shielded ? "#00E676" : "#FFD700";
    icon = shielded ? <ShieldCheck className="h-3.5 w-3.5 text-emerald" aria-hidden /> : <ShieldOff className="h-3.5 w-3.5 text-gold" aria-hidden />;
    text = (
      <span className="text-slate">
        Vault active — <span className="text-emerald">{formatSol(earningsToday, 3)} SOL</span> banked today —{" "}
        {shielded ? <>Shield drops in {fmtCountdown(shieldLeft)}</> : <span className="text-gold">no shield, you're raidable</span>}
      </span>
    );
  } else {
    dot = "#8892A4";
    icon = <Vault className="h-3.5 w-3.5 text-slate" aria-hidden />;
    text = (
      <span className="text-slate">
        {role === "lord" ? "No vault open — open one to start earning" : "No vault open — open one to fund your sieges"}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2" aria-live="polite">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
      {icon}
      <span className="truncate font-mono text-[11px]">{text}</span>
    </div>
  );
}
