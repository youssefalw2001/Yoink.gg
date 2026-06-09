import { useRef, useEffect, useState } from "react";
import { Swords } from "lucide-react";
import type { King } from "@/lib/types";
import { truncateAddress } from "@/lib/utils";

interface LiveTickerProps {
  recentKings: King[];
  currentKing: string;
}

interface TickerItem {
  wallet: string;
  label: string;
  uid: string;
}

const MIN_ITEMS = 8;

/**
 * LiveTicker — glitch-free CSS scrolling bar.
 *
 * Fix 1: Items are ONLY appended when a new king arrives — never rebuilt.
 *         The animation never resets mid-scroll.
 * Fix 2: Row components are stable — defined outside render.
 * Fix 3: Track duplication is exact 50/50 so translateX(-50%) loops perfectly.
 * Fix 4: New items slide in on the right without interrupting ongoing scroll.
 */
export function LiveTicker({ recentKings, currentKing }: LiveTickerProps) {
  // Stable item list — we append, never rebuild
  const [items, setItems] = useState<TickerItem[]>(() =>
    buildInitial(currentKing, recentKings),
  );

  const prevKingRef = useRef(currentKing);

  // Only append when the king actually changes — not on every render
  useEffect(() => {
    if (currentKing !== prevKingRef.current) {
      prevKingRef.current = currentKing;
      setItems((prev) => {
        const next: TickerItem = {
          wallet: currentKing,
          label: "YOINKED the bag",
          uid:   `k-${Date.now()}`,
        };
        // Keep a rolling window of 20 so the list doesn't grow forever
        return [...prev, next].slice(-20);
      });
    }
  }, [currentKing]);

  // Pad to minimum so the track fills the viewport even with few items
  const padded = padItems(items);

  return (
    <div
      className="ticker-mask relative z-30 overflow-hidden border-b border-white/[0.06] bg-[rgba(13,13,24,0.6)] py-2 backdrop-blur-md"
      aria-label="Live yoink activity"
    >
      {/* Two identical halves — seamless translateX(-50%) loop */}
      <div className="ticker-track flex min-w-max items-center">
        {padded.map((it, i) => (
          <TickerItem key={`a-${it.uid}-${i}`} item={it} />
        ))}
        {/* Exact duplicate — same count, same content */}
        {padded.map((it, i) => (
          <TickerItem key={`b-${it.uid}-${i}`} item={it} aria-hidden />
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

// ── Stable item component — defined outside render, no re-mount ──────────────

interface TickerItemProps {
  item: TickerItem;
  "aria-hidden"?: boolean;
}

function TickerItem({ item, ...props }: TickerItemProps) {
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
      <span
        className="font-mono"
        style={{ color: isYou ? "#FFE566" : "#8892a4" }}
      >
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
    {
      wallet: currentKing,
      label:  "holds the bag",
      uid:    "init-current",
    },
    ...recentKings.slice(0, 9).map((k, i) => ({
      wallet: k.wallet,
      label:  `held ${k.heldFor}s`,
      uid:    `init-${i}`,
    })),
  ];
  return padItems(items);
}

/** Pad items to MIN_ITEMS so the track always fills the viewport. */
function padItems(items: TickerItem[]): TickerItem[] {
  if (items.length >= MIN_ITEMS) return items;
  const out = [...items];
  while (out.length < MIN_ITEMS) {
    out.push(
      ...items.map((it, i) => ({
        ...it,
        uid: `pad-${it.uid}-${i}-${out.length}`,
      })),
    );
  }
  return out.slice(0, Math.max(MIN_ITEMS, items.length));
}
