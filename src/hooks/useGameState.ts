import { useCallback, useEffect, useRef, useState } from "react";
import {
  GAME_CONFIG,
  FUSE_CONFIG,
  drainFor,
  drawFuseSeconds,
  computeYoinkCost,
  type GameState,
  type King,
  type LeaderboardEntry,
  type YoinkEvent,
} from "@/lib/types";
import { ROOMS, type RoomId } from "@/lib/rooms";
import { randomPoolWallet } from "@/lib/wallets";
import { commitFuse } from "@/lib/vrf";
import { computePayouts } from "@/lib/payouts";
import { accrueReignToll } from "@/lib/reignToll";
import {
  loadJackpot,
  saveJackpot,
  rollJackpotDrop,
  reseedJackpot,
  pickJackpotWinner,
  type JackpotParticipant,
} from "@/lib/jackpot";

let kingCounter = 0;
const nextId = () => `king-${Date.now()}-${kingCounter++}`;

/**
 * Lifetime Reign Tolls persistence — mirrors the `jackpot.ts` localStorage
 * pattern (key + try/catch for private-mode safety). When storage is
 * unavailable the total runs in memory for the session via `memoryTolls`,
 * so the game never crashes (Req 10.4).
 */
const TOLLS_KEY = "yoink_tolls_v1";
let memoryTolls = 0;

function loadTolls(): number {
  try {
    const raw = localStorage.getItem(TOLLS_KEY);
    if (raw) {
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n >= 0) {
        memoryTolls = n;
        return n;
      }
    }
  } catch { /* private mode / disabled storage */ }
  return memoryTolls;
}

function saveTolls(amount: number): void {
  memoryTolls = amount;
  try {
    localStorage.setItem(TOLLS_KEY, amount.toFixed(6));
  } catch { /* ignore */ }
}

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

function makeInitial(roomId: RoomId): GameState {
  const room        = ROOMS[roomId];
  const fuseSeconds = drawFuseSeconds(room.roundSeconds);
  return {
    bagAmount:           room.startingBag,
    countdown:           fuseSeconds,
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
    temporalMultiplier:  1,
    roundFeeMultiplier:  1,
    fuseSeconds,
    fuseBurnerActive:    false,
    fuseCommitHash:      "pending…",
    fusePreimage:        "",
    biggestBag:          128.4,
    totalDistributed:    9421.62,
    playerCount:         0,
    playerCooldownUntil: 0,
    isWaiting:           true,
    totalDrained:        0,
    roundDrained:        0,
    roundKings:          [],
    jackpotAmount:       loadJackpot(),
    jackpotResult:       null,
    payouts:             [],
    roundTollsBanked:    0,
  };
}

