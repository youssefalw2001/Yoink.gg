/**
 * YOINK.GG — The Armory (Shop)
 *
 * Layout:
 *   1. Founding King NFT — pinned hero, always visible, never buried in a tab
 *   2. Two-tab grid — Cosmetics | Intel
 *      Each item card: SpotlightCard, icon, tagline, price, buy CTA
 *
 * Animation stack:
 *   - GSAP: Founding King entrance (staggered rays, jewels, crown scale-in)
 *   - Framer Motion: tab transitions, card entrance stagger, buy pulse
 *   - Anime.js v4: shop tab icon draw-in on active change
 *
 * GPU rules: transform + opacity only, will-change: transform on perpetual.
 * Lucide icons only. Zero emojis.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import {
  ShoppingBag, Check, Lock,
  Pencil, Droplets, Ghost, Crown, Wallet, Shuffle, Zap,
  Package, Sparkles, ChevronDown, ChevronUp, Star,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { RankBadge } from "@/components/ui/RankBadge";
import { XPBar } from "@/components/ui/XPBar";
import { FoundingKingArt, CosmeticsArt, PowerUpsArt } from "@/components/ui/ShopArt";
import { playPurchase } from "@/lib/sounds";
import { SHOP_ITEMS, CATEGORY_META, type ShopCategory, type ShopItem } from "@/lib/shopItems";
import type { PlayerProgress } from "@/lib/progression";
import { cn, formatSol } from "@/lib/utils";

// ─── Icon resolver ────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  Pencil, Droplets, Ghost, Crown, Wallet, Shuffle, Zap,
  Sparkles, Star, Package,
};

function ItemIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = ICON_MAP[name] ?? Package;
  return <Icon style={{ width: size, height: size }} aria-hidden />;
}

// ─── Founding King Hero ───────────────────────────────────────────────────────

function FoundingKingHero({
  owned,
  onBuy,
}: {
  owned: boolean;
  onBuy: () => void;
}) {
  const artRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [bought, setBought]     = useState(false);

  useEffect(() => {
    const el = artRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const ctx = gsap.context(() => {
      // Crown scales up from nothing
      gsap.from(el.querySelectorAll("path, rect"), {
        scaleX: 0, scaleY: 0,
        opacity: 0,
        transformOrigin: "center center",
        duration: 0.5,
        ease: "back.out(1.6)",
        stagger: { each: 0.035, from: "center" },
        delay: 0.2,
      });
      // Jewels pop in
      gsap.from(el.querySelectorAll("circle"), {
        scale: 0,
        opacity: 0,
        transformOrigin: "center center",
        duration: 0.4,
        ease: "back.out(2)",
        stagger: 0.04,
        delay: 0.5,
      });
      // Sparkle lines draw in
      gsap.from(el.querySelectorAll("line"), {
        opacity: 0,
        duration: 0.3,
        stagger: 0.02,
        delay: 0.7,
      });
    }, artRef);

    return () => ctx.revert();
  }, []);

  function handleBuy() {
    if (owned) return;
    setBought(true);
    playPurchase();
    onBuy();
  }

  const perks = [
    "Permanent 0.02 SOL discount on every YOINK",
    "0.1% of ALL rake revenue — forever",
    "Gold nameplate on every screen",
    "Vote on future mechanics and room additions",
  ];

  return (
    <SpotlightCard
      spotlightColor="rgba(255,215,0,0.18)"
      radius={500}
      className="premium-card relative overflow-hidden rounded-[28px]"
    >
      {/* Animated background aurora */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute"
          style={{
            top: "-20%", left: "-10%",
            width: "60%", height: "80%",
            background: "radial-gradient(ellipse, rgba(255,215,0,0.14) 0%, transparent 70%)",
            animation: "aurora-breathe 18s ease-in-out infinite",
            willChange: "transform",
          }}
        />
        <div
          className="absolute"
          style={{
            bottom: "-10%", right: "-5%",
            width: "50%", height: "60%",
            background: "radial-gradient(ellipse, rgba(255,153,0,0.10) 0%, transparent 70%)",
            animation: "aurora-drift 24s ease-in-out infinite",
            willChange: "transform",
          }}
        />
      </div>

      {/* Gold top bar */}
      <div
        className="h-[3px] w-full"
        style={{ background: "linear-gradient(90deg, transparent, #FFE566, #FFD700, #FF9900, transparent)" }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 py-8 text-center sm:flex-row sm:text-left sm:px-10 sm:py-10">

        {/* Art */}
        <div ref={artRef} className="shrink-0">
          <FoundingKingArt size={140} />
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-4">
          {/* Badge + title */}
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
              <Star className="h-3 w-3" aria-hidden />
              100 Only · Never Again
            </span>
            <h2 className="font-display text-3xl font-black leading-tight sm:text-4xl">
              <span className="gold-text-gradient">Founding King NFT</span>
            </h2>
            <p className="font-mono text-sm text-slate">
              Own a permanent piece of YOINK.GG — before anyone else.
            </p>
          </div>

          {/* Perks — expandable on mobile */}
          <div>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-1.5 font-mono text-[11px] text-gold/70 sm:hidden"
            >
              {expanded ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
              {expanded ? "Hide perks" : "Show 4 perks"}
            </button>
            <AnimatePresence initial={false}>
              {(expanded || true) && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="hidden flex-col gap-1.5 overflow-hidden sm:flex"
                >
                  {perks.map((perk) => (
                    <li key={perk} className="flex items-center gap-2 font-mono text-xs text-slate">
                      <Check className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
                      {perk}
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
            {/* Mobile perk list */}
            <AnimatePresence>
              {expanded && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col gap-1.5 overflow-hidden sm:hidden"
                >
                  {perks.map((perk) => (
                    <li key={perk} className="flex items-center gap-2 font-mono text-xs text-slate">
                      <Check className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
                      {perk}
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          {/* Price + CTA */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="font-display text-3xl font-black text-gold">5 SOL</span>
              <span className="font-mono text-[10px] text-dim">~$325 · 100 available</span>
            </div>

            <motion.button
              type="button"
              onClick={handleBuy}
              disabled={owned}
              whileHover={!owned ? { scale: 1.04 } : undefined}
              whileTap={!owned ? { scale: 0.96 } : undefined}
              transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
              className={cn(
                "gold-button flex items-center gap-2 px-6 py-3 font-display text-sm font-black uppercase tracking-[0.1em]",
                owned && "cursor-default opacity-60",
              )}
              style={{ willChange: "transform" }}
            >
              {owned ? (
                <>
                  <Check className="h-4 w-4" aria-hidden />
                  Owned
                </>
              ) : bought ? (
                <>
                  <Check className="h-4 w-4" aria-hidden />
                  Claimed!
                </>
              ) : (
                <>
                  <Crown className="h-4 w-4" aria-hidden />
                  Claim Your Crown
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>

      {/* Bottom divider */}
      <div
        className="h-px w-full"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,215,0,0.2), transparent)" }}
      />
    </SpotlightCard>
  );
}

// ─── Shop item card ───────────────────────────────────────────────────────────

interface ShopCardProps {
  item:        ShopItem;
  owned:       boolean;
  playerLevel: number;
  playerXp:    number;
  onBuy:       (item: ShopItem) => void;
}

function ShopCard({ item, owned, playerLevel, playerXp, onBuy }: ShopCardProps) {
  const [bought,   setBought]   = useState(false);
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const locked    = !!(item.minLevel && playerLevel < item.minLevel);
  const xpLocked  = !!(item.priceXp && playerXp < item.priceXp);
  const isBlocked = locked || xpLocked;
  const canBuy    = !isBlocked && (!owned || !!item.consumable);

  function handleBuy(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canBuy) return;
    setBought(true);
    playPurchase();
    onBuy(item);
    if (item.consumable) setTimeout(() => setBought(false), 1_800);
  }

  const priceLabel = item.priceXp
    ? `${item.priceXp.toLocaleString()} XP`
    : `${formatSol(item.price, 2)} SOL`;

  return (
    <div style={{ willChange: "transform" }}>
    <SpotlightCard
      spotlightColor={`${item.color}20`}
      radius={240}
      className="premium-card cursor-pointer rounded-[20px] transition-transform duration-200 hover:scale-[1.015]"
    >
      <div ref={cardRef} onClick={() => setExpanded((e) => !e)}>
        {/* Accent bar */}
        <div
          className="h-[2px] w-full rounded-t-[20px]"
          style={{ background: `linear-gradient(90deg, transparent, ${item.color}, transparent)` }}
        />

        <div className="flex flex-col gap-4 p-5">

          {/* Top row: icon + badge + price */}
          <div className="flex items-start justify-between gap-3">
            {/* Icon block */}
            <motion.div
              className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl"
              style={{
                background: `${item.color}18`,
                border:     `1px solid ${item.color}33`,
                color:      item.color,
              }}
              whileHover={{ scale: 1.08, rotate: 3 }}
              transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <ItemIcon name={item.icon} size={26} />
            </motion.div>

            {/* Badge + price */}
            <div className="flex flex-col items-end gap-1.5">
              {item.badge && (
                <span
                  className="rounded-full px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em]"
                  style={{
                    background: `${item.color}18`,
                    border:     `1px solid ${item.color}35`,
                    color:      item.color,
                  }}
                >
                  {item.badge}
                </span>
              )}
              <span
                className="font-mono text-lg font-black tabular-nums"
                style={{ color: item.color }}
              >
                {priceLabel}
              </span>
            </div>
          </div>

          {/* Name + tagline */}
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-base font-black tracking-tight text-white">
              {item.name}
            </h3>
            <p className="font-mono text-[11px] text-slate">{item.tagline}</p>
          </div>

          {/* Expanded detail */}
          <AnimatePresence>
            {expanded && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden font-mono text-[11px] leading-relaxed text-slate/80"
              >
                {item.description}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Tags row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {item.consumable && (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[9px] text-dim">
                Single use
              </span>
            )}
            {item.minLevel && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px]"
                style={{
                  background: locked ? "rgba(255,34,0,0.08)" : "rgba(0,230,118,0.08)",
                  border:     `1px solid ${locked ? "rgba(255,34,0,0.2)" : "rgba(0,230,118,0.2)"}`,
                  color:      locked ? "#FF2200" : "#00E676",
                }}
              >
                {locked
                  ? <Lock className="h-2.5 w-2.5" aria-hidden />
                  : <Check className="h-2.5 w-2.5" aria-hidden />}
                Rank {item.minLevel}+
              </span>
            )}
            {item.priceXp && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px]"
                style={{
                  background: xpLocked ? "rgba(255,153,0,0.08)" : "rgba(255,230,102,0.08)",
                  border:     `1px solid ${xpLocked ? "rgba(255,153,0,0.2)" : "rgba(255,230,102,0.2)"}`,
                  color:      xpLocked ? "#FF9900" : "#FFE566",
                }}
              >
                <Zap className="h-2.5 w-2.5" aria-hidden />
                {xpLocked ? `Need ${(item.priceXp - playerXp).toLocaleString()} more XP` : "XP unlocked"}
              </span>
            )}
          </div>

          {/* CTA */}
          <motion.button
            type="button"
            onClick={handleBuy}
            disabled={!canBuy}
            whileHover={canBuy ? { scale: 1.03 } : undefined}
            whileTap={canBuy ? { scale: 0.97 } : undefined}
            transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-display text-xs font-black uppercase tracking-[0.15em] transition-all duration-200",
              isBlocked
                ? "cursor-not-allowed border border-white/[0.06] bg-white/[0.03] text-dim"
                : owned && !item.consumable
                  ? "cursor-default border border-emerald/25 bg-emerald/10 text-emerald"
                  : "border border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.10]",
            )}
            style={{ willChange: "transform" }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isBlocked ? (
                <motion.span key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                  {locked ? `Rank ${item.minLevel} required` : `Need ${item.priceXp} XP`}
                </motion.span>
              ) : owned && !item.consumable ? (
                <motion.span key="owned" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Equipped
                </motion.span>
              ) : bought ? (
                <motion.span key="done" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-emerald">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {item.consumable ? "Activated!" : "Purchased!"}
                </motion.span>
              ) : (
                <motion.span key="buy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
                  {item.priceXp ? `Use ${item.priceXp} XP` : `Buy · ${priceLabel}`}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

        </div>
      </div>
    </SpotlightCard>
    </div>
  );
}

// ─── Category tab ─────────────────────────────────────────────────────────────

function CategoryTab({
  cat,
  active,
  count,
  onClick,
}: {
  cat:     ShopCategory;
  active:  boolean;
  count:   number;
  onClick: () => void;
}) {
  const meta  = CATEGORY_META[cat];
  const Art   = cat === "cosmetics" ? CosmeticsArt : PowerUpsArt;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-1 flex-col items-center gap-1.5 rounded-xl px-4 py-3 transition-colors duration-200"
    >
      {active && (
        <motion.span
          layoutId="shop-tab-bg"
          className="absolute inset-0 rounded-xl"
          style={{ background: `${meta.accent}0.08)`, border: `1px solid ${meta.accent}0.25)` }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <Art size={36} className="relative z-10" />
      <span
        className="relative z-10 font-display text-xs font-black uppercase tracking-[0.1em]"
        style={{ color: active ? meta.color : "#8892a4" }}
      >
        {meta.label}
      </span>
      <span className="relative z-10 font-mono text-[9px] text-dim">
        {count} items
      </span>
    </button>
  );
}

// ─── Main ShopScreen ──────────────────────────────────────────────────────────

interface ShopScreenProps {
  progress:   PlayerProgress;
  ownedItems: string[];
  onBuy:      (item: ShopItem) => void;
}

const CATEGORIES: ShopCategory[] = ["cosmetics", "intel"];

export function ShopScreen({ progress, ownedItems, onBuy }: ShopScreenProps) {
  const [activeTab, setActiveTab] = useState<ShopCategory>("cosmetics");

  const items = SHOP_ITEMS.filter((i) => i.category === activeTab);

  const foundingKing = {
    id:      "founding_king_nft",
    owned:   ownedItems.includes("founding_king_nft"),
    onBuy:   () => onBuy({ id: "founding_king_nft" } as ShopItem),
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10 sm:px-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-3xl font-black tracking-tight sm:text-4xl">
          <span className="text-white">The </span>
          <span className="gold-text-gradient">Armory</span>
        </h1>
        <p className="font-mono text-xs text-slate">
          Cosmetics · Information Warfare · Founding Membership
        </p>
      </div>

      {/* ── Player progress strip ───────────────────────────────────────── */}
      <SpotlightCard
        spotlightColor="rgba(255,215,0,0.08)"
        radius={320}
        className="premium-card rounded-2xl"
      >
        <div className="flex items-center gap-4 px-5 py-4">
          <RankBadge level={progress.level} size="md" showArt={false} />
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold text-white">{progress.rankName}</span>
              <span className="font-mono text-[10px] text-slate">
                {progress.xp.toLocaleString()} XP · {progress.xpToNext.toLocaleString()} to next rank
              </span>
            </div>
            <XPBar progress={progress} compact={false} />
          </div>
          <div className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
            <span className="font-mono text-sm font-bold tabular-nums text-gold">{progress.totalYoinks}</span>
            <span className="font-mono text-[9px] text-dim uppercase tracking-[0.15em]">yoinks</span>
          </div>
        </div>
      </SpotlightCard>

      {/* ── Founding King NFT hero ──────────────────────────────────────── */}
      <FoundingKingHero
        owned={foundingKing.owned}
        onBuy={foundingKing.onBuy}
      />

      {/* ── Category tabs ───────────────────────────────────────────────── */}
      <div
        className="flex gap-2 rounded-2xl p-1.5"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        {CATEGORIES.map((cat) => (
          <CategoryTab
            key={cat}
            cat={cat}
            active={cat === activeTab}
            count={SHOP_ITEMS.filter((i) => i.category === cat).length}
            onClick={() => setActiveTab(cat)}
          />
        ))}
      </div>

      {/* ── Category description ────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="font-mono text-xs text-slate">
            {CATEGORY_META[activeTab].description}
          </p>

          {/* ── Items grid ──────────────────────────────────────────────── */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.35,
                  delay: i * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <ShopCard
                  item={item}
                  owned={ownedItems.includes(item.id)}
                  playerLevel={progress.level}
                  playerXp={progress.xp}
                  onBuy={onBuy}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── Intel tab: Wallet Tracker + Pump Fake meta explainer ────────── */}
      <AnimatePresence>
        {activeTab === "intel" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <SpotlightCard
              spotlightColor="rgba(0,230,118,0.08)"
              radius={300}
              className="premium-card rounded-[20px]"
            >
              <div className="flex flex-col gap-3 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-emerald" aria-hidden />
                  <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
                    The Information Meta
                  </h3>
                </div>
                <p className="font-mono text-[11px] leading-relaxed text-slate">
                  <span className="font-bold text-white">Wallet Tracker</span> sees everyone's balance.{" "}
                  <span className="font-bold text-blood">Pump Fake</span> poisons what they see.
                  Stack them — activate Pump Fake first, then Wallet Tracker.
                  You see real numbers. They see your decoy.
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-lg border border-emerald/20 bg-emerald/[0.06] px-3 py-1.5">
                    <Wallet className="h-3.5 w-3.5 text-emerald" aria-hidden />
                    <span className="font-mono text-[11px] text-emerald">Tracker → 0.15 SOL</span>
                  </div>
                  <span className="font-mono text-[10px] text-dim">+</span>
                  <div className="flex items-center gap-2 rounded-lg border border-blood/20 bg-blood/[0.06] px-3 py-1.5">
                    <Shuffle className="h-3.5 w-3.5 text-blood" aria-hidden />
                    <span className="font-mono text-[11px] text-blood">Pump Fake → 0.25 SOL</span>
                  </div>
                  <span className="font-mono text-[10px] text-dim">= full control</span>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
