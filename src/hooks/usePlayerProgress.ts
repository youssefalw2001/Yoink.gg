import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeProgress,
  isDifferentDay,
  loadProgress,
  rankForXp,
  saveProgress,
  XP_REWARDS,
  type PlayerProgress,
  type ProgressState,
  type XPGain,
} from "@/lib/progression";
import { playLevelUp } from "@/lib/sounds";

export interface LevelUpEvent {
  id: number;
  oldLevel: number;
  newLevel: number;
  rankName: string;
}

let _eventId = 0;

export function usePlayerProgress() {
  const [raw, setRaw] = useState<ProgressState>(() => loadProgress());
  const [levelUpEvents, setLevelUpEvents] = useState<LevelUpEvent[]>([]);
  const prevLevelRef = useRef(rankForXp(raw.xp).level);

  // Persist on every change
  useEffect(() => {
    saveProgress(raw);
  }, [raw]);

  const progress: PlayerProgress = {
    ...computeProgress(raw.xp),
    totalYoinks:      raw.totalYoinks,
    totalWins:        raw.totalWins,
    totalSolWon:      raw.totalSolWon,
    dailyRoundsToday: raw.dailyRoundsToday,
    lastPlayedDate:   raw.lastPlayedDate,
  };

  /** Award XP and check for level-up */
  const awardXP = useCallback((gain: XPGain) => {
    setRaw((prev) => {
      const newXp    = prev.xp + gain.amount;
      const oldLevel = rankForXp(prev.xp).level;
      const newLevel = rankForXp(newXp).level;

      if (newLevel > oldLevel) {
        playLevelUp();
        const ev: LevelUpEvent = {
          id:       ++_eventId,
          oldLevel,
          newLevel,
          rankName: rankForXp(newXp).name,
        };
        setLevelUpEvents((evs) => [...evs, ev]);
        setTimeout(() => {
          setLevelUpEvents((evs) => evs.filter((e) => e.id !== ev.id));
        }, 4_000);
      }

      prevLevelRef.current = newLevel;
      return { ...prev, xp: newXp };
    });
  }, []);

  /** Call when player YOINKs */
  const onYoink = useCallback(() => {
    setRaw((p) => ({ ...p, totalYoinks: p.totalYoinks + 1 }));
    awardXP(XP_REWARDS.YOINK);
  }, [awardXP]);

  /** Call every second the player holds the bag */
  const onHoldSecond = useCallback((heldFor: number) => {
    if (heldFor === 10) awardXP(XP_REWARDS.SURVIVE_10S);
    if (heldFor === 20) awardXP(XP_REWARDS.SURVIVE_20S);
  }, [awardXP]);

  /** Call when player wins a round */
  const onWin = useCallback((solWon: number) => {
    setRaw((p) => ({
      ...p,
      totalWins:        p.totalWins + 1,
      totalSolWon:      +(p.totalSolWon + solWon).toFixed(4),
      dailyRoundsToday: p.dailyRoundsToday + 1,
    }));
    awardXP(solWon >= 10 ? XP_REWARDS.WIN_BIG : XP_REWARDS.WIN_ROUND);
  }, [awardXP]);

  /** Call on round end for daily bonus tracking */
  const onRoundEnd = useCallback(() => {
    setRaw((p) => {
      const today    = new Date().toDateString();
      const isNewDay = p.lastPlayedDate !== today;
      const newCount = isNewDay ? 1 : p.dailyRoundsToday + 1;
      if (newCount === 5) setTimeout(() => awardXP(XP_REWARDS.DAILY_BONUS), 200);
      return { ...p, dailyRoundsToday: newCount, lastPlayedDate: today };
    });
  }, [awardXP]);

  /** Shop: purchase an item (handles both SOL-priced and XP-priced items) */
  const purchaseItem = useCallback((itemId: string, xpCost?: number) => {
    setRaw((p) => {
      const newXp = xpCost ? Math.max(0, p.xp - xpCost) : p.xp;
      return {
        ...p,
        xp: newXp,
        ownedItems: p.ownedItems.includes(itemId)
          ? p.ownedItems
          : [...p.ownedItems, itemId],
      };
    });
  }, []);

  const ownsItem = useCallback(
    (itemId: string) => raw.ownedItems.includes(itemId),
    [raw.ownedItems],
  );

  const setDisplayName = useCallback((name: string) => {
    setRaw((p) => ({ ...p, displayName: name.slice(0, 20) }));
  }, []);

  const setFlameColor = useCallback((color: string) => {
    setRaw((p) => ({ ...p, equippedFlameColor: color }));
  }, []);

  const setCardTheme = useCallback((theme: string) => {
    setRaw((p) => ({ ...p, equippedCardTheme: theme }));
  }, []);

  // ── LAYER 1 — First Shot Free ──────────────────────────────────────────────
  /**
   * True if this wallet has never claimed their one-time free yoink.
   * Lifetime flag — never resets. Pit only.
   */
  const canClaimFirstShot = useCallback(
    (): boolean => !raw.hasClaimedFirstShot,
    [raw.hasClaimedFirstShot],
  );

  /**
   * Mark the first-shot as claimed. Call this when the player clicks
   * "Claim First Shot" — BEFORE navigating to The Pit, so it's
   * consumed even if they navigate away mid-game.
   */
  const claimFirstShot = useCallback(() => {
    setRaw((p) => ({ ...p, hasClaimedFirstShot: true }));
  }, []);

  // ── LAYER 2 — Daily Pit Pass (Rank 2+) ────────────────────────────────────
  /**
   * True if:
   *   1. Player is Rank 2+ (≥ 500 XP), AND
   *   2. They haven't claimed the daily pass today (UTC).
   *
   * Rank gate: prevents Sybil farming — bots need real paid play to rank up.
   */
  const canClaimDailyPitPass = useCallback((): boolean => {
    if (raw.xp < 500) return false; // must be Rank 2+
    if (!raw.dailyPitPassClaimedAt) return true;
    return isDifferentDay(raw.dailyPitPassClaimedAt, new Date().toISOString());
  }, [raw.xp, raw.dailyPitPassClaimedAt]);

  /** Mark the daily Pit pass as used for today. */
  const claimDailyPitPass = useCallback(() => {
    setRaw((p) => ({ ...p, dailyPitPassClaimedAt: new Date().toISOString() }));
  }, []);

  // ── Daily Login Voucher (+50 XP) ───────────────────────────────────────────
  const canClaimLoginVoucher = useCallback((): boolean => {
    if (!raw.loginVoucherClaimedAt) return true;
    return isDifferentDay(raw.loginVoucherClaimedAt, new Date().toISOString());
  }, [raw.loginVoucherClaimedAt]);

  const claimLoginVoucher = useCallback(() => {
    setRaw((p) => ({
      ...p,
      xp: p.xp + 50,
      loginVoucherClaimedAt: new Date().toISOString(),
    }));
  }, []);

  // ── Affiliate referral code ────────────────────────────────────────────────
  const generateReferralCode = useCallback((walletAddress: string) => {
    if (raw.referralCode) return raw.referralCode;
    const code = `YOINK-${walletAddress.slice(0, 4).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    setRaw((p) => ({ ...p, referralCode: code }));
    return code;
  }, [raw.referralCode]);

  return {
    progress,
    raw,
    levelUpEvents,
    onYoink,
    onHoldSecond,
    onWin,
    onRoundEnd,
    purchaseItem,
    ownsItem,
    setDisplayName,
    setFlameColor,
    setCardTheme,
    awardXP,
    // Layer 1
    canClaimFirstShot,
    claimFirstShot,
    // Layer 2
    canClaimDailyPitPass,
    claimDailyPitPass,
    // Other
    canClaimLoginVoucher,
    claimLoginVoucher,
    generateReferralCode,
  };
}
