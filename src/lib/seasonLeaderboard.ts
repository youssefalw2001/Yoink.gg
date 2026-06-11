/**
 * YOINK.GG — Season Leaderboard
 *
 * DESIGN DECISIONS from stress test:
 *
 * 1. WEEKLY not monthly — shorter cycle = more frequent dopamine, players
 *    check back every 7 days instead of 30.
 *
 * 2. ROOM-WEIGHTED POINTS not raw SOL wagered:
 *    Pit yoink    = 1 pt  (cheap room, high volume)
 *    Grind yoink  = 3 pts (mid room)
 *    Arena yoink  = 10 pts (standard)
 *    Court yoink  = 50 pts (whale room — real value contributed)
 *    This prevents Pit grinders dominating while not locking small wallets out.
 *
 * 3. PRIZES in XP + badge in simulation. On mainnet: SOL from rake.
 *    100 DAU × 15 yoinks/day × 0.1 SOL avg × 10% rake = 15 SOL/day
 *    Weekly: 105 SOL → recycle 20 SOL to top 10 → house keeps 81%
 *
 * 4. TOP 10 — small player base at launch, keeps competition tight.
 *
 * 5. MIN_SEASON_POINTS floor — no payout in ghost weeks.
 */

export const ROOM_POINTS: Record<string, number> = {
  pit:   1,
  grind: 3,
  arena: 10,
  court: 50,
};

export interface SeasonEntry {
  rank:        number;
  wallet:      string;
  displayName: string | null;
  isYou:       boolean;
  points:      number;
  yoinks:      number;
  wins:        number;
  prize:       string | null;
}

export interface SeasonPrizeTier {
  minRank:  number;
  maxRank:  number;
  label:    string;
  xpBonus:  number;
  badge:    string;
  solPrize: number;
}

export const PRIZE_TIERS: SeasonPrizeTier[] = [
  { minRank: 1,  maxRank: 1,  label: "Season King", xpBonus: 5000, badge: "SK", solPrize: 5.0 },
  { minRank: 2,  maxRank: 3,  label: "Warlord",     xpBonus: 2500, badge: "WL", solPrize: 2.0 },
  { minRank: 4,  maxRank: 5,  label: "Predator",    xpBonus: 1500, badge: "PR", solPrize: 1.0 },
  { minRank: 6,  maxRank: 10, label: "Hunter",      xpBonus: 750,  badge: "HN", solPrize: 0.5 },
];

export const MIN_SEASON_POINTS = 500;

export function getPrizeTier(rank: number): SeasonPrizeTier | null {
  return PRIZE_TIERS.find((t) => rank >= t.minRank && rank <= t.maxRank) ?? null;
}

export function prizeLabelForRank(rank: number): string | null {
  const tier = getPrizeTier(rank);
  if (!tier) return null;
  return `${tier.label} · +${tier.xpBonus.toLocaleString()} XP`;
}

export function generateSeasonLeaderboard(playerWallet: string | null): SeasonEntry[] {
  const fakeWallets = [
    "7xKp...mR3q", "B9nL...vT8w", "Qw2Z...kH5f", "Nt6Y...pX1d",
    "Ek4V...jC9s", "Rg8W...uA2y", "Lm3S...bN7h", "Fd5J...oI4t",
    "Yc1O...zE6r", "Hb7T...gM0n",
  ];

  const entries: Omit<SeasonEntry, "rank" | "prize">[] = fakeWallets.map((w, i) => {
    const basePoints = Math.floor(8500 / (i + 1) + Math.random() * 300);
    return {
      wallet: w, displayName: null, isYou: false,
      points: basePoints,
      yoinks: Math.floor(basePoints / 8),
      wins:   Math.floor(basePoints / 120),
    };
  });

  if (playerWallet) {
    entries.push({
      wallet: playerWallet, displayName: "You", isYou: true,
      points: Math.floor(1200 + Math.random() * 800),
      yoinks: Math.floor(150 + Math.random() * 80),
      wins:   Math.floor(8 + Math.random() * 5),
    });
  }

  entries.sort((a, b) => b.points - a.points);
  return entries.slice(0, 10).map((e, i) => ({
    ...e, rank: i + 1, prize: prizeLabelForRank(i + 1),
  }));
}

export function timeUntilSeasonReset(): { days: number; hours: number; minutes: number } {
  const now  = new Date();
  const day  = now.getUTCDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysUntilMonday);
  next.setUTCHours(0, 0, 0, 0);
  const diff    = next.getTime() - now.getTime();
  const days    = Math.floor(diff / 86_400_000);
  const hours   = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return { days, hours, minutes };
}
