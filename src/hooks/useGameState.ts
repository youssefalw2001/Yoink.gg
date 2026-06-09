import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_CONFIG, type GameState, type King, type LeaderboardEntry } from "@/lib/types";
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
  roundNumber: 1847,
  isRoundOver: false,
  winner: null,
  winnerIsYou: false,
  biggestBag: 128.4,
  totalDistributed: 9421.62,
  playerCount: 0,
};

export function useGameState() {
  const [state, setState] = useState<GameState>(INITIAL);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(seedLeaderboard);

  // Mutable refs to avoid stale closures inside the interval.
  const stateRef = useRef(state);
  stateRef.current = state;
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heldTickRef = useRef(0);

  /** Apply a yoink — either the player or a simulated bot becomes king. */
  const applyYoink = useCallback((byPlayer: boolean) => {
    setState((prev) => {
      if (prev.isRoundOver) return prev;
      const fallen: King = {
        wallet: prev.currentKing,
        heldFor: prev.kingHeldFor,
        isYou: prev.kingIsYou,
        id: nextId(),
      };
      const newKing = byPlayer ? "You" : randomPoolWallet(prev.currentKing);
      return {
        ...prev,
        bagAmount: +(prev.bagAmount + GAME_CONFIG.BAG_ADD).toFixed(6),
        countdown: GAME_CONFIG.ROUND_SECONDS,
        currentKing: newKing,
        kingIsYou: byPlayer,
        kingHeldFor: 0,
        recentKings: [fallen, ...prev.recentKings].slice(0, 10),
        playerCount: prev.playerCount,
      };
    });
    heldTickRef.current = 0;
  }, []);

  /** Player action. */
  const yoink = useCallback(() => {
    if (stateRef.current.isRoundOver || stateRef.current.kingIsYou) return;
    applyYoink(true);
  }, [applyYoink]);

  /** Start a fresh round after a win. */
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
    }));
    heldTickRef.current = 0;
  }, []);

  // --- Core simulation loop ---
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.isRoundOver) return prev;

        const nextCountdown = +(prev.countdown - GAME_CONFIG.TICK_MS / 1000).toFixed(2);

        // round ends → current king wins
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

        // hold-for counter (1s resolution)
        heldTickRef.current += 1;
        const heldFor =
          heldTickRef.current >= 10
            ? ((heldTickRef.current = 0), prev.kingHeldFor + 1)
            : prev.kingHeldFor;

        // gently fluctuate the live player count
        const drift = Math.random();
        let players = prev.playerCount;
        if (drift > 0.94) players += 1;
        else if (drift < 0.04 && players > 12) players -= 1;

        return { ...prev, countdown: nextCountdown, kingHeldFor: heldFor, playerCount: players };
      });

      // --- Bot yoink logic (runs outside setState to read fresh ref) ---
      const s = stateRef.current;
      if (!s.isRoundOver) {
        const frac = s.countdown / GAME_CONFIG.ROUND_SECONDS;
        // Bots get hungrier as time runs low, but never guarantee a steal.
        let chance = 0.012;
        if (frac < 0.5) chance = 0.03;
        if (frac < 0.25) chance = 0.06;
        if (frac < 0.12) chance = 0.11;
        // Don't always steal from the player on the last breath — let wins happen.
        if (s.kingIsYou && frac < 0.12) chance = 0.05;
        if (Math.random() < chance) {
          applyYoink(false);
        }
      }
    }, GAME_CONFIG.TICK_MS);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [applyYoink]);

  // Seed an initial player count once mounted.
  useEffect(() => {
    setState((p) => ({ ...p, playerCount: 142 + Math.floor(Math.random() * 80) }));
  }, []);

  return { state, leaderboard, yoink, playAgain };
}