export function useGameState(roomId: RoomId = "arena") {
  const room = ROOMS[roomId];

  const [state, setState]           = useState<GameState>(() => makeInitial(roomId));
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(seedLeaderboard);

  // Lifetime Reign Tolls — read once on mount (Req 10.3), accumulated across
  // the session and persisted on every local-player dethrone + on unmount.
  const [lifetimeTolls, setLifetimeTolls] = useState<number>(() => loadTolls());
  const lifetimeTollsRef = useRef(lifetimeTolls);

  const prevRoomId = useRef(roomId);
  useEffect(() => {
    if (roomId === prevRoomId.current) return;
    prevRoomId.current = roomId;
    setState(makeInitial(roomId));
    setLeaderboard(seedLeaderboard());
    heldTickRef.current = 0;
    botCooldowns.current.clear();
  }, [roomId]);

  const stateRef     = useRef(state);
  stateRef.current   = state;
  const tickRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const heldTickRef  = useRef(0);
  const botCooldowns = useRef<Map<string, number>>(new Map());

  const applyYoink = useCallback(
    (byPlayer: boolean) => {
      const now = Date.now();
      setState((prev) => {
        if (prev.isRoundOver || prev.isWaiting) return prev;

        const cost         = prev.currentCost;
        const nextCount    = prev.yoinkCount + 1;
        // Escalating fee: each yoink adds FEE_STEP to the multiplier, capped per room
        const roomFeeCap = FUSE_CONFIG.FEE_MAX_MULT_BY_ROOM[roomId] ?? FUSE_CONFIG.FEE_MAX_MULT;
        const nextFeeMult  = +Math.min(
          prev.roundFeeMultiplier + FUSE_CONFIG.FEE_STEP,
          roomFeeCap,
        ).toFixed(3);
        const nextCost     = computeYoinkCost(
          room.baseCost, room.costStep, room.maxCost, nextCount, nextFeeMult,
        );

        // ── Reign Toll settlement (pure) — credit the OUTGOING King a toll
        //    slice of this fee, banked instantly and kept regardless of the
        //    fuse outcome. Only `toBag` flows into the bag (drain unchanged).
        const priorWalletTolls =
          prev.roundKings.find((k) => k.wallet === prev.currentKing)?.tollsBanked ?? 0;
        const accrual = accrueReignToll({
          cost,
          roomId,
          dethronedIsYou:        prev.kingIsYou,
          priorWalletTolls,
          priorRoundTollsBanked: prev.roundTollsBanked,
        });

        const drain  = drainFor(prev.bagAmount);
        const netBag = +(prev.bagAmount + accrual.toBag - drain).toFixed(6);

        const fallen: King = {
          wallet:      prev.currentKing,
          heldFor:     prev.kingHeldFor,
          isYou:       prev.kingIsYou,
          id:          nextId(),
          tollsBanked: accrual.fallenTollsBanked,
        };

        const newKing  = byPlayer ? "You" : randomPoolWallet(prev.currentKing);
        // Hidden fuse: draw a new end time when the clock resets on yoink
        const newFuse  = drawFuseSeconds(room.roundSeconds);

        const event: YoinkEvent = {
          id:          nextId(),
          wallet:      newKing,
          isYou:       byPlayer,
          cost,
          bagAfter:    netBag,
          drainAmount: drain,
          ts:          now,
          tollPaid:    accrual.tollPaid,
        };

        // 5% of every yoink feeds the shared progressive jackpot (the same
        // JACKPOT_BPS reserve that was always carved off — now it's a live prize)
        const jackpotAdd = +(cost * (GAME_CONFIG.JACKPOT_BPS / 10_000)).toFixed(6);

        return {
          ...prev,
          bagAmount:           netBag,
          countdown:           newFuse,  // reset to a NEW random fuse duration
          currentKing:         newKing,
          kingIsYou:           byPlayer,
          kingHeldFor:         0,
          recentKings:         [fallen, ...prev.recentKings].slice(0, 10),
          roundKings:          [fallen, ...prev.roundKings].slice(0, 40),
          yoinkHistory:        [event, ...prev.yoinkHistory].slice(0, 50),
          yoinkCount:          nextCount,
          currentCost:         nextCost,
          roundFeeMultiplier:  nextFeeMult,
          fuseSeconds:         newFuse,
          fuseCommitHash:      "generating…",
          fusePreimage:        "",
          jackpotAmount:       +(prev.jackpotAmount + jackpotAdd).toFixed(6),
          totalDrained:        +(prev.totalDrained + drain).toFixed(6),
          roundDrained:        +(prev.roundDrained + drain).toFixed(6),
          roundTollsBanked:    accrual.roundTollsBanked,
          playerCooldownUntil: byPlayer
            ? now + GAME_CONFIG.PLAYER_COOLDOWN_MS
            : prev.playerCooldownUntil,
        };
      });

      // Lifetime Reign Tolls — when the LOCAL player is the King being
      // dethroned, accrue + persist their banked toll (Req 10.2). Computed from
      // the same snapshot the state updater used. Free yoinks bank nothing.
      const snap = stateRef.current;
      if (!snap.isRoundOver && !snap.isWaiting && snap.kingIsYou) {
        const priorWalletTolls =
          snap.roundKings.find((k) => k.wallet === snap.currentKing)?.tollsBanked ?? 0;
        const a = accrueReignToll({
          cost:                  snap.currentCost,
          roomId,
          dethronedIsYou:        true,
          priorWalletTolls,
          priorRoundTollsBanked: snap.roundTollsBanked,
        });
        if (a.toll > 0) {
          const next = +(lifetimeTollsRef.current + a.toll).toFixed(6);
          lifetimeTollsRef.current = next;
          setLifetimeTolls(next);
          saveTolls(next);
        }
      }

      heldTickRef.current = 0;
    },
    [room, roomId],
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
      roundTollsBanked: 0,
    }));
    heldTickRef.current = 0;
    botCooldowns.current.clear();
  }, [roomId, room]);

  // ── Core tick — 150ms (was 100ms, 33% fewer renders, still smooth) ──────────
  useEffect(() => {
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

        // Apply Fuse Burner multiplier — 2× faster depletion when active
        const tickSeconds = (GAME_CONFIG.TICK_MS / 1000) * (prev.fuseBurnerActive ? FUSE_CONFIG.BURNER_MULT : 1);
        const nextCountdown = +(prev.countdown - tickSeconds).toFixed(2);

        if (nextCountdown <= 0) {
          const won = +prev.bagAmount.toFixed(3);
          const winnerWallet = prev.kingIsYou ? "You" : prev.currentKing;

          // ── Payout split — King + runner-up + podium + held-time pool ──────
          const payouts = computePayouts(
            won,
            { wallet: winnerWallet, isYou: prev.kingIsYou, heldFor: prev.kingHeldFor },
            prev.roundKings,
            roomId,
          );
          const kingCut = payouts[0]?.amount ?? won;

          // ── Progressive jackpot — roll for a drop, weighted by activity ────
          const counts = new Map<string, { isYou: boolean; weight: number }>();
          prev.yoinkHistory.forEach((e) => {
            const c = counts.get(e.wallet) ?? { isYou: e.isYou, weight: 0 };
            c.weight += 1;
            counts.set(e.wallet, c);
          });
          const participants: JackpotParticipant[] = Array.from(counts.entries())
            .map(([wallet, v]) => ({ wallet, isYou: v.isYou, weight: v.weight }));

          let jackpotResult = null as GameState["jackpotResult"];
          let nextJackpot = prev.jackpotAmount;
          if (rollJackpotDrop(prev.jackpotAmount)) {
            const jpWinner = pickJackpotWinner(participants);
            if (jpWinner) {
              jackpotResult = {
                amount:      +prev.jackpotAmount.toFixed(3),
                winner:      jpWinner.wallet,
                winnerIsYou: jpWinner.isYou,
              };
              nextJackpot = reseedJackpot();
            }
          }
          saveJackpot(nextJackpot);

          const entry: LeaderboardEntry = {
            rank:    0,
            wallet:  winnerWallet,
            solWon:  kingCut,
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
            winner:           winnerWallet,
            winnerIsYou:      prev.kingIsYou,
            biggestBag:       Math.max(prev.biggestBag, won),
            totalDistributed: +(prev.totalDistributed + won).toFixed(2),
            payouts,
            jackpotResult,
            jackpotAmount:    +nextJackpot.toFixed(6),
          };
        }

        heldTickRef.current += 1;
        const heldFor =
          heldTickRef.current >= 10
            ? ((heldTickRef.current = 0), prev.kingHeldFor + 1)
            : prev.kingHeldFor;

        const drift  = Math.random();
        let players  = prev.playerCount;
        if (drift > 0.94) players = Math.min(players + 1, room.maxPlayers);
        else if (drift < 0.04 && players > GAME_CONFIG.MIN_PLAYERS + 2) players -= 1;

        // Passive jackpot drift — simulates global yoink activity across all
        // rooms so the headline number is always climbing (the dopamine hook).
        const jackpotDrift = +(Math.random() * 0.025).toFixed(4);

        return {
          ...prev,
          countdown:     nextCountdown,
          kingHeldFor:   heldFor,
          playerCount:   players,
          jackpotAmount: +(prev.jackpotAmount + jackpotDrift).toFixed(4),
        };
      });

      // ── Bot logic ──────────────────────────────────────────────────────────
      // Bots don't know the fuse end time either — they use a probability curve
      // based on elapsed time fraction, not an exact countdown.
      const s   = stateRef.current;
      const elapsed = (s.fuseSeconds - s.countdown) / s.fuseSeconds;
      if (!s.isRoundOver && !s.isWaiting) {
        let chance = 0.012;
        if (elapsed > 0.3)  chance = 0.022;
        if (elapsed > 0.5)  chance = 0.038;
        if (elapsed > 0.7)  chance = 0.055;
        if (elapsed > 0.85) chance = 0.080;
        if (roomId === "court") chance *= 1.5;
        if (roomId === "pit")   chance *= 1.3;
        // Bots are also cost-sensitive — escalating fee reduces activity
        if (s.roundFeeMultiplier > 1.5) chance *= 0.6;
        if (s.kingIsYou && elapsed > 0.85) chance = 0.045;

        if (Math.random() < chance) {
          const botWallet = randomPoolWallet(s.currentKing);
          const lastYoink = botCooldowns.current.get(botWallet) ?? 0;
          const jitter    = elapsed > 0.8
            ? Math.random() * GAME_CONFIG.BOT_SNIPE_JITTER_MS
            : 0;

          if (now - lastYoink > GAME_CONFIG.PLAYER_COOLDOWN_MS + jitter) {
            botCooldowns.current.set(botWallet, now);
            setTimeout(() => applyYoink(false), jitter);
          }
        }
      }
    }, 150);  // 150ms tick — was 100ms, 33% fewer renders, imperceptible difference

    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [applyYoink, room, roomId]);

  // ── Seed player count ──────────────────────────────────────────────────────
  useEffect(() => {
    let count = 0;
    const interval = setInterval(() => {
      count += Math.floor(1 + Math.random() * 3);
      setState((p) => ({
        ...p,
        playerCount: Math.min(
          count,
          Math.floor(room.maxPlayers * 0.6 + Math.random() * room.maxPlayers * 0.3),
        ),
      }));
      if (count >= GAME_CONFIG.MIN_PLAYERS + 2) clearInterval(interval);
    }, 600);
    return () => clearInterval(interval);
  }, [roomId, room.maxPlayers]);

  // ── Cooldown timer — 250ms resolution (was 100ms, smooth enough) ────────────
  const [cooldownLeft, setCooldownLeft] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setCooldownLeft(Math.max(0, stateRef.current.playerCooldownUntil - Date.now()));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ── Persist the progressive jackpot periodically + on unmount, so the
  //    pool survives room switches and reloads (the always-climbing number).
  useEffect(() => {
    const id = setInterval(() => saveJackpot(stateRef.current.jackpotAmount), 4_000);
    return () => {
      clearInterval(id);
      saveJackpot(stateRef.current.jackpotAmount);
      saveTolls(lifetimeTollsRef.current);
    };
  }, []);

  const activateFuseBurner = useCallback(() => {
    setState((prev) => {
      if (prev.fuseBurnerActive || prev.isRoundOver || prev.isWaiting) return prev;
      return { ...prev, fuseBurnerActive: true };
    });
  }, []);

  // ── Fuse commitment (commit–reveal) ──────────────────────────────────────
  // Publish a SHA-256 commitment of the ACTUAL current fuse whenever it is
  // (re)drawn — round start and every yoink. The preimage is revealed at round
  // end so the commit can be verified (see lib/vrf.ts). This is an honest
  // commit–reveal, NOT trustless VRF — that requires the on-chain program.
  useEffect(() => {
    let cancelled = false;
    commitFuse(stateRef.current.roundNumber, state.fuseSeconds)
      .then(({ commitHash, preimage }) => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, fuseCommitHash: commitHash, fusePreimage: preimage }));
        }
      })
      .catch(() => {/* non-critical */});
    return () => { cancelled = true; };
  }, [state.fuseSeconds, state.roundNumber]);

  return { state, leaderboard, yoink, playAgain, cooldownLeft, activateFuseBurner, lifetimeTolls };
}
