import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShoppingBag, Check, Lock, Star, Swords, Zap,
  Pencil, Droplets, Ghost, Moon, Crown, Flame, Sparkles,
  Bell, Timer, ShieldCheck, EyeOff, Shield, Telescope,
  PauseCircle, Bomb, Target, Ticket, Package,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { RankBadge } from "@/components/ui/RankBadge";
import { XPBar } from "@/components/ui/XPBar";
import { SHOP_CATEGORY_ART, FoundingKingArt } from "@/components/ui/ShopArt";
import { playPurchase } from "@/lib/sounds";
import { SHOP_ITEMS, CATEGORY_META, type ShopCategory, type ShopItem } from "@/lib/shopItems";
import type { PlayerProgress } from "@/lib/progression";
import { cn, formatSol } from "@/lib/utils";

// ─── Icon resolver ────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  Pencil, Droplets, Ghost, Moon, Crown, Flame, Sparkles,
  Bell, Timer, ShieldCheck, EyeOff, Shield, Telescope,
  Zap, PauseCircle, Bomb, Target, Star, Swords, Ticket, Package,
};

function ItemIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Package;
  return <Icon className={className} aria-hidden />;
}

// ─── Individual shop card ─────────────────────────────────────────────────────
interface ShopCardProps {
  item: ShopItem;
  owned: boolean;
  playerLevel: number;
  onBuy: (item: ShopItem) => void;
}

