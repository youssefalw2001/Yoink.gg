/**
 * YOINK.GG — Shop Catalogue (Simplified)
 *
 * STRESS TEST RESULTS — items cut from 22 → 7:
 *
 * REMOVED:
 *   - Round Insurance: anti-snipe cooldown already prevents the scenario
 *   - Timer Freeze: conflicts with Hidden Fuse (timer is already hidden)
 *   - King's Shield: bot vs player distinction doesn't exist in simulation
 *   - Bag Spy: "estimated bot count" is fake — misleading
 *   - Ghost Mode / Phantom YOINK: duplicate items, need real feeds
 *   - Cooldown Reducer: meaningless without dense real-player competition
 *   - Warlord Season Pass: references rooms that don't exist yet
 *   - Early Warning: needs a real notification system
 *   - Void King / Rainbow Flames / Blue Flames: can reduce to 2 themes
 *   - Jackpot Ticket: jackpot system not live yet
 *
 * KEPT:
 *   - Cosmetics that work RIGHT NOW (display name, 2 themes, crown)
 *   - Intel items that work in simulation (Wallet Tracker, Pump Fake)
 *   - Double XP — now costs XP not SOL (makes more sense for a progression bonus)
 *   - Founding King NFT — pinned as hero above the tab grid, never buried
 *
 * CATEGORIES: cosmetics | intel
 * (passes category removed — Founding King is a hero, not a tab item)
 */

export type ShopCategory = "cosmetics" | "intel";

export interface ShopItem {
  id:           string;
  name:         string;
  tagline:      string;  // one punchy line, replaces long description
  description:  string;  // expanded detail shown on hover/expand
  price:        number;  // SOL (0 = free / XP-priced — see priceXp)
  priceXp?:     number;  // if set, costs XP not SOL
  category:     ShopCategory;
  icon:         string;  // lucide icon name
  color:        string;  // accent hex
  minLevel?:    number;
  consumable?:  boolean;
  badge?:       string;
  /** Whether this item is functional in simulation mode (no blockchain needed) */
  worksNow:     boolean;
}

export const SHOP_ITEMS: ShopItem[] = [

  // ── Cosmetics ──────────────────────────────────────────────────────────────
  {
    id:          "display_name",
    name:        "Custom Name",
    tagline:     "Show your alias, not your address.",
    description: "Your chosen name appears everywhere — activity feed, King Card, leaderboard, Survivor Board. First impressions matter.",
    price:       0.5,
    category:    "cosmetics",
    icon:        "Pencil",
    color:       "#FFD700",
    badge:       "Popular",
    worksNow:    true,
  },
  {
    id:          "theme_blood",
    name:        "Blood King",
    tagline:     "Crimson card. Red flames. Fear.",
    description: "Replaces your King Card background with a deep crimson shader and blood-red flame particles. Visible to everyone in the room when you hold the bag.",
    price:       0.2,
    category:    "cosmetics",
    icon:        "Droplets",
    color:       "#FF2200",
    worksNow:    true,
  },
  {
    id:          "theme_phantom",
    name:        "Phantom",
    tagline:     "Deep violet. Invisible instincts.",
    description: "Phantom aura on your King Card with violet glow effects. Pairs with Pump Fake for a complete psychological warfare loadout.",
    price:       0.2,
    category:    "cosmetics",
    icon:        "Ghost",
    color:       "#7000FF",
    worksNow:    true,
  },
  {
    id:          "crown_animated",
    name:        "Animated Crown",
    tagline:     "Spin it. Flex it. Earn it.",
    description: "A spinning golden crown orbits above your King Card when you hold the bag. Visible to everyone in the room. Pure status.",
    price:       0.4,
    category:    "cosmetics",
    icon:        "Crown",
    color:       "#FFE566",
    badge:       "Hot",
    worksNow:    true,
  },

  // ── Intel ─────────────────────────────────────────────────────────────────
  // (Information warfare items — the meta-game layer)
  {
    id:          "wallet_tracker",
    name:        "Wallet Tracker",
    tagline:     "See every wallet balance in your match.",
    description: "Reveals the live SOL balance of every player at your table. Know who's running low and can't keep fighting. One-round use.",
    price:       0.15,
    category:    "intel",
    icon:        "Wallet",
    color:       "#00E676",
    consumable:  true,
    badge:       "New",
    worksNow:    true,
  },
  {
    id:          "pump_fake",
    name:        "Pump Fake",
    tagline:     "Show a fake balance. Mess with their heads.",
    description: "Wallet Tracker users see a decoy SOL balance on your row — you choose the number. Makes opponents misjudge your firepower. One-round use.",
    price:       0.25,
    category:    "intel",
    icon:        "Shuffle",
    color:       "#FF2200",
    consumable:  true,
    badge:       "New",
    minLevel:    2,
    worksNow:    true,
  },
  {
    id:          "double_xp",
    name:        "Double XP",
    tagline:     "2× XP for your next 3 rounds.",
    description: "Stacks with the daily 5-round bonus. Best used right before a big session to accelerate your rank and unlock higher rooms faster.",
    price:       0,
    priceXp:     200,
    category:    "intel",
    icon:        "Zap",
    color:       "#FFE566",
    consumable:  true,
    worksNow:    true,
  },
];

export const CATEGORY_META: Record<ShopCategory, {
  label:       string;
  description: string;
  color:       string;
  accent:      string;
}> = {
  cosmetics: {
    label:       "Cosmetics",
    description: "Make your King Card unforgettable when you hold the bag.",
    color:       "#FFD700",
    accent:      "rgba(255,215,0,",
  },
  intel: {
    label:       "Intel",
    description: "Information is power. See what others can't. Deceive those who can.",
    color:       "#00E676",
    accent:      "rgba(0,230,118,",
  },
};
