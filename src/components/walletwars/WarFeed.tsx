/**
 * WarFeed — live stream of every raid happening across Wallet Wars.
 * Wins (heists) glow gold, losses (defended) glow slate. Always alive.
 */

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Radio } from "lucide-react";
import type { RaidEvent } from "@/lib/walletWarsState";
import { formatSol, truncateAddress } from "@/lib/utils";
import { PurgeAvatar } from "./PurgeAvatar";

function nameOf(wallet: string, isYou: boolean, playerName: string) {
  if (isYou) return playerName || "You";
  return truncateAddress(wallet, 4, 4);
}

interface WarFeedProps {
  events: RaidEvent[];
  playerName?: string;
  playerAvatarSeed?: string;
  playerAvatarVariant?: number | null;
  playerAvatarColor?: string | null;
}

export const WarFeed = memo(function WarFeed({
  events,
  playerName = "",
  playerAvatarSeed = "You",
  playerAvatarVariant = null,
  playerAvatarColor = null,
}: WarFeedProps) {
  return (
    <div className="flex flex-col">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <Radio className="h-3.5 w-3.5 text-emerald" aria-hidden />
        <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">Live raids</h3>
      </div>

      <div className="no-scrollbar flex max-h-[420px] flex-col gap-1.5 overflow-y-auto pr-1">
        {events.length === 0 && (
          <div className="flex h-20 items-center justify-center font-mono text-xs text-dim">
            Waiting for the first raid…
          </div>
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {events.map((e) => {
            const win = e.outcome === "win";
            const involvesYou = e.raiderIsYou || e.targetIsYou;
            return (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                style={{
                  background: involvesYou
                    ? "rgba(255,215,0,0.06)"
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${involvesYou ? "rgba(255,215,0,0.16)" : "rgba(255,255,255,0.04)"}`,
                }}
              >
                <span className="relative shrink-0">
                  <PurgeAvatar
                    seed={e.raiderIsYou ? playerAvatarSeed : e.raider}
                    size={30}
                    variant={e.raiderIsYou ? playerAvatarVariant : undefined}
                    color={e.raiderIsYou ? playerAvatarColor : undefined}
                  />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0c0a14]"
                    style={{ background: win ? "#FF9900" : "#00E676" }}
                    aria-hidden
                  />
                </span>

                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-mono text-[11px]">
                    <span style={{ color: e.raiderIsYou ? "#FFD700" : "#eef1f6", fontWeight: 700 }}>
                      {nameOf(e.raider, e.raiderIsYou, playerName)}
                    </span>
                    <span className="text-slate">{win ? " cracked " : " bounced off "}</span>
                    <span style={{ color: e.targetIsYou ? "#FF2200" : "#8892a4", fontWeight: 700 }}>
                      {nameOf(e.target, e.targetIsYou, playerName)}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] text-dim">
                    {win ? "snatched" : "defended"} · {formatSol(e.amount, 3)} SOL
                  </span>
                </div>

                <span
                  className="shrink-0 font-mono text-xs font-bold tabular-nums"
                  style={{ color: win ? "#FF9900" : "#00E676" }}
                >
                  {win ? "−" : "+"}{formatSol(e.amount, 2)}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
});
