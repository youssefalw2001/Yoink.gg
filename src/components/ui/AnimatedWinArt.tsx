/**
 * YOINK.GG — Anime.js v4 Animated Win Reveal SVGs
 *
 * Wraps WinTrophy and WinBagArt so they draw in with
 * anime.js createDrawable() when the win reveal opens.
 *
 * The trophy/bag SVG stroke elements are drawn sequentially:
 *   - Outer shape draws first (600ms)
 *   - Inner details stagger in (300ms delay each)
 *   - Fill opacity fades in after strokes complete
 *
 * Source: juliangarnier/anime/src/svg/drawable.js
 */

import { useEffect, useRef } from "react";
import { animate, createDrawable, stagger } from "animejs";
import { WinTrophy, WinBagArt, WinCrownArt } from "./WinArt";

interface AnimatedWinArtProps {
  isYou: boolean;
  size?: number;
  /** fires when the win modal opens — triggers the draw animation */
  animate?: boolean;
}

export function AnimatedWinArt({ isYou, size = 120, animate: shouldAnimate = false }: AnimatedWinArtProps) {
  const wrapRef  = useRef<HTMLDivElement>(null);
  const hasRun   = useRef(false);

  useEffect(() => {
    if (!shouldAnimate || hasRun.current) return;
    hasRun.current = true;

    const wrap = wrapRef.current;
    if (!wrap) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    // All stroke paths in the SVG
    const strokes = wrap.querySelectorAll("path, circle, rect, polygon, line, ellipse");
    if (!strokes.length) return;

    const drawables = createDrawable(
      strokes as unknown as NodeListOf<SVGGeometryElement>,
      0, 0,
    );

    // Sequential draw — outer shape first, details stagger after
    animate(drawables, {
      draw:     ["0 0", "0 1"],
      duration: 700,
      ease:     "outExpo",
      delay:    stagger(25, { from: "first" }),
    });

    // Fade in fills after strokes
    animate(Array.from(strokes), {
      opacity:  [0, 1],
      duration: 400,
      ease:     "outQuart",
      delay:    stagger(20, { start: 400 }),
    });
  }, [shouldAnimate]);

  return (
    <div ref={wrapRef} className="inline-flex items-center justify-center">
      {isYou ? (
        <WinBagArt size={size} />
      ) : (
        <WinTrophy size={size} />
      )}
    </div>
  );
}

/**
 * AnimatedWinCrown — draws the background crown watermark
 */
export function AnimatedWinCrown({ size = 160, shouldAnimate = false }: { size?: number; shouldAnimate?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hasRun  = useRef(false);

  useEffect(() => {
    if (!shouldAnimate || hasRun.current) return;
    hasRun.current = true;
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const strokes = wrap.querySelectorAll("path, circle, line");
    if (!strokes.length) return;

    const drawables = createDrawable(
      strokes as unknown as NodeListOf<SVGGeometryElement>,
      0, 0,
    );
    animate(drawables, {
      draw:     ["0 0", "0 1"],
      duration: 1200,
      ease:     "outExpo",
      delay:    stagger(15),
    });
  }, [shouldAnimate]);

  return (
    <div ref={wrapRef}>
      <WinCrownArt size={size} />
    </div>
  );
}
