/**
 * Meteors — ported from Aceternity UI's meteors component.
 * Pure CSS animated streaks that shoot diagonally across a container.
 * GPU-safe: only animates transform (translateX/translateY) and opacity.
 *
 * Source reference: ui.aceternity.com/components/meteors
 * Ported to TypeScript. No external deps beyond tailwind.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface MeteorsProps {
  number?: number;
  className?: string;
}

export function Meteors({ number = 16, className }: MeteorsProps) {
  const meteors = useMemo(
    () =>
      Array.from({ length: number }, (_, i) => ({
        id: i,
        // Spread across a wide band so they cross the full viewport
        left: Math.floor(Math.random() * (600 - -200) + -200),
        delay: (Math.random() * 0.8 + 0.1).toFixed(2),
        duration: (Math.random() * 6 + 5).toFixed(1),
      })),
    [number],
  );

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
      aria-hidden
    >
      {meteors.map((m) => (
        <span
          key={m.id}
          className="absolute top-0 h-px w-[2px] rotate-[215deg]"
          style={{
            left: m.left,
            // Aceternity meteor: the streak is made with a ::before pseudo tail
            background:
              "linear-gradient(to bottom, rgba(255,215,0,0.9), transparent)",
            boxShadow: "0 0 0 1px rgba(255,215,0,0.06)",
            animationDelay: `${m.delay}s`,
            animationDuration: `${m.duration}s`,
            // GPU-only animation — translateX/Y + opacity
            willChange: "transform, opacity",
            animation: `meteor-fall ${m.duration}s linear ${m.delay}s infinite`,
          }}
        >
          {/* Streak tail via inline element, cheaper than ::before in React */}
          <span
            className="absolute top-1/2 -translate-y-1/2"
            style={{
              width: 80,
              height: 1,
              background:
                "linear-gradient(to right, rgba(255,215,0,0.7), transparent)",
            }}
          />
        </span>
      ))}
    </div>
  );
}
