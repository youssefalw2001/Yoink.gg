import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Header, type Page } from "@/components/layout/Header";
import { LiveTicker } from "@/components/layout/LiveTicker";
import { Footer } from "@/components/layout/Footer";
import { SceneBackground } from "@/components/ui/SceneBackground";
import { GameScreen } from "@/components/game/GameScreen";
import { RoomSelectScreen } from "@/components/game/RoomSelectScreen";
import { Leaderboard } from "@/components/leaderboard/Leaderboard";
import { ShopScreen } from "@/components/shop/ShopScreen";
import { BidWarsScreen } from "@/components/bidwars/BidWarsScreen";
import { WinReveal } from "@/components/reveal/WinReveal";
import { LevelUpToast } from "@/components/ui/XPBar";
import { useGameState } from "@/hooks/useGameState";
import { usePlayerProgress } from "@/hooks/usePlayerProgress";
import { ROOMS, type RoomId } from "@/lib/rooms";
import type { ShopItem } from "@/lib/shopItems";
import {
  playYoink,
  playCrown,
  playWin,
  playTick,
  playCooldownBlock,
} from "@/lib/sounds";

export default function App() {
  const [page,   setPage]   = useState<Page>("game");
  // null = room select screen is showing
  const [roomId, setRoomId] = useState<RoomId | null>(null);

  const { state, leaderboard, yoink, playAgain, cooldownLeft } = useGameState(
    roomId ?? "arena",
  );

  const {
    progress,
    raw,
    levelUpEvents,
    onYoink:      xpOnYoink,
    onHoldSecond: xpOnHold,
    onWin:        xpOnWin,
    onRoundEnd,
    purchaseItem,
  } = usePlayerProgress();

  const dangerActive  = state.countdown <= 3 && !state.isRoundOver && !state.isWaiting;
  const prevKingRef   = useRef(state.currentKing);
  const prevRoundRef  = useRef(state.roundNumber);
  const prevHeldRef   = useRef(state.kingHeldFor);
  const prevCdRef     = useRef(cooldownLeft);
  const wasRoundOver  = useRef(state.isRoundOver);

  // ── Sound: YOINK whenever king changes ────────────────────────────────────
  useEffect(() => {
    if (state.isWaiting) return;
    if (state.currentKing !== prevKingRef.current) {
      prevKingRef.current = state.currentKing;
      playYoink();
    }
  }, [state.currentKing, state.isWaiting]);

  // ── Sound + XP: player becomes king ───────────────────────────────────────
  useEffect(() => {
    if (state.kingIsYou && !state.isWaiting && !state.isRoundOver) {
      playCrown();
    }
  }, [state.kingIsYou, state.isWaiting, state.isRoundOver]);

  // ── Sound: countdown tick at ≤10s ─────────────────────────────────────────
  useEffect(() => {
    if (state.isWaiting || state.isRoundOver) return;
    const secs = Math.ceil(state.countdown);
    if (secs <= 10 && secs !== Math.ceil(state.countdown + 0.1)) {
      playTick(state.countdown <= 5);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.ceil(state.countdown), state.isWaiting, state.isRoundOver]);

  // ── Sound + XP: cooldown block click ──────────────────────────────────────
  useEffect(() => {
    if (cooldownLeft > 0 && prevCdRef.current === 0) {
      playCooldownBlock();
    }
    prevCdRef.current = cooldownLeft;
  }, [cooldownLeft]);

  // ── XP: hold-second callbacks ─────────────────────────────────────────────
  useEffect(() => {
    if (!state.kingIsYou || state.isWaiting || state.isRoundOver) return;
    if (state.kingHeldFor > prevHeldRef.current) {
      xpOnHold(state.kingHeldFor);
    }
    prevHeldRef.current = state.kingHeldFor;
  }, [state.kingHeldFor, state.kingIsYou, state.isWaiting, state.isRoundOver, xpOnHold]);

  // ── Sound + XP: round over ────────────────────────────────────────────────
  useEffect(() => {
    if (state.isRoundOver && !wasRoundOver.current) {
      wasRoundOver.current = true;
      if (state.winnerIsYou) {
        playWin();
        xpOnWin(state.bagAmount);
      }
      onRoundEnd();
    }
    if (!state.isRoundOver) wasRoundOver.current = false;
  }, [state.isRoundOver, state.winnerIsYou, state.bagAmount, xpOnWin, onRoundEnd]);

  // ── XP: award on each YOINK the player makes ──────────────────────────────
  const prevYoinkCount = useRef(state.yoinkCount);
  useEffect(() => {
    if (state.yoinkCount > prevYoinkCount.current) {
      prevYoinkCount.current = state.yoinkCount;
      if (state.kingIsYou) xpOnYoink();
    }
  }, [state.yoinkCount, state.kingIsYou, xpOnYoink]);

  // ── Shop purchase handler ──────────────────────────────────────────────────
  function handleBuy(item: ShopItem) {
    purchaseItem(item.id);
  }

  // ── Reset refs on new round ────────────────────────────────────────────────
  useEffect(() => {
    if (state.roundNumber !== prevRoundRef.current) {
      prevRoundRef.current   = state.roundNumber;
      prevHeldRef.current    = 0;
      prevYoinkCount.current = 0;
    }
  }, [state.roundNumber]);

  // ── Navigate away from game → back to room select ─────────────────────────
  function handleNavigate(p: Page) {
    setPage(p);
    // Leaving game page clears the room so re-entry shows room select again
    if (p !== "game") setRoomId(null);
  }

  // When navigating back to "game" tab, always show room select first
  function handleRoomSelect(id: RoomId) {
    setRoomId(id);
  }

  const showRoomSelect = page === "game" && roomId === null;
  const showGame       = page === "game" && roomId !== null;
  const currentRoom    = roomId ? ROOMS[roomId] : null;

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <SceneBackground danger={dangerActive} />

      <Header
        page={page}
        onNavigate={handleNavigate}
        progress={progress}
        currentRoom={currentRoom}
        onLeaveRoom={() => setRoomId(null)}
      />
      <LiveTicker recentKings={state.recentKings} currentKing={state.currentKing} />

      <main className="relative z-10 flex flex-1 flex-col">
        <AnimatePresence mode="wait">

          {/* ── Room Select ─────────────────────────────────────────────── */}
          {showRoomSelect && (
            <motion.div
              key="room-select"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <RoomSelectScreen onSelect={handleRoomSelect} />
            </motion.div>
          )}

          {/* ── Game ────────────────────────────────────────────────────── */}
          {showGame && (
            <motion.div
              key={`game-${roomId}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <GameScreen
                state={state}
                onYoink={yoink}
                cooldownLeft={cooldownLeft}
              />
            </motion.div>
          )}

          {/* ── Bid Wars ────────────────────────────────────────────────── */}
          {page === "bidwars" && (
            <motion.div
              key="bidwars"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <BidWarsScreen progress={progress} />
            </motion.div>
          )}

          {/* ── Leaderboard ─────────────────────────────────────────────── */}
          {page === "leaderboard" && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="px-4 py-10 sm:px-6"
            >
              <Leaderboard
                entries={leaderboard}
                bagAmount={state.bagAmount}
                playerCount={state.playerCount}
                roundNumber={state.roundNumber}
              />
            </motion.div>
          )}

          {/* ── Shop ────────────────────────────────────────────────────── */}
          {page === "shop" && (
            <motion.div
              key="shop"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <ShopScreen
                progress={progress}
                ownedItems={raw.ownedItems}
                onBuy={handleBuy}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <Footer />

      {/* Win reveal modal */}
      <WinReveal
        open={state.isRoundOver}
        winner={state.winner}
        isYou={state.winnerIsYou}
        amount={state.bagAmount}
        round={state.roundNumber}
        onPlayAgain={playAgain}
      />

      {/* Level-up toasts */}
      <LevelUpToast events={levelUpEvents} />
    </div>
  );
}
