import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Header, type Page } from "@/components/layout/Header";
import { LiveTicker } from "@/components/layout/LiveTicker";
import { Footer } from "@/components/layout/Footer";
import { SceneBackground } from "@/components/ui/SceneBackground";
import { ConnectScreen } from "@/components/ui/ConnectScreen";
import { GameScreen } from "@/components/game/GameScreen";
import { RoomSelectScreen } from "@/components/game/RoomSelectScreen";
import { Leaderboard } from "@/components/leaderboard/Leaderboard";
import { ShopScreen } from "@/components/shop/ShopScreen";
import { BidWarsScreen } from "@/components/bidwars/BidWarsScreen";
import { WinReveal } from "@/components/reveal/WinReveal";
import { LevelUpToast } from "@/components/ui/XPBar";
import { useGameState } from "@/hooks/useGameState";
import { usePlayerProgress } from "@/hooks/usePlayerProgress";
import { useRoomInstances } from "@/hooks/useRoomInstances";
import { useWallet } from "@/lib/wallet";
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
  const { connected }                   = useWallet();
  const [page, setPage]                 = useState<Page>("game");
  const [roomId, setRoomId]             = useState<RoomId | null>(null);
  const [instanceKey, setInstanceKey]   = useState<string | null>(null);

  // Rolling instance manager — runs in background regardless of current page
  const { syncInstance } = useRoomInstances();

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

  const dangerActive  = state.roundFeeMultiplier > 1.8 && !state.isRoundOver && !state.isWaiting;
  const prevKingRef   = useRef(state.currentKing);
  const prevRoundRef  = useRef(state.roundNumber);
  const prevHeldRef   = useRef(state.kingHeldFor);
  const prevCdRef     = useRef(cooldownLeft);
  const wasRoundOver  = useRef(state.isRoundOver);

  // ── Sync live bag + player count back to instance manager ─────────────────
  useEffect(() => {
    if (!instanceKey) return;
    syncInstance(instanceKey, {
      bagAmount:   state.bagAmount,
      roundNumber: state.roundNumber,
      playerCount: state.playerCount,
    });
  }, [instanceKey, state.bagAmount, state.roundNumber, state.playerCount, syncInstance]);

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

  // ── Sound: tick at ≤10s ───────────────────────────────────────────────────
  useEffect(() => {
    if (state.isWaiting || state.isRoundOver) return;
    const secs = Math.ceil(state.countdown);
    if (secs <= 10 && secs !== Math.ceil(state.countdown + 0.1)) {
      playTick(state.countdown <= 5);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.ceil(state.countdown), state.isWaiting, state.isRoundOver]);

  // ── Sound + XP: cooldown block ────────────────────────────────────────────
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

  // ── XP: award on each YOINK ───────────────────────────────────────────────
  const prevYoinkCount = useRef(state.yoinkCount);
  useEffect(() => {
    if (state.yoinkCount > prevYoinkCount.current) {
      prevYoinkCount.current = state.yoinkCount;
      if (state.kingIsYou) xpOnYoink();
    }
  }, [state.yoinkCount, state.kingIsYou, xpOnYoink]);

  // ── Shop purchase ─────────────────────────────────────────────────────────
  function handleBuy(item: ShopItem) {
    purchaseItem(item.id, item.priceXp);
  }

  // ── Reset refs on new round ───────────────────────────────────────────────
  useEffect(() => {
    if (state.roundNumber !== prevRoundRef.current) {
      prevRoundRef.current   = state.roundNumber;
      prevHeldRef.current    = 0;
      prevYoinkCount.current = 0;
    }
  }, [state.roundNumber]);

  // ── Navigation ────────────────────────────────────────────────────────────
  function handleNavigate(p: Page) {
    setPage(p);
    if (p !== "game") {
      setRoomId(null);
      setInstanceKey(null);
    }
  }

  function handleRoomSelect(id: RoomId, key: string) {
    setRoomId(id);
    setInstanceKey(key);
  }

  function handleLeaveRoom() {
    setRoomId(null);
    setInstanceKey(null);
  }

  const showRoomSelect = page === "game" && roomId === null;
  const showGame       = page === "game" && roomId !== null;
  const currentRoom    = roomId ? ROOMS[roomId] : null;

  // Instance badge for header: "The Pit #2" if player is in a non-#1 instance
  const currentInstanceIndex = instanceKey
    ? parseInt(instanceKey.split("-")[1] ?? "1", 10)
    : 1;
  const instanceLabel = currentInstanceIndex > 1
    ? `${currentRoom?.name ?? ""} #${currentInstanceIndex}`
    : null;

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <SceneBackground danger={dangerActive} />

      <AnimatePresence mode="wait">
        {!connected ? (
          <motion.div
            key="connect"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative z-20"
          >
            <ConnectScreen />
          </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="flex min-h-dvh flex-col"
          >
            <Header
              page={page}
              onNavigate={handleNavigate}
              progress={progress}
              currentRoom={currentRoom}
              onLeaveRoom={handleLeaveRoom}
              isKing={state.kingIsYou}
              instanceLabel={instanceLabel}
            />
            <LiveTicker recentKings={state.recentKings} currentKing={state.currentKing} />

            <main className="relative z-10 flex flex-1 flex-col">
              <AnimatePresence mode="wait">

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

                {showGame && (
                  <motion.div
                    key={`game-${roomId}-${instanceKey}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <GameScreen
                      state={state}
                      onYoink={yoink}
                      cooldownLeft={cooldownLeft}
                      roomId={roomId ?? "arena"}
                      ownedItems={raw.ownedItems}
                      pumpFakeBalance={raw.pumpFakeBalance ?? null}
                      onActivateWalletTracker={() => purchaseItem("wallet_tracker")}
                    />
                  </motion.div>
                )}

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

            <WinReveal
              open={state.isRoundOver}
              winner={state.winner}
              isYou={state.winnerIsYou}
              amount={state.bagAmount}
              round={state.roundNumber}
              winnerHeldFor={state.kingHeldFor}
              fallenKings={state.recentKings}
              fuseSeconds={state.fuseSeconds}
              onPlayAgain={playAgain}
            />

            <LevelUpToast events={levelUpEvents} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
