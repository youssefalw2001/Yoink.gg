/**
 * YOINK.GG — Player Progression System
 * 10 ranks, XP from every game action, persisted to localStorage.
 */

export interface Rank {
  level: number;
  name: string;
  xpRequired: number;
  /** Tailwind-compatible hex color for badge */
  color: string;
  /** SOL discount on each YOINK (simulated) */
  discount: number;
  perk: string;
}

export const RANKS: Rank[] = [
  { level: 1,  name: "Peasant",    xpRequired: 0,       color: "#8892a4", discount: 0,     perk: "None — you're nobody" },
  { level: 2,  name: "Pickpocket", xpRequired: 500,     color: "#00E676", discount: 0,     perk: "Green name on leaderboard" },
  { level: 3,  name: "Thief",      xpRequired: 1_500,   color: "#29B6F6", discount: 0,     perk: "Custom tag in activity feed" },
  { level: 4,  name: "Bandit",     xpRequired: 3_500,   color: "#FFA726", discount: 0.005, perk: "0.005 SOL YOINK discount" },
  { level: 5,  name: "Outlaw",     xpRequired: 7_500,   color: "#EF5350", discount: 0.005, perk: "Exclusive Outlaw KingCard frame" },
  { level: 6,  name: "Warlord",    xpRequired: 15_000,  color: "#AB47BC", discount: 0.008, perk: "Access to Warlord private rounds" },
  { level: 7,  name: "Baron",      xpRequired: 30_000,  color: "#7E57C2", discount: 0.010, perk: "0.01 SOL discount + Baron badge" },
  { level: 8,  name: "Duke",       xpRequired: 60_000,  color: "#26C6DA", discount: 0.012, perk: "Exclusive animated crown effect" },
  { level: 9,  name: "Prince",     xpRequired: 120_000, color: "#FFD700", discount: 0.013, perk: "Invite-only high-stakes rooms" },
  { level: 10, name: "The King",   xpRequired: 250_000, color: "#FF9900", discount: 0.015, perk: "Gold nameplate · permanent Hall of Kings top" },
];

export interface XPGain {
  amount: number;
  reason: string;
}

export const XP_REWARDS = {
  YOINK:             { amount: 10,  reason: "YOINK!" },
  SURVIVE_10S:       { amount: 15,  reason: "Survived 10s as King" },
  SURVIVE_20S:       { amount: 25,  reason: "Survived 20s as King" },
  WIN_ROUND:         { amount: 100, reason: "Won the round!" },
  WIN_BIG:           { amount: 250, reason: "Won a round > 10 SOL!" },
  DAILY_BONUS:       { amount: 30,  reason: "Daily 5-round bonus" },
  REFERRAL:          { amount: 50,  reason: "Referred a player" },
} as const satisfies Record<string, XPGain>;

export interface PlayerProgress {
  xp: number;
  level: number;
  rankName: string;
  xpToNext: number;
  xpIntoLevel: number;
  progressPct: number;   // 0–1 within current level
  totalYoinks: number;
  totalWins: number;
  totalSolWon: number;
  dailyRoundsToday: number;
  lastPlayedDate: string;
}

const STORAGE_KEY = "yoink_progress_v1";

export interface ProgressState {
  xp: number;
  totalYoinks: number;
  totalWins: number;
  totalSolWon: number;
  dailyRoundsToday: number;
  lastPlayedDate: string;
  /** item ids owned from the shop */
  ownedItems: string[];
  /** active cosmetic selections */
  equippedFlameColor: string;
  equippedCardTheme: string;
  displayName: string;
}

export const DEFAULT_STATE: ProgressState = {
  xp: 0,
  totalYoinks: 0,
  totalWins: 0,
  totalSolWon: 0,
  dailyRoundsToday: 0,
  lastPlayedDate: "",
  ownedItems: [],
  equippedFlameColor: "gold",
  equippedCardTheme: "default",
  displayName: "",
};

export function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveProgress(state: ProgressState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full / private mode */ }
}

export function rankForXp(xp: number): Rank {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (xp >= r.xpRequired) rank = r;
    else break;
  }
  return rank;
}

export function computeProgress(xp: number): PlayerProgress {
  const rank = rankForXp(xp);
  const nextRank = RANKS.find((r) => r.level === rank.level + 1);
  const xpBase = rank.xpRequired;
  const xpCap  = nextRank?.xpRequired ?? rank.xpRequired + 1;
  const xpIntoLevel = xp - xpBase;
  const xpRange = xpCap - xpBase;
  return {
    xp,
    level: rank.level,
    rankName: rank.name,
    xpToNext: nextRank ? Math.max(0, nextRank.xpRequired - xp) : 0,
    xpIntoLevel,
    progressPct: nextRank ? Math.min(xpIntoLevel / xpRange, 1) : 1,
    totalYoinks: 0,
    totalWins: 0,
    totalSolWon: 0,
    dailyRoundsToday: 0,
    lastPlayedDate: "",
  };
}
