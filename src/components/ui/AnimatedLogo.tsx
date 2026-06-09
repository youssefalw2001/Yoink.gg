/**
 * YOINK.GG — Anime.js v4 Animated Void Eye Logo
 *
 * Replaces the old Crown-Dagger animated logo.
 * The Void Eye hexagon frame draws in, then the pupil scales up,
 * then the wordmark fades in below.
 *
 * Uses:
 *   createDrawable() — draws the hexagon stroke + eye path
 *   animate()        — spring entrance for pupil + wordmark
 */

import { useEffect, useRef } from "react";
import { animate, createDrawable, stagger } from "animejs";
import { VoidEyeIcon, YoinkWordmark } from "./YoinkLogo";

interface AnimatedLogoProps {
  size?: number;
  className?: string;
}

export function AnimatedLogo({ size = 160, className }: AnimatedLogoProps) {
  const wrapRef    = useRef<HTMLDivElement>(null);
  const iconRef    = useRef<HTMLDivElement>(null);
  const wordRef    = useRef<HTMLDivElement>(null);
  const hasRun     = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const icon = iconRef.current;
    const word = wordRef.current;
    if (!icon || !word) return;

    const svg   = icon.querySelector("svg");
    if (!svg) return;

    // ── 1. Draw hexagon + eye strokes ─────────────────────────────────────────
    const strokes = svg.querySelectorAll("polygon, path, ellipse");
    if (strokes.length) {
      const drawables = createDrawable(
        strokes as unknown as NodeListOf<SVGGeometryElement>,
        0, 0,
      );
      animate(drawables, {
        draw:     ["0 0", "0 1"],
        duration: 900,
        ease:     "outExpo",
        delay:    stagger(60),
      });
    }

    // ── 2. Pupil circles scale in after strokes ────────────────────────────────
    const circles = Array.from(svg.querySelectorAll("circle"));
    animate(circles, {
      scale:   [0, 1],
      opacity: [0, 1],
      duration: 350,
      ease:    "spring(1, 80, 10, 0)",
      delay:   stagger(40, { start: 700 }),
    });

    // ── 3. Wordmark slides up after icon ──────────────────────────────────────
    animate(word, {
      opacity:    [0, 1],
      translateY: [10, 0],
      duration:   450,
      ease:       "outQuart",
      delay:      800,
    });
  }, []);

  return (
    <div ref={wrapRef} className={`inline-flex flex-col items-center gap-3 ${className ?? ""}`}>
      <div ref={iconRef}>
        <VoidEyeIcon size={size * 0.7} variant="gold" />
      </div>
      <div ref={wordRef} style={{ opacity: 0 }}>
        <YoinkWordmark size="lg" showTagline />
      </div>
    </div>
  );
}
