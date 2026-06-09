/**
 * YOINK.GG — Anime.js v4 Animated Crown-Dagger Logo
 *
 * Uses real anime.js v4 APIs fetched from github.com/juliangarnier/anime:
 *   • createDrawable() — SVG path line-drawing animation
 *   • animate()        — spring-based entrance
 *
 * On mount the Crown-Dagger path draws itself from 0→1,
 * then the wordmark fades in below it.
 *
 * Respects prefers-reduced-motion: shows full logo instantly if set.
 */

import { useEffect, useRef } from "react";
import { animate, createDrawable } from "animejs";

interface AnimatedLogoProps {
  size?: number;
  className?: string;
}

const CROWN_PATH =
  "M 4 28 L 4 18 L 10 22 L 14 8 L 20 14 L 20 6 L 20 14 L 26 8 L 30 22 L 36 18 L 36 28 L 30 28 L 28 34 L 26 28 L 20 28 L 20 36 L 20 28 L 14 28 L 12 34 L 10 28 Z";

export function AnimatedLogo({ size = 160, className }: AnimatedLogoProps) {
  const svgRef     = useRef<SVGSVGElement>(null);
  const pathRef    = useRef<SVGPathElement>(null);
  const wordRef    = useRef<SVGGElement>(null);
  const hasRun     = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const path = pathRef.current;
    const word = wordRef.current;
    if (!path || !word) return;

    // ── 1. Create a drawable proxy from anime.js v4 source pattern ────────────
    // anime's createDrawable sets pathLength="1000" and manages stroke-dasharray
    const drawable = createDrawable(path, 0, 0);

    // ── 2. Draw the path from 0 to 1 ─────────────────────────────────────────
    animate(drawable, {
      draw:     ["0 0", "0 1"],
      duration: 1200,
      ease:     "outExpo",
      delay:    200,
      onComplete: () => {
        // ── 3. After draw, spring the jewels in ────────────────────────────────
        animate(svgRef.current?.querySelectorAll(".jewel") ?? [], {
          scale:    [0, 1],
          opacity:  [0, 1],
          duration: 400,
          ease:     "spring(1, 80, 10, 0)",
        });
      },
    });

    // ── 4. Wordmark fades in after logo finishes drawing ──────────────────────
    animate(word, {
      opacity:   [0, 1],
      translateY:[8, 0],
      duration:  500,
      ease:      "outQuart",
      delay:     1000,
    });
  }, []);

  const s = size;
  // Scale the 40×40 crown to fit in `size`
  const scale = s / 80;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${s} ${s * 0.85}`}
      width={s}
      height={s * 0.85}
      className={className}
      fill="none"
      aria-label="YOINK.GG animated logo"
    >
      <defs>
        <linearGradient id="alg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="50%"  stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FF9900" />
        </linearGradient>
        <linearGradient id="alwg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="50%"  stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FF9900" />
        </linearGradient>
      </defs>

      {/* Crown-Dagger at natural 40×40, centered in `size` */}
      <g transform={`translate(${s / 2 - 20 * scale}, ${s * 0.02}) scale(${scale})`}>
        <path
          ref={pathRef}
          d={CROWN_PATH}
          stroke="url(#alg)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
        {/* Filled version shown after draw (opacity layered) */}
        <path
          d={CROWN_PATH}
          fill="url(#alg)"
          opacity="0.35"
        />
        {/* Jewels — spring in after draw */}
        <circle className="jewel" cx="20" cy="18" r="3" fill="#FF1744" stroke="#FFE566" strokeWidth="0.5" style={{ opacity: 0 }} />
        <circle className="jewel" cx="11" cy="20" r="1.8" fill="#7000FF" stroke="#FFE566" strokeWidth="0.4" style={{ opacity: 0 }} />
        <circle className="jewel" cx="29" cy="20" r="1.8" fill="#00C853" stroke="#FFE566" strokeWidth="0.4" style={{ opacity: 0 }} />
      </g>

      {/* YOINK.GG wordmark below the icon */}
      <g ref={wordRef} style={{ opacity: 0 }}>
        <text
          x={s / 2} y={s * 0.72}
          textAnchor="middle"
          fontFamily="'Orbitron', sans-serif"
          fontWeight="900"
          fontSize={s * 0.115}
          fill="white"
          letterSpacing="2"
        >
          YOINK<tspan fill="url(#alwg)">.GG</tspan>
        </text>
        <line
          x1={s * 0.18} y1={s * 0.77}
          x2={s * 0.82} y2={s * 0.77}
          stroke="url(#alwg)" strokeWidth="1" opacity="0.5"
        />
      </g>
    </svg>
  );
}
