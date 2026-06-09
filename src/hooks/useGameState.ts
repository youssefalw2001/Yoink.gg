import { useCallback, useEffect, useRef, useState } from "react";
import {
  GAME_CONFIG,
  bagAddFor,
  drainFor,
  yoinkCostAt,
  type GameState,
  type King,
  type LeaderboardEntry,
  type YoinkEvent,
} from "@/lib/types";
import { ROOMS, type RoomId } from "@/lib/rooms";
import { randomPoolWallet } from "@/lib/wallets";

let kingCounter = 0;
const nextId = () => `king-${Date.now()}-${kingCounter++}`;

function seedRecentKings(): King[] {
  return Array.from({ length: 6 }, () => ({
    wallet:  randomPoolWallet(),
    heldFor: Math.floor(2 + Math.random() * 24),
    isYou:   false,
    id:      nextId(),
  }));
}

function seedLeaderboard(): LeaderboardEntry[] {
  const now  = Date.now();
  const rows: Omit<LeaderboardEntry, "rank">[] = Array.from({ length: 11 }, (_, i) => ({
    wallet:  randomPoolWallet(),
    solWon:  +(3 + Math.random() * 47).toFixed(3),
    dateWon: new Date(now - i * 86_400_000 * (1 + Math.random())).toISOString(),
    round:   1820 - i * 7 - Math.floor(Math.random() * 5),
    isYou:   false,
  }));
  rows.sort((a, b) => b.solWon - a.solWon);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Build a fresh GameState initialised for the given room. */
function makeInitial(roomId: RoomId): GameState {
  const room = ROOMS[roomId];
  return {
    bagAmount:           room.startingBag,
    countdown:           room.roundSeconds,
    currentKing:         randomPoolWallet(),
    kingIsYou:           false,
    kingHeldFor:         0,
    recentKings:         seedRecentKings(),
    yoinkHistory:        [],
    roundNumber:         1847,
    isRoundOver:         false,
    winner:              null,
    winnerIsYou:         false,
    yoinkCount:          0,
    currentCost:         room.baseCost,
    biggestBag:          128.4,
    totalDistributed:    9421.62,
    playerCount:         0,
    playerCooldownUntil: 0,
    isWaiting:           true,
    totalDrained:        0,
    roundDrained:        0,
  };
}

export function useGameState(roomId: RoomId = "arena") {
  const room = ROOMS[roomId];

  const [state, setState]           = useState<GameState>(() => makeInitial(roomId));
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(seedLeaderboard);

  // Re-initialise when the player switches rooms
  const prevRoomId = useRef(roomId);
  useEffect(() => {
    if (roomId === prevRoomId.current) return;
    prevRoomId.current = roomId;
    setState(makeInitial(roomId));
    setLeaderboard(seedLeaderboard());
    heldTickRef.current = 0;
    botCooldowns.current.clear();
  }, [roomId]);

  const stateRef      = useRef(state);
  stateRef.current    = state;
  const tickRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const heldTickRef   = useRef(0);
  const botCooldowns  = useRef<Map<string, number>>(new Map());

  // ── Room-aware cost helper ─────────────────────────────────────────────────
  const roomYoinkCost = useCallback(
    (count: number) => {
      const raw = room.baseCost + count * room.costStep;
      return +Math.min(raw, room.maxCost).toFixed(3);
    },
    [room],
  );

  const applyYoink = useCallback(
    (byPlayer: boolean) => {
      const now = Date.now();
      setState((prev) => {
        if (prev.isRoundOver || prev.isWaiting) return prev;

        const cost      = prev.currentCost;
        const nextCount = prev.yoinkCount + 1;
        const nextCost  = roomYoinkCost(nextCount);

        const bagAdd = bagAddFor(cost);
        const drain  = drainFor(prev.bagAmount);
        const netBag = +(prev.bagAmount + bagAdd - drain).toFixed(6);

        const fallen: King = {
          wallet:  prev.currentKing,
          heldFor: prev.kingHeldFor,
          isYou:   prev.kingIsYou,
          id:      nextId(),
        };

        const newKing = byPlayer ? "You" : randomPoolWallet(prev.currentKing);

        const event: YoinkEvent = {
          id:          nextId(),
          wallet:      newKing,
          isYou:       byPlayer,
          cost,
          bagAfter:    netBag,
          drainAmount: drain,
          ts:          now,
        };

        return {
          ...prev,
          bagAmount:           netBag,
          countdown:           room.roundSeconds,
          currentKing:         newKing,
          kingIsYou:           byPlayer,
          kingHeldFor:         0,
          recentKings:         [fallen, ...prev.recentKings].slice(0, 10),
          yoinkHistory:        [event, ...prev.yoinkHistory].slice(0, 50),
          yoinkCount:          nextCount,
          currentCost:         nextCost,
          totalDrained:        +(prev.totalDrained + drain).toFixed(6),
          roundDrained:        +(prev.roundDrained + drain).toFixed(6),
          playerCooldownUntil: byPlayer
            ? now + GAME_CONFIG.PLAYER_COOLDOWN_MS
            : prev.playerCooldownUntil,
        };
      });
      heldTickRef.current = 0;
    },
    [room, roomYoinkCost],
  );

  const yoink = useCallback(() => {
    const s = stateRef.current;
    if (s.isRoundOver || s.isWaiting || s.kingIsYou) return;
    if (Date.now() < s.playerCooldownUntil) return;
    applyYoink(true);
  }, [applyYoink]);

  const playAgain = useCallback(() => {
    setState((prev) => ({
      ...makeInitial(roomId),
      roundNumber:      prev.roundNumber + 1,
      recentKings:      prev.recentKings,
      biggestBag:       prev.biggestBag,
      totalDistributed: prev.totalDistributed,
      totalDrained:     prev.totalDrained,
      roundDrained:     0,
      playerCount:      prev.playerCount,
      currentKing:      randomPoolWallet(),
      bagAmount:        +(room.startingBag + Math.random() * room.startingBag * 0.75).toFixed(3),
      isWaiting:        false,
    }));
    heldTickRef.current = 0;
    botCooldowns.current.clear();
  }, [roomId, room]);

  // ── Core tick ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // Restart interval whenever room changes
    if (tickRef.current) clearInterval(tickRef.current);

    tickRef.current = setInterval(() => {
      const now = Date.now();

      setState((prev) => {
        if (prev.isWaiting) {
          return prev.playerCount >= GAME_CONFIG.MIN_PLAYERS
            ? { ...prev, isWaiting: false }
            : prev;
        }
        if (prev.isRoundOver) return prev;

        const nextCountdown = +(prev.countdown - GAME_CONFIG.TICK_MS / 1000).toFixed(2);

        if (nextCountdown <= 0) {
          const won = +prev.bagAmount.toFixed(3);
          const entry: LeaderboardEntry = {
            rank:    0,
            wallet:  prev.kingIsYou ? "You" : prev.currentKing,
            solWon:  won,
            dateWon: new Date().toISOString(),
            round:   prev.roundNumber,
            isYou:   prev.kingIsYou,
          };
          setLeaderboard((lb) => {
            const merged = [...lb, entry].sort((a, b) => b.solWon - a.solWon);
            return merged.map((r, i) => ({ ...r, rank: i + 1 })).slice(0, 50);
          });
          return {
            ...prev,
            countdown:        0,
            isRoundOver:      true,
            winner:           prev.kingIsYou ? "You" : prev.currentKing,
            winnerIsYou:      prev.kingIsYou,
            biggestBag:       Math.max(prev.biggestBag, won),
            totalDistributed: +(prev.totalDistributed + won).toFixed(2),
          };
        }

        heldTickRef.current += 1;
        const heldFor =
          heldTickRef.current >= 10
            ? ((heldTickRef.current = 0), prev.kingHeldFor + 1)
            : prev.kingHeldFor;

        const drift   = Math.random();
        let players   = prev.playerCount;
        if (drift > 0.94) players = Math.min(players + 1, room.maxPlayers);
        else if (drift < 0.04 && players > GAME_CONFIG.MIN_PLAYERS + 2) players -= 1;

        return { ...prev, countdown: nextCountdown, kingHeldFor: heldFor, playerCount: players };
      });

      // ── Bot logic — scales with room's cost/tension ──────────────────────
      const s = stateRef.current;
      if (!s.isRoundOver && !s.isWaiting) {
        const frac = s.countdown / room.roundSeconds;
        let chance = 0.010;
        if (frac < 0.60) chance = 0.022;
        if (frac < 0.35) chance = 0.045;
        if (frac < 0.18) chance = 0.080;
        if (frac < 0.10) chance = 0.120;
        // King's Court bots are more aggressive
        if (roomId === "court") chance *= 1.5;
        if (roomId === "pit")   chance *= 1.3;
        if (s.kingIsYou && frac < 0.10) chance = 0.050;

        if (Math.random() < chance) {
          const botWallet = randomPoolWallet(s.currentKing);
          const lastYoink = botCooldowns.current.get(botWallet) ?? 0;
          const jitter    = frac < 0.17
            ? Math.random() * GAME_CONFIG.BOT_SNIPE_JITTER_MS
            : 0;

          if (now - lastYoink > GAME_CONFIG.PLAYER_COOLDOWN_MS + jitter) {
            botCooldowns.current.set(botWallet, now);
            setTimeout(() => applyYoink(false), jitter);
          }
        }
      }
    }, GAME_CONFIG.TICK_MS);

    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [applyYoink, room, roomId]);

  // ── Seed player count → triggers lobby exit ────────────────────────────────
  useEffect(() => {
    let count = 0;
    const interval = setInterval(() => {
      count += Math.floor(1 + Math.random() * 3);
      const [, max] = [GAME_CONFIG.MIN_PLAYERS, room.maxPlayers];
      setState((p) => ({
        ...p,
        playerCount: Math.min(count, Math.floor(max * 0.6 + Math.random() * max * 0.3)),
      }));
      if (count >= GAME_CONFIG.MIN_PLAYERS + 2) clearInterval(interval);
    }, 600);
    return () => clearInterval(interval);
  }, [roomId, room.maxPlayers]);

  // ── Cooldown timer for UI ──────────────────────────────────────────────────
  const [cooldownLeft, setCooldownLeft] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setCooldownLeft(Math.max(0, stateRef.current.playerCooldownUntil - Date.now()));
    }, 100);
    return () => clearInterval(id);
  }, []);

  return { state, leaderboard, yoink, playAgain, cooldownLeft };
}
