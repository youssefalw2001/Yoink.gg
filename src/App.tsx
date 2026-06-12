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
import { useFreeRound } from "@/hooks/useFreeRound";
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
  const { connected, publicKey }      = useWallet();
  const [page, setPage]               = useState<Page>("game");
  const [roomId, setRoomId]           = useState<RoomId | null>(null);
  const [instanceKey, setInstanceKey] = useState<string | null>(null);

  // ── Free Yoink System — pending state ─────────────────────────────────────
  /**
   * When true, the next time The Pit game goes live (isWaiting → false)
   * we auto-fire a free YOINK on the player's behalf.
   * Set when the player claims any of the three free-yoink layers.
   */
  const [pendingFreeYoink, setPendingFreeYoink] = useState(false);

  // Rolling instance manager — runs in background regardless of current page
  const { syncInstance, getInstancesForRoom } = useRoomInstances();

  const { state, leaderboard, yoink, playAgain, cooldownLeft, activateFuseBurner } = useGameState(
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
    setCardTheme,
    // Layer 1 — First Shot Free
    canClaimFirstShot,
    claimFirstShot,
    // Layer 2 — Daily Pit Pass
    canClaimDailyPitPass,
    claimDailyPitPass,
    // Daily voucher + referral
    canClaimLoginVoucher,
    claimLoginVoucher,
    generateReferralCode,
  } = usePlayerProgress();

  // Layer 3 — Free Round schedule
  const freeRound = useFreeRound();

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

  // ── Free Yoink: fire when Pit game goes live ───────────────────────────────
  /**
   * All three layers set pendingFreeYoink = true before entering The Pit.
   * This effect watches for the exact moment the game starts (isWaiting
   * flips to false) and fires the free yoink then.
   *
   * Pit-only guard: if somehow pendingFreeYoink is set but the player
   * ends up in another room, the pending state is silently cleared when
   * they leave, via handleLeaveRoom.
   */
  useEffect(() => {
    if (
      pendingFreeYoink &&
      roomId === "pit" &&
      !state.isWaiting &&
      !state.isRoundOver
    ) {
      setPendingFreeYoink(false);
      yoink();
    }
  }, [pendingFreeYoink, roomId, state.isWaiting, state.isRoundOver, yoink]);

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
    if (cooldownLeft > 0 && prevCdRef.current === 0) playCooldownBlock();
    prevCdRef.current = cooldownLeft;
  }, [cooldownLeft]);

  // ── XP: hold-second callbacks ─────────────────────────────────────────────
  useEffect(() => {
    if (!state.kingIsYou || state.isWaiting || state.isRoundOver) return;
    if (state.kingHeldFor > prevHeldRef.current) xpOnHold(state.kingHeldFor);
    prevHeldRef.current = state.kingHeldFor;
  }, [state.kingHeldFor, state.kingIsYou, state.isWaiting, state.isRoundOver, xpOnHold]);

  // ── Sound + XP: round over ────────────────────────────────────────────────
  useEffect(() => {
    if (state.isRoundOver && !wasRoundOver.current) {
      wasRoundOver.current = true;
      if (state.winnerIsYou) { playWin(); xpOnWin(state.bagAmount); }
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
    if (item.id === "theme_blood" || item.id === "theme_phantom" || item.id === "crown_animated") {
      setCardTheme(item.id);
    }
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
      setPendingFreeYoink(false); // clear pending if player navigates away
    }
  }

  function handleRoomSelect(id: RoomId, key: string) {
    setRoomId(id);
    setInstanceKey(key);
  }

  function handleLeaveRoom() {
    setRoomId(null);
    setInstanceKey(null);
    setPendingFreeYoink(false); // clear pending if they leave before game starts
  }

  // ── Free Yoink entry points ────────────────────────────────────────────────

  /** Shared helper: pick the best available Pit instance. */
  function getBestPitInstance(): string | null {
    const instances = getInstancesForRoom("pit");
    return (
      instances.find((i) => i.status !== "full")?.key ??
      instances[0]?.key ??
      null
    );
  }

  /**
   * LAYER 1 — First Shot Free.
   * Called from RoomSelectScreen when new player clicks "Claim First Shot".
   * Marks claim consumed immediately, routes to Pit, queues free yoink.
   */
  function handleClaimFirstShot() {
    claimFirstShot();
    const key = getBestPitInstance();
    if (key) {
      setPendingFreeYoink(true);
      handleRoomSelect("pit", key);
    }
  }

  /**
   * LAYER 2 — Daily Pit Pass (Rank 2+).
   * Called from RoomSelectScreen when eligible player enters The Pit.
   * Marks today's pass as used, routes to Pit, queues free yoink.
   */
  function handleClaimDailyPitPass(pitInstanceKey: string) {
    claimDailyPitPass();
    setPendingFreeYoink(true);
    handleRoomSelect("pit", pitInstanceKey);
  }

  /**
   * LAYER 3 — Free Round Event.
   * No individual claim to mark — the round is open to all.
   * Just queues the free yoink on entry.
   */
  function handleEnterFreeRound(pitInstanceKey: string) {
    setPendingFreeYoink(true);
    handleRoomSelect("pit", pitInstanceKey);
  }

  const showRoomSelect = page === "game" && roomId === null;
  const showGame       = page === "game" && roomId !== null;
  const currentRoom    = roomId ? ROOMS[roomId] : null;

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
            <LiveTicker
              recentKings={state.recentKings}
              currentKing={state.currentKing}
              freeRound={freeRound}
            />

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
                    <RoomSelectScreen
                      onSelect={handleRoomSelect}
                      // Layer 1
                      isFirstTimePlayer={canClaimFirstShot()}
                      onClaimFirstShot={handleClaimFirstShot}
                      // Layer 2
                      canClaimDailyPitPass={canClaimDailyPitPass()}
                      onClaimDailyPitPass={handleClaimDailyPitPass}
                      // Layer 3
                      freeRound={freeRound}
                      onEnterFreeRound={handleEnterFreeRound}
                      // Daily voucher
                      canClaimLoginVoucher={canClaimLoginVoucher()}
                      onClaimLoginVoucher={claimLoginVoucher}
                    />
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
                      onActivateFuseBurner={() => { activateFuseBurner(); purchaseItem("fuse_burner"); }}
                      cardTheme={raw.equippedCardTheme}
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
                      referralCode={raw.referralCode}
                      onGenerateCode={() => generateReferralCode(connected ? (publicKey ?? "anon") : "anon")}
                      canClaimVoucher={canClaimLoginVoucher()}
                      onClaimVoucher={claimLoginVoucher}
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
              fuseCommitHash={state.fuseCommitHash}
              onPlayAgain={playAgain}
            />

            <LevelUpToast events={levelUpEvents} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
