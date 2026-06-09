import { useMemo } from "react";
import { Zap } from "lucide-react";
import type { King } from "@/lib/types";
import { truncateAddress } from "@/lib/utils";

interface LiveTickerProps {
  recentKings: King[];
  currentKing: string;
}

/**
 * LiveTicker — slim CSS-scrolling bar of recent yoinks.
 * Track is duplicated so the translateX(-50%) loop is seamless.
 */
export function LiveTicker({ recentKings, currentKing }: LiveTickerProps) {
  const items = useMemo(() => {
    const base = [
      { wallet: currentKing, label: "YOINKED the bag", id: "live-current" },
      ...recentKings.map((k) => ({
        wallet: k.wallet,
        label: `held ${k.heldFor}s`,
        id: k.id,
      })),
    ];
    // ensure enough items to fill width
    while (base.length < 10) {
      base.push(...base);
    }
    return base.slice(0, 12);
  }, [recentKings, currentKing]);

  const Row = ({ keyPrefix }: { keyPrefix: string }) => (
    <div className="ticker-track" aria-hidden={keyPrefix === "b"}>
      {items.map((it, i) => (
        <span
          key={`${keyPrefix}-${it.id}-${i}`}
          className="inline-flex items-center gap-2 px-5 text-xs"
        >
          <Zap className="h-3 w-3 text-gold" aria-hidden />
          <span className="font-mono text-gold-soft">
            {it.wallet === "You" ? "You" : truncateAddress(it.wallet)}
          </span>
          <span className="text-slate">{it.label}</span>
          <span className="text-dim">·</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="ticker-mask relative z-30 overflow-hidden border-b border-white/[0.06] bg-[rgba(13,13,24,0.6)] py-2 backdrop-blur-md">
      <div className="flex min-w-max">
        <Row keyPrefix="a" />
        <Row keyPrefix="b" />
      </div>
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-void to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-void to-transparent" />
    </div>
  );
}
