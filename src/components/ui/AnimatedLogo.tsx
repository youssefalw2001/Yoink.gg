/**
 * YOINK.GG — Anime.js v4 Animated Snatch Logo
 *
 * The four finger/palm paths draw in sequentially via createDrawable,
 * then the wordmark slides up.
 *
 * Sequence:
 *   0ms   — fingers draw (stagger 85ms each)
 *   680ms — wordmark slides up + fades in
 *
 * GPU rules: transform + opacity only after draw completes.
 * prefers-reduced-motion: skips all animation, shows final state.
 */

import { useEffect, useRef } from "react";
import { animate, createDrawable, stagger } from "animejs";
import { SnatchIcon, YoinkWordmark } from "./YoinkLogo";

interface AnimatedLogoProps {
  size?: number;
  className?: string;
}

export function AnimatedLogo({ size = 160, className }: AnimatedLogoProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const hasRun  = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const icon = iconRef.current;
    const word = wordRef.current;
    if (!icon || !word) return;

    const svg = icon.querySelector("svg");
    if (!svg) return;

    // ── 1. Draw the 4 finger/palm paths ──────────────────────────────────────
    const paths = svg.querySelectorAll<SVGGeometryElement>("path");
    if (paths.length) {
      const drawables = createDrawable(
        paths as unknown as NodeListOf<SVGGeometryElement>,
        0, 0,
      );
      animate(drawables, {
        draw:     ["0 0", "0 1"],
        duration: 800,
        ease:     "outExpo",
        delay:    stagger(85, { start: 0 }),
      });
    }

    // ── 2. Wordmark slides up ─────────────────────────────────────────────────
    animate(word, {
      opacity:    [0, 1],
      translateY: [12, 0],
      duration:   480,
      ease:       "outQuart",
      delay:      680,
    });
  }, []);

  return (
    <div ref={wrapRef} className={`inline-flex flex-col items-center gap-4 ${className ?? ""}`}>
      <div ref={iconRef}>
        <SnatchIcon size={size * 0.68} variant="gold" />
      </div>
      <div ref={wordRef} style={{ opacity: 0 }}>
        <YoinkWordmark size="lg" showTagline />
      </div>
    </div>
  );
}
