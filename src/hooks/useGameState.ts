import { useCallback, useEffect, useRef, useState } from "react";
import {
  GAME_CONFIG,
  bagAddFor,
  yoinkCostAt,
  type GameState,
  type King,
  type LeaderboardEntry,
  type YoinkEvent,
} from "@/lib/types";
import { randomPoolWallet } from "@/lib/wallets";

let kingCounter = 0;
const nextId = () => `king-${Date.now()}-${kingCounter++}`;

function seedRecentKings(): King[] {
  return Array.from({ length: 6 }, () => ({
    wallet: randomPoolWallet(),
    heldFor: Math.floor(2 + Math.random() * 24),
    isYou: false,
    id: nextId(),
  }));
}

function seedLeaderboard(): LeaderboardEntry[] {
  const now = Date.now();
  const rows: Omit<LeaderboardEntry, "rank">[] = Array.from({ length: 11 }, (_, i) => ({
    wallet: randomPoolWallet(),
    solWon: +(3 + Math.random() * 47).toFixed(3),
    dateWon: new Date(now - i * 86_400_000 * (1 + Math.random())).toISOString(),
    round: 1820 - i * 7 - Math.floor(Math.random() * 5),
    isYou: false,
  }));
  rows.sort((a, b) => b.solWon - a.solWon);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

const INITIAL: GameState = {
  bagAmount: GAME_CONFIG.STARTING_BAG,
  countdown: GAME_CONFIG.ROUND_SECONDS,
  currentKing: randomPoolWallet(),
  kingIsYou: false,
  kingHeldFor: 0,
  recentKings: seedRecentKings(),
  yoinkHistory: [],
  roundNumber: 1847,
  isRoundOver: false,
  winner: null,
  winnerIsYou: false,
  yoinkCount: 0,
  currentCost: GAME_CONFIG.BASE_COST,
  biggestBag: 128.4,
  totalDistributed: 9421.62,
  playerCount: 0,
  playerCooldownUntil: 0,
  isWaiting: true,           // start in lobby until players arrive
};

export function useGameState() {
  const [state, setState] = useState<GameState>(INITIAL);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(seedLeaderboard);

  const stateRef = useRef(state);
  stateRef.current = state;
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heldTickRef = useRef(0);
  // tracks when each bot wallet last yoinked — basic bot cooldown
  const botCooldowns = useRef<Map<string, number>>(new Map());

  /** Core yoink application — shared by player + bot paths. */
  const applyYoink = useCallback((byPlayer: boolean) => {
    const now = Date.now();
    setState((prev) => {
      if (prev.isRoundOver || prev.isWaiting) return prev;

      const cost = prev.currentCost;
      const nextCount = prev.yoinkCount + 1;
      const nextCost = yoinkCostAt(nextCount);
      const bagAdd = bagAddFor(cost);

      const fallen: King = {
        wallet: prev.currentKing,
        heldFor: prev.kingHeldFor,
        isYou: prev.kingIsYou,
        id: nextId(),
      };

      const newKing = byPlayer ? "You" : randomPoolWallet(prev.currentKing);

      const event: YoinkEvent = {
        id: nextId(),
        wallet: newKing,
        isYou: byPlayer,
        cost,
        bagAfter: +(prev.bagAmount + bagAdd).toFixed(6),
        ts: now,
      };

      return {
        ...prev,
        bagAmount: +(prev.bagAmount + bagAdd).toFixed(6),
        countdown: GAME_CONFIG.ROUND_SECONDS,
        currentKing: newKing,
        kingIsYou: byPlayer,
        kingHeldFor: 0,
        recentKings: [fallen, ...prev.recentKings].slice(0, 10),
        yoinkHistory: [event, ...prev.yoinkHistory].slice(0, 50),
        yoinkCount: nextCount,
        currentCost: nextCost,
        playerCooldownUntil: byPlayer
          ? now + GAME_CONFIG.PLAYER_COOLDOWN_MS
          : prev.playerCooldownUntil,
      };
    });
    heldTickRef.current = 0;
  }, []);

  /** Player-initiated yoink — checks cooldown first. */
  const yoink = useCallback(() => {
    const s = stateRef.current;
    if (s.isRoundOver || s.isWaiting || s.kingIsYou) return;
    if (Date.now() < s.playerCooldownUntil) return; // still cooling down
    applyYoink(true);
  }, [applyYoink]);

  /** Start a fresh round. */
  const playAgain = useCallback(() => {
    setState((prev) => ({
      ...INITIAL,
      roundNumber: prev.roundNumber + 1,
      recentKings: prev.recentKings,
      biggestBag: prev.biggestBag,
      totalDistributed: prev.totalDistributed,
      playerCount: prev.playerCount,
      currentKing: randomPoolWallet(),
      bagAmount: +(GAME_CONFIG.STARTING_BAG + Math.random() * 1.5).toFixed(3),
      isWaiting: false, // players are already here
    }));
    heldTickRef.current = 0;
    botCooldowns.current.clear();
  }, []);

  // ── Core tick loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    tickRef.current = setInterval(() => {
      const now = Date.now();

      setState((prev) => {
        // ── LOBBY: waiting for minimum players ──────────────────────────────
        if (prev.isWaiting) {
          if (prev.playerCount >= GAME_CONFIG.MIN_PLAYERS) {
            return { ...prev, isWaiting: false };
          }
          return prev;
        }

        if (prev.isRoundOver) return prev;

        const nextCountdown = +(prev.countdown - GAME_CONFIG.TICK_MS / 1000).toFixed(2);

        // ── ROUND OVER ───────────────────────────────────────────────────────
        if (nextCountdown <= 0) {
          const won = +prev.bagAmount.toFixed(3);
          const entry: LeaderboardEntry = {
            rank: 0,
            wallet: prev.kingIsYou ? "You" : prev.currentKing,
            solWon: won,
            dateWon: new Date().toISOString(),
            round: prev.roundNumber,
            isYou: prev.kingIsYou,
          };
          setLeaderboard((lb) => {
            const merged = [...lb, entry].sort((a, b) => b.solWon - a.solWon);
            return merged.map((r, i) => ({ ...r, rank: i + 1 })).slice(0, 50);
          });
          return {
            ...prev,
            countdown: 0,
            isRoundOver: true,
            winner: prev.kingIsYou ? "You" : prev.currentKing,
            winnerIsYou: prev.kingIsYou,
            biggestBag: Math.max(prev.biggestBag, won),
            totalDistributed: +(prev.totalDistributed + won).toFixed(2),
          };
        }

        // ── HELD-FOR counter (1s resolution via 10 ticks) ───────────────────
        heldTickRef.current += 1;
        const heldFor =
          heldTickRef.current >= 10
            ? ((heldTickRef.current = 0), prev.kingHeldFor + 1)
            : prev.kingHeldFor;

        // ── PLAYER COUNT gentle drift ────────────────────────────────────────
        const drift = Math.random();
        let players = prev.playerCount;
        if (drift > 0.94) players = Math.min(players + 1, 999);
        else if (drift < 0.04 && players > GAME_CONFIG.MIN_PLAYERS + 2) players -= 1;

        return {
          ...prev,
          countdown: nextCountdown,
          kingHeldFor: heldFor,
          playerCount: players,
        };
      });

      // ── BOT YOINK LOGIC (reads ref — outside setState) ──────────────────────
      const s = stateRef.current;
      if (!s.isRoundOver && !s.isWaiting) {
        const frac = s.countdown / GAME_CONFIG.ROUND_SECONDS;

        // Base probability — grows as clock ticks down
        let chance = 0.010;
        if (frac < 0.60) chance = 0.022;
        if (frac < 0.35) chance = 0.045;
        if (frac < 0.18) chance = 0.08;
        if (frac < 0.10) chance = 0.12;
        // Ease off slightly if player holds — give them a chance to win
        if (s.kingIsYou && frac < 0.10) chance = 0.05;

        if (Math.random() < chance) {
          const botWallet = randomPoolWallet(s.currentKing);
          const lastYoink = botCooldowns.current.get(botWallet) ?? 0;

          // Anti-snipe jitter in last 5s — bots can't guarantee last-second steal
          const jitter =
            frac < 0.17
              ? Math.random() * GAME_CONFIG.BOT_SNIPE_JITTER_MS
              : 0;

          if (now - lastYoink > GAME_CONFIG.PLAYER_COOLDOWN_MS + jitter) {
            botCooldowns.current.set(botWallet, now);
            setTimeout(() => applyYoink(false), jitter);
          }
        }
      }
    }, GAME_CONFIG.TICK_MS);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [applyYoink]);

  // ── Seed initial player count — triggers lobby → live once threshold met ──
  useEffect(() => {
    // Simulate players trickling in over 2 seconds
    let count = 0;
    const interval = setInterval(() => {
      count += Math.floor(1 + Math.random() * 3);
      setState((p) => ({ ...p, playerCount: Math.min(count, 180 + Math.floor(Math.random() * 60)) }));
      if (count >= GAME_CONFIG.MIN_PLAYERS + 2) clearInterval(interval);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  // ── Cooldown countdown — fires every 100ms to keep UI reactive ──────────
  const [cooldownLeft, setCooldownLeft] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const left = Math.max(0, stateRef.current.playerCooldownUntil - Date.now());
      setCooldownLeft(left);
    }, 100);
    return () => clearInterval(id);
  }, []);

  return { state, leaderboard, yoink, playAgain, cooldownLeft };
}
