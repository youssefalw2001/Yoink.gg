/**
 * YOINK.GG — Shop catalogue
 * All items defined here. Price in SOL. Category drives tab layout.
 */

export type ShopCategory = "cosmetics" | "utility" | "powerups" | "passes";

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;       // SOL
  category: ShopCategory;
  icon: string;        // lucide icon name (resolved in ShopScreen)
  color: string;       // accent hex
  /** Level required to purchase */
  minLevel?: number;
  /** Is this a consumable (can be bought multiple times)? */
  consumable?: boolean;
  /** Is this a subscription? */
  subscription?: boolean;
  /** Badge shown on card */
  badge?: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  // ── Cosmetics ──────────────────────────────────────────────────────────────
  {
    id: "display_name",
    name: "Custom Display Name",
    description: "Show your alias instead of a wallet address everywhere on the site.",
    price: 0.5,
    category: "cosmetics",
    icon: "Pencil",
    color: "#FFD700",
    badge: "Popular",
  },
  {
    id: "theme_blood",
    name: "Blood King Theme",
    description: "Crimson card background and red flame particles for your King Card.",
    price: 0.2,
    category: "cosmetics",
    icon: "Droplets",
    color: "#FF2200",
  },
  {
    id: "theme_phantom",
    name: "Phantom Theme",
    description: "Deep violet aura and phantom glow on your King Card.",
    price: 0.2,
    category: "cosmetics",
    icon: "Ghost",
    color: "#7000FF",
  },
  {
    id: "theme_void",
    name: "Void King Theme",
    description: "Pure black card with white scanline effect. Minimal. Deadly.",
    price: 0.3,
    category: "cosmetics",
    icon: "Moon",
    color: "#8892a4",
    minLevel: 3,
  },
  {
    id: "crown_animated",
    name: "Animated Crown",
    description: "A spinning golden crown floats above your King Card when you hold the bag.",
    price: 0.4,
    category: "cosmetics",
    icon: "Crown",
    color: "#FFD700",
    badge: "Hot",
  },
  {
    id: "flame_blue",
    name: "Blue Flames",
    description: "Ice-cold blue flame particles replace the default gold flames.",
    price: 0.2,
    category: "cosmetics",
    icon: "Flame",
    color: "#29B6F6",
  },
  {
    id: "flame_rainbow",
    name: "Rainbow Flames",
    description: "Cycling rainbow flame particles. Maximum flex.",
    price: 0.35,
    category: "cosmetics",
    icon: "Sparkles",
    color: "#FF9900",
    minLevel: 5,
    badge: "Rare",
  },

  // ── Utility ────────────────────────────────────────────────────────────────
  {
    id: "early_warning",
    name: "Early Warning",
    description: "Get notified when the bag exceeds 5 SOL. Strike at the right moment.",
    price: 0.3,
    category: "utility",
    icon: "Bell",
    color: "#FFE566",
    subscription: true,
    badge: "Weekly",
  },
  {
    id: "cooldown_reducer",
    name: "Cooldown Reducer",
    description: "Your anti-snipe cooldown drops from 3s to 2s. Permanently.",
    price: 1.5,
    category: "utility",
    icon: "Timer",
    color: "#00E676",
    minLevel: 4,
    badge: "Permanent",
  },
  {
    id: "round_insurance",
    name: "Round Insurance",
    description: "YOINKed within 3s? Get 50% of your payment refunded. Per round.",
    price: 0.05,
    category: "utility",
    icon: "ShieldCheck",
    color: "#26C6DA",
    consumable: true,
    badge: "Per Round",
  },
  {
    id: "ghost_mode",
    name: "Ghost Mode",
    description: "Your wallet address is hidden as '???' in the activity feed for one round.",
    price: 0.8,
    category: "utility",
    icon: "EyeOff",
    color: "#AB47BC",
    consumable: true,
    minLevel: 6,
  },
  {
    id: "kings_shield",
    name: "King's Shield",
    description: "One-time use. Blocks the very next bot YOINK on your bag.",
    price: 0.2,
    category: "utility",
    icon: "Shield",
    color: "#FFD700",
    consumable: true,
  },
  {
    id: "bag_spy",
    name: "Bag Spy",
    description: "See the live player count AND estimated bot count for any round.",
    price: 0.1,
    category: "utility",
    icon: "Telescope",
    color: "#8892a4",
    consumable: true,
  },

  // ── Power-ups ──────────────────────────────────────────────────────────────
  {
    id: "double_xp",
    name: "Double XP",
    description: "2× XP earned for your next 3 rounds. Stack with daily bonus.",
    price: 0.05,
    category: "powerups",
    icon: "Zap",
    color: "#FFE566",
    consumable: true,
  },
  {
    id: "timer_freeze",
    name: "Timer Freeze",
    description: "Pause the countdown for 2 seconds. One use per round per wallet.",
    price: 0.5,
    category: "powerups",
    icon: "PauseCircle",
    color: "#29B6F6",
    consumable: true,
    minLevel: 5,
    badge: "Powerful",
  },
  {
    id: "bag_bomb",
    name: "Bag Bomb",
    description: "Instantly seeds 0.2 SOL into the bag. Creates instant FOMO.",
    price: 0.3,
    category: "powerups",
    icon: "Bomb",
    color: "#FF9900",
    consumable: true,
  },
  {
    id: "bounty_mark",
    name: "Bounty Mark",
    description: "Put a visible bounty on another player. They'll see a target icon on their card.",
    price: 0.25,
    category: "powerups",
    icon: "Target",
    color: "#EF5350",
    consumable: true,
    minLevel: 3,
  },
  {
    id: "phantom_yoink",
    name: "Phantom YOINK",
    description: "Your wallet shows as '???' for one YOINK only. Untraceable.",
    price: 1.0,
    category: "powerups",
    icon: "Ghost",
    color: "#7000FF",
    consumable: true,
    minLevel: 6,
    badge: "Elite",
  },

  // ── Passes ─────────────────────────────────────────────────────────────────
  {
    id: "kings_pass_monthly",
    name: "King's Pass",
    description: "All rank perks unlocked. 2s cooldown. Early warnings. Priority support.",
    price: 0.5,
    category: "passes",
    icon: "Star",
    color: "#FFD700",
    subscription: true,
    badge: "Monthly",
  },
  {
    id: "warlord_season",
    name: "Warlord Season Pass",
    description: "Full access to all private Warlord rooms for 4 weeks.",
    price: 2.0,
    category: "passes",
    icon: "Swords",
    color: "#AB47BC",
    subscription: true,
    minLevel: 6,
    badge: "Season",
  },
  {
    id: "jackpot_ticket",
    name: "Jackpot Ticket",
    description: "One entry into the weekly jackpot drawing from the reserve pool.",
    price: 0.1,
    category: "passes",
    icon: "Ticket",
    color: "#FF9900",
    consumable: true,
  },
  {
    id: "founding_king_nft",
    name: "Founding King NFT",
    description: "Permanent 0.02 SOL discount. Gold nameplate forever. 0.1% of all rake. Only 100 exist.",
    price: 5.0,
    category: "passes",
    icon: "Crown",
    color: "#FFD700",
    minLevel: 1,
    badge: "100 Only",
  },
];

export const CATEGORY_META: Record<ShopCategory, { label: string; description: string; color: string }> = {
  cosmetics: { label: "Cosmetics",  description: "Skins, themes, and flex items",        color: "#FFD700" },
  utility:   { label: "Utility",    description: "Tactical advantages and tools",         color: "#00E676" },
  powerups:  { label: "Power-Ups",  description: "One-time consumable boosts",            color: "#FF9900" },
  passes:    { label: "Passes",     description: "Subscriptions and rare access",         color: "#7000FF" },
};
