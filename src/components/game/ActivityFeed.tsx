import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Swords, TrendingUp } from "lucide-react";
import type { YoinkEvent } from "@/lib/types";
import { formatSol, truncateAddress } from "@/lib/utils";

interface ActivityFeedProps {
  events: YoinkEvent[];
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 2) return "just now";
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

/**
 * ActivityFeed — live stream of every YOINK this round.
 * New entries slide in from the top with spring physics.
 * Shows wallet, cost paid, bag size after, and a relative timestamp.
 */
export const ActivityFeed = memo(function ActivityFeed({ events }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <div className="w-full">
        <FeedHeader />
        <div className="flex h-24 items-center justify-center">
          <span className="font-mono text-xs text-dim">
            No YOINKs yet this round…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <FeedHeader count={events.length} />
      <div className="no-scrollbar flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
        <AnimatePresence initial={false} mode="popLayout">
          {events.map((ev, idx) => {
            // The dethroned ("previous") King is the new king of the next-older
            // event in the feed. Unknown for the oldest visible row.
            const prevKing = events[idx + 1]?.wallet;
            const showToll = (ev.tollPaid ?? 0) > 0;
            return (
            <motion.div
              key={ev.id}
              layout
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2.5"
            >
              {/* icon */}
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: ev.isYou
                    ? "rgba(255,215,0,0.15)"
                    : "rgba(112,0,255,0.15)",
                  border: `1px solid ${ev.isYou ? "rgba(255,215,0,0.25)" : "rgba(112,0,255,0.25)"}`,
                }}
              >
                <Swords
                  className="h-3.5 w-3.5"
                  style={{ color: ev.isYou ? "#FFD700" : "#7000FF" }}
                  aria-hidden
                />
              </span>

              {/* wallet + bag */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-xs font-bold truncate"
                    style={{ color: ev.isYou ? "#FFD700" : "#eef1f6" }}
                  >
                    {ev.isYou ? "You" : truncateAddress(ev.wallet)}
                  </span>
                  <span className="font-mono text-[10px] text-slate">yoinked</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-dim">
                    paid {formatSol(ev.cost, 3)} SOL
                  </span>
                  <span className="text-dim">·</span>
                  <span className="flex items-center gap-1 font-mono text-[10px] text-gold/70">
                    <TrendingUp className="h-2.5 w-2.5" aria-hidden />
                    bag {formatSol(ev.bagAfter, 3)} SOL
                  </span>
                </div>
                {/* Reign Toll flow — gold secondary line when a toll was paid */}
                {showToll && (
                  <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-gold">
                    ↳ +{formatSol(ev.tollPaid ?? 0, 3)} SOL toll
                    {prevKing ? <> → {truncateAddress(prevKing)}</> : null}
                  </span>
                )}
              </div>

              {/* timestamp */}
              <span className="shrink-0 font-mono text-[10px] text-dim">
                {timeAgo(ev.ts)}
              </span>
            </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
});

function FeedHeader({ count }: { count?: number }) {
  return (
    <div className="mb-2.5 flex items-center justify-between px-1">
      <div className="flex items-center gap-2">
        <Swords className="h-3.5 w-3.5 text-gold-deep" aria-hidden />
        <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate">
          Live Activity
        </h3>
      </div>
      {count !== undefined && count > 0 && (
        <span className="rounded-full border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-slate">
          {count} this round
        </span>
      )}
    </div>
  );
}
