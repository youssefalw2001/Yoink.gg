import { useRef, useEffect, useState } from "react";
import { Swords, Flame, Clock } from "lucide-react";
import type { King } from "@/lib/types";
import type { FreeRoundState } from "@/hooks/useFreeRound";
import { truncateAddress } from "@/lib/utils";

interface LiveTickerProps {
  recentKings: King[];
  currentKing: string;
  freeRound: FreeRoundState;
}

interface TickerItem {
  wallet: string;
  label: string;
  uid: string;
  type: "yoink" | "freeRoundLive" | "freeRoundSoon";
}

const MIN_ITEMS = 8;

/**
 * LiveTicker — glitch-free CSS scrolling bar.
 *
 * Injects free round announcements into the ticker stream:
 *   - When active:    "FREE ROUND LIVE — The Pit · Xm remaining"
 *   - When upcoming:  "FREE ROUND IN Xm — The Pit"
 *
 * Fix 1: Items are ONLY appended when a new king arrives — never rebuilt.
 * Fix 2: Row components are stable — defined outside render.
 * Fix 3: Track duplication is exact 50/50 so translateX(-50%) loops perfectly.
 * Fix 4: New items slide in on the right without interrupting ongoing scroll.
 */
export function LiveTicker({ recentKings, currentKing, freeRound }: LiveTickerProps) {
  const [items, setItems] = useState<TickerItem[]>(() =>
    buildInitial(currentKing, recentKings),
  );

  const prevKingRef      = useRef(currentKing);
  const prevFreeActive   = useRef(freeRound.isActive);
  const prevFreeUpcoming = useRef(freeRound.isUpcoming);

  // Append on king change
  useEffect(() => {
    if (currentKing !== prevKingRef.current) {
      prevKingRef.current = currentKing;
      setItems((prev) => {
        const next: TickerItem = {
          wallet: currentKing,
          label:  "YOINKED the bag",
          uid:    `k-${Date.now()}`,
          type:   "yoink",
        };
        return [...prev, next].slice(-20);
      });
    }
  }, [currentKing]);

  // Inject free round announcement when it goes live
  useEffect(() => {
    if (freeRound.isActive && !prevFreeActive.current) {
      setItems((prev) => {
        const item: TickerItem = {
          wallet: "",
          label:  `FREE ROUND LIVE — The Pit · ${freeRound.minutesLeft}m remaining`,
          uid:    `fr-live-${Date.now()}`,
          type:   "freeRoundLive",
        };
        return [...prev, item, item].slice(-22); // double it so it shows often
      });
    }
    prevFreeActive.current = freeRound.isActive;
  }, [freeRound.isActive, freeRound.minutesLeft]);

  // Inject upcoming announcement when it enters the 30-min window
  useEffect(() => {
    if (freeRound.isUpcoming && !prevFreeUpcoming.current) {
      setItems((prev) => {
        const item: TickerItem = {
          wallet: "",
          label:  `FREE ROUND IN ${freeRound.minutesUntilNext}m — The Pit`,
          uid:    `fr-soon-${Date.now()}`,
          type:   "freeRoundSoon",
        };
        return [...prev, item].slice(-20);
      });
    }
    prevFreeUpcoming.current = freeRound.isUpcoming;
  }, [freeRound.isUpcoming, freeRound.minutesUntilNext]);

  const padded = padItems(items);

  return (
    <div
      className="ticker-mask relative z-30 overflow-hidden border-b border-white/[0.06] bg-[rgba(13,13,24,0.6)] py-2 backdrop-blur-md"
      aria-label="Live yoink activity"
    >
      <div className="ticker-track flex min-w-max items-center">
        {padded.map((it, i) => (
          <TickerRow key={`a-${it.uid}-${i}`} item={it} />
        ))}
        {padded.map((it, i) => (
          <TickerRow key={`b-${it.uid}-${i}`} item={it} aria-hidden />
        ))}
      </div>

      {/* Edge fade masks */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-20"
        style={{ background: "linear-gradient(to right, rgba(13,13,24,1), transparent)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-20"
        style={{ background: "linear-gradient(to left, rgba(13,13,24,1), transparent)" }}
        aria-hidden
      />
    </div>
  );
}

// ── Stable row component ──────────────────────────────────────────────────────

interface TickerRowProps {
  item: TickerItem;
  "aria-hidden"?: boolean;
}

function TickerRow({ item, ...props }: TickerRowProps) {
  if (item.type === "freeRoundLive") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-2 px-5 text-xs"
        {...props}
      >
        <Flame className="h-3 w-3 shrink-0 text-blood" aria-hidden />
        <span className="font-mono font-bold" style={{ color: "#FF2200" }}>
          {item.label}
        </span>
        <span className="text-dim opacity-40">·</span>
      </span>
    );
  }

  if (item.type === "freeRoundSoon") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-2 px-5 text-xs"
        {...props}
      >
        <Clock className="h-3 w-3 shrink-0 text-gold" aria-hidden />
        <span className="font-mono font-bold text-gold">{item.label}</span>
        <span className="text-dim opacity-40">·</span>
      </span>
    );
  }

  const isYou = item.wallet === "You";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-2 px-5 text-xs"
      {...props}
    >
      <Swords
        className="h-3 w-3 shrink-0"
        style={{ color: isYou ? "#FFD700" : "#7000FF" }}
        aria-hidden
      />
      <span className="font-mono" style={{ color: isYou ? "#FFE566" : "#8892a4" }}>
        {isYou ? "You" : truncateAddress(item.wallet)}
      </span>
      <span className="text-slate">{item.label}</span>
      <span className="text-dim opacity-40">·</span>
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildInitial(currentKing: string, recentKings: King[]): TickerItem[] {
  const items: TickerItem[] = [
    { wallet: currentKing, label: "holds the bag", uid: "init-current", type: "yoink" },
    ...recentKings.slice(0, 9).map((k, i) => ({
      wallet: k.wallet,
      label:  `held ${k.heldFor}s`,
      uid:    `init-${i}`,
      type:   "yoink" as const,
    })),
  ];
  return padItems(items);
}

function padItems(items: TickerItem[]): TickerItem[] {
  if (items.length >= MIN_ITEMS) return items;
  const out = [...items];
  while (out.length < MIN_ITEMS) {
    out.push(...items.map((it, i) => ({ ...it, uid: `pad-${it.uid}-${i}-${out.length}` })));
  }
  return out.slice(0, Math.max(MIN_ITEMS, items.length));
}