function ShopCard({ item, owned, playerLevel, onBuy }: ShopCardProps) {
  const [bought, setBought] = useState(false);
  const locked = !!(item.minLevel && playerLevel < item.minLevel);
  const canBuy = !locked && (!owned || !!item.consumable);

  function handleBuy() {
    if (!canBuy) return;
    setBought(true);
    playPurchase();
    onBuy(item);
    if (item.consumable) setTimeout(() => setBought(false), 1500);
  }

  return (
    <SpotlightCard
      spotlightColor={`${item.color}22`}
      radius={220}
      className="premium-card rounded-[20px]"
    >
      <div className="relative flex flex-col gap-3 p-5">
        {/* Badge */}
        {item.badge && (
          <span
            className="absolute right-4 top-4 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
            style={{ background: `${item.color}22`, color: item.color, border: `1px solid ${item.color}44` }}
          >
            {item.badge}
          </span>
        )}

        {/* Icon — use RankArt mini if it's a rank-gated item, else lucide */}
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl overflow-hidden"
          style={{ background: `${item.color}18`, border: `1px solid ${item.color}33` }}
        >
          {item.id === "founding_king_nft" ? (
            <FoundingKingArt size={48} />
          ) : (
            <ItemIcon name={item.icon} className="h-5 w-5" />
          )}
        </div>

        {/* Name + description */}
        <div className="flex flex-col gap-1">
          <h3 className="font-sans text-sm font-bold text-white">{item.name}</h3>
          <p className="font-mono text-[11px] leading-relaxed text-slate">{item.description}</p>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {item.consumable && (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[9px] text-dim">
              Consumable
            </span>
          )}
          {item.subscription && (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[9px] text-dim">
              Subscription
            </span>
          )}
          {item.minLevel && (
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[9px]"
              style={{
                background: locked ? "rgba(255,34,0,0.1)" : "rgba(0,230,118,0.1)",
                color: locked ? "#FF2200" : "#00E676",
                border: `1px solid ${locked ? "rgba(255,34,0,0.2)" : "rgba(0,230,118,0.2)"}`,
              }}
            >
              {locked ? <Lock className="mr-1 inline h-2.5 w-2.5" aria-hidden /> : <Check className="mr-1 inline h-2.5 w-2.5" aria-hidden />}
              Rank {item.minLevel}+
            </span>
          )}
        </div>

        {/* Price + CTA */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <span className="font-mono text-base font-bold tabular-nums" style={{ color: item.color }}>
            {formatSol(item.price, 2)} SOL
          </span>

          <motion.button
            type="button"
            onClick={handleBuy}
            disabled={!canBuy}
            whileHover={canBuy ? { scale: 1.05 } : undefined}
            whileTap={canBuy ? { scale: 0.95 } : undefined}
            transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-4 py-2 font-sans text-xs font-bold uppercase tracking-wide transition-all duration-200",
              locked
                ? "cursor-not-allowed border border-white/10 bg-white/[0.04] text-dim"
                : owned && !item.consumable
                  ? "cursor-default border border-emerald/30 bg-emerald/10 text-emerald"
                  : "cursor-pointer border border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.10]",
            )}
            aria-label={locked ? `Locked — requires rank ${item.minLevel}` : owned && !item.consumable ? "Owned" : `Buy ${item.name}`}
          >
            <AnimatePresence mode="wait" initial={false}>
              {locked ? (
                <motion.span key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                  <Lock className="h-3 w-3" aria-hidden /> Locked
                </motion.span>
              ) : owned && !item.consumable ? (
                <motion.span key="owned" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                  <Check className="h-3 w-3" aria-hidden /> Owned
                </motion.span>
              ) : bought ? (
                <motion.span key="done" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-emerald">
                  <Check className="h-3 w-3" aria-hidden /> Done!
                </motion.span>
              ) : (
                <motion.span key="buy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                  <ShoppingBag className="h-3 w-3" aria-hidden /> Buy
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </SpotlightCard>
  );
}

// ─── Main ShopScreen ──────────────────────────────────────────────────────────
interface ShopScreenProps {
  progress: PlayerProgress;
  ownedItems: string[];
  onBuy: (item: ShopItem) => void;
}

const CATEGORIES: ShopCategory[] = ["cosmetics", "utility", "powerups", "passes"];

export function ShopScreen({ progress, ownedItems, onBuy }: ShopScreenProps) {
  const [activeTab, setActiveTab] = useState<ShopCategory>("cosmetics");

  const items = SHOP_ITEMS.filter((i) => i.category === activeTab);
  const meta  = CATEGORY_META[activeTab];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        {/* Hero art — rotates through category art as tab changes */}
        <motion.div
          key={activeTab}
          initial={{ scale: 0.8, opacity: 0, rotate: -6 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 26 }}
        >
          {(() => {
            const Art = SHOP_CATEGORY_ART[activeTab];
            return <Art size={120} />;
          })()}
        </motion.div>
        <h1 className="font-display text-3xl font-black tracking-tight sm:text-4xl">
          <span className="gold-text-gradient">THE KING'S ARMORY</span>
        </h1>
        <p className="font-mono text-xs text-slate">
          Cosmetics · Utility · Power-Ups · Passes
        </p>

        {/* Player progress strip */}
        <div className="mt-2 w-full max-w-sm">
          <SpotlightCard spotlightColor="rgba(255,215,0,0.10)" radius={240} className="premium-card rounded-2xl">
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-center justify-between">
                <RankBadge level={progress.level} size="md" showArt={false} />
                <span className="font-mono text-[11px] text-slate">
                  {progress.xp.toLocaleString()} XP total
                </span>
              </div>
              <XPBar progress={progress} compact={false} />
              <div className="flex gap-4 text-center">
                {[
                  { label: "YOINKs", value: progress.totalYoinks },
                  { label: "Wins",   value: progress.totalWins },
                  { label: "SOL Won", value: formatSol(progress.totalSolWon, 2) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-1 flex-col">
                    <span className="font-mono text-base font-bold text-white">{value}</span>
                    <span className="font-mono text-[10px] text-dim">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </SpotlightCard>
        </div>
      </div>

      {/* Category tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1 no-scrollbar">
        {CATEGORIES.map((cat) => {
          const m      = CATEGORY_META[cat];
          const active = cat === activeTab;
          const count  = SHOP_ITEMS.filter((i) => i.category === cat).length;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveTab(cat)}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-3 py-2.5 transition-colors duration-200",
                active ? "bg-white/[0.06]" : "hover:bg-white/[0.04]",
              )}
            >
              {active && (
                <motion.span
                  layoutId="shop-tab-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: `${m.color}14`, border: `1px solid ${m.color}33` }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span
                className="relative font-sans text-xs font-bold"
                style={{ color: active ? m.color : "#8892a4" }}
              >
                {m.label}
              </span>
              <span className="relative font-mono text-[9px] text-dim">{count} items</span>
            </button>
          );
        })}
      </div>

      {/* Category description */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          <p className="mb-4 font-mono text-xs text-slate">{meta.description}</p>

          {/* Items grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
              >
                <ShopCard
                  item={item}
                  owned={ownedItems.includes(item.id)}
                  playerLevel={progress.level}
                  onBuy={onBuy}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Founding King callout */}
      {activeTab === "passes" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="mt-8"
        >
          <SpotlightCard spotlightColor="rgba(255,215,0,0.18)" radius={400} className="premium-card rounded-[24px]">
            <div className="flex flex-col items-center gap-4 px-8 py-8 text-center">
              {/* Founding King NFT art */}
              <FoundingKingArt size={140} />
              <div>
                <h3 className="font-display text-2xl font-black">
                  <span className="gold-text-gradient">Founding King NFT</span>
                </h3>
                <p className="mt-1 font-mono text-xs text-slate">
                  Only 100 will ever exist. Own a permanent piece of YOINK.GG.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-4">
                {[
                  "Permanent 0.02 SOL discount",
                  "0.1% of ALL rake forever",
                  "Gold nameplate on every screen",
                  "Vote on future mechanics",
                ].map((perk) => (
                  <span key={perk} className="flex items-center gap-1.5 font-mono text-xs text-gold/80">
                    <Check className="h-3.5 w-3.5 text-gold" aria-hidden />
                    {perk}
                  </span>
                ))}
              </div>
              <div className="font-mono text-3xl font-black text-gold">5.000 SOL</div>
              <p className="font-mono text-[10px] text-dim">
                500 SOL raised · 100 Founding Kings · on-chain revenue share
              </p>
            </div>
          </SpotlightCard>
        </motion.div>
      )}
    </div>
  );
}
