/**
 * YOINK.GG — Profile
 *
 * Set your display name (requires the Custom Name cosmetic), choose your Purge
 * mask avatar (variant + neon color), and equip owned card cosmetics. Everything
 * here is wired to the shop — owning an item is what unlocks it.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Check, Lock, Pencil, Crown, Droplets, Ghost } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { RankBadge } from "@/components/ui/RankBadge";
import {
  PurgeAvatar, PURGE_COLORS, PURGE_MASK_COUNT, PURGE_MASK_NAMES,
} from "@/components/walletwars/PurgeAvatar";
import type { PlayerProgress } from "@/lib/progression";
import { formatSol, truncateAddress } from "@/lib/utils";

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  progress: PlayerProgress;
  ownedItems: string[];
  publicKey: string | null;
  onSetName: (name: string) => void;
  onSetAvatar: (variant: number | null, color: string | null) => void;
  onEquipTheme: (theme: string) => void;
}

const THEME_OPTIONS = [
  { id: "default",        label: "Default", color: "#7000FF", item: null,            icon: Ghost },
  { id: "theme_blood",    label: "Blood",   color: "#FF2200", item: "theme_blood",    icon: Droplets },
  { id: "theme_phantom",  label: "Phantom", color: "#7000FF", item: "theme_phantom",  icon: Ghost },
  { id: "crown_animated", label: "Crown",   color: "#FFD700", item: "crown_animated", icon: Crown },
];

export function ProfileModal({
  open, onClose, progress, ownedItems, publicKey,
  onSetName, onSetAvatar, onEquipTheme,
}: ProfileModalProps) {
  const seed = publicKey || progress.displayName || "You";
  const ownsName = ownedItems.includes("display_name");
  const [nameInput, setNameInput] = useState(progress.displayName);

  const displayName = progress.displayName || (publicKey ? truncateAddress(publicKey, 4, 4) : "Anon");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0"
          style={{ background: "rgba(8,8,15,0.92)", backdropFilter: "blur(12px)" }}
          role="dialog" aria-modal="true" aria-label="Profile"
        >
          <SpotlightCard spotlightColor="rgba(112,0,255,0.16)" radius={360} className="w-full max-w-md rounded-[24px]">
            <div className="premium-card no-scrollbar relative flex max-h-[92dvh] flex-col gap-5 overflow-y-auto px-6 py-7">
              <button type="button" onClick={onClose} className="absolute right-4 top-4 text-dim transition-colors hover:text-white" aria-label="Close">
                <X className="h-5 w-5" aria-hidden />
              </button>

              {/* identity header */}
              <div className="flex items-center gap-4">
                <PurgeAvatar seed={seed} size={64} pulse variant={progress.avatarVariant} color={progress.avatarColor} />
                <div className="flex flex-col gap-1">
                  <span className="font-display text-xl font-black text-white">{displayName}</span>
                  <span className="flex items-center gap-2">
                    <RankBadge level={progress.level} size="sm" showArt={false} />
                    <span className="font-mono text-[11px] text-slate">{progress.rankName}</span>
                  </span>
                </div>
              </div>

              {/* stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Yoinks", value: progress.totalYoinks.toLocaleString() },
                  { label: "Wins",   value: progress.totalWins.toLocaleString() },
                  { label: "SOL won", value: formatSol(progress.totalSolWon, 2) },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.03] py-2.5">
                    <span className="font-mono text-sm font-bold tabular-nums text-white">{s.value}</span>
                    <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-dim">{s.label}</span>
                  </div>
                ))}
              </div>

              {/* name */}
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-slate">
                  <Pencil className="h-3 w-3" aria-hidden /> Display name
                </span>
                {ownsName ? (
                  <div className="flex gap-2">
                    <input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value.slice(0, 20))}
                      placeholder="Your alias"
                      maxLength={20}
                      className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-gold/40"
                    />
                    <button
                      type="button"
                      onClick={() => onSetName(nameInput.trim())}
                      className="rounded-xl border border-gold/30 bg-gold/10 px-4 font-display text-xs font-bold uppercase tracking-[0.1em] text-gold transition-colors hover:bg-gold/15"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-dim" aria-hidden />
                    <span className="font-mono text-[11px] text-slate">Buy <span className="font-bold text-gold">Custom Name</span> in the Armory to set an alias.</span>
                  </div>
                )}
              </div>

              {/* avatar — mask */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate">Avatar mask</span>
                <div className="grid grid-cols-6 gap-2">
                  {Array.from({ length: PURGE_MASK_COUNT }, (_, i) => {
                    const active = progress.avatarVariant === i;
                    return (
                      <button
                        key={i} type="button"
                        onClick={() => onSetAvatar(i, progress.avatarColor)}
                        title={PURGE_MASK_NAMES[i]}
                        className="flex items-center justify-center rounded-xl border p-1 transition-colors"
                        style={{ borderColor: active ? "#FFD70066" : "rgba(255,255,255,0.08)", background: active ? "rgba(255,215,0,0.08)" : "rgba(255,255,255,0.02)" }}
                      >
                        <PurgeAvatar seed={seed} size={34} variant={i} color={progress.avatarColor} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* avatar — color */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate">Avatar color</span>
                <div className="flex flex-wrap gap-2">
                  {PURGE_COLORS.map((c) => {
                    const active = progress.avatarColor === c;
                    return (
                      <button
                        key={c} type="button"
                        onClick={() => onSetAvatar(progress.avatarVariant ?? 0, c)}
                        className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
                        style={{ background: c, borderColor: active ? "#fff" : "transparent", boxShadow: active ? `0 0 10px ${c}` : undefined }}
                        aria-label={`Color ${c}`}
                      />
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => onSetAvatar(null, null)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 font-mono text-[10px] text-slate transition-colors hover:text-white"
                  >
                    Auto
                  </button>
                </div>
              </div>

              {/* card cosmetics */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate">King Card theme</span>
                <div className="grid grid-cols-4 gap-2">
                  {THEME_OPTIONS.map((t) => {
                    const owned   = t.item === null || ownedItems.includes(t.item);
                    const active  = progress.equippedCardTheme === t.id;
                    const Icon    = t.icon;
                    return (
                      <button
                        key={t.id} type="button"
                        disabled={!owned}
                        onClick={() => owned && onEquipTheme(t.id)}
                        className="flex flex-col items-center gap-1 rounded-xl border py-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ borderColor: active ? `${t.color}66` : "rgba(255,255,255,0.08)", background: active ? `${t.color}14` : "rgba(255,255,255,0.02)" }}
                      >
                        {owned ? <Icon className="h-4 w-4" style={{ color: t.color }} aria-hidden /> : <Lock className="h-4 w-4 text-dim" aria-hidden />}
                        <span className="font-mono text-[9px]" style={{ color: active ? t.color : "#8892a4" }}>{t.label}</span>
                        {active && <Check className="h-3 w-3 text-emerald" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
                <p className="font-mono text-[10px] text-dim">Locked themes are sold in the Armory.</p>
              </div>
            </div>
          </SpotlightCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
