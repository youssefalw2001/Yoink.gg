/**
 * YOINK.GG — Anime.js v4 SVG Rank Morph
 *
 * When a player levels up, the rank art SVG icon morphs from the
 * old rank shape to the new rank shape using anime.js v4's real
 * morphTo() function (fetched from github.com/juliangarnier/anime).
 *
 * morphTo() works by:
 *   1. Sampling both path1 and path2 at equal intervals along their length
 *   2. Interpolating between the sampled point sets
 *   3. This handles paths with unequal numbers of points (the hard problem)
 *
 * Usage:
 *   <RankMorph fromLevel={3} toLevel={4} onComplete={() => {}} />
 *
 * The component auto-destroys after the animation completes.
 * Respects prefers-reduced-motion.
 */

import { useEffect, useRef } from "react";
import { animate, svg } from "animejs";
import { RANKS } from "@/lib/progression";

// ─── Simplified rank shape paths (36×36 viewBox) ─────────────────────────────
// Each is a single closed path that Anime.js can morph between.
// Using simplified versions of the rank art for morphing (full rank art
// uses complex multi-element SVGs — morphTo requires single paths).

const RANK_PATHS: Record<number, string> = {
  // Peasant — simple broken circle
  1: "M18 8 A10 10 0 1 1 8 18 A10 10 0 0 1 18 8 M16 14 L18 8 L20 14",
  // Pickpocket — hand shape
  2: "M10 26 Q10 16 14 14 L18 16 L22 12 Q24 10 26 12 L24 16 L26 12 Q28 10 30 12 L28 16 Q30 12 30 16 L28 20 Q32 18 32 22 Q32 28 22 28 Z",
  // Thief — hooded figure
  3: "M18 6 Q10 8 8 18 Q8 28 18 30 Q28 28 28 18 Q26 8 18 6 M14 16 L16 14 L20 14 L22 16",
  // Bandit — skull
  4: "M18 8 Q10 8 10 16 Q10 22 14 24 L14 28 L22 28 L22 24 Q26 22 26 16 Q26 8 18 8 M14 16 Q14 14 16 14 Q18 14 18 16 M22 16 Q22 14 20 14 Q18 14 18 16",
  // Outlaw — star
  5: "M18 4 L20 12 L28 12 L22 17 L24 25 L18 20 L12 25 L14 17 L8 12 L16 12 Z",
  // Warlord — helmet
  6: "M10 28 Q10 14 18 10 Q26 14 26 28 L24 28 Q24 18 18 14 Q12 18 12 28 Z M10 20 Q8 20 8 24 Q8 28 10 28 M26 20 Q28 20 28 24 Q28 28 26 28",
  // Baron — shield
  7: "M8 8 L28 8 L28 20 Q28 30 18 34 Q8 30 8 20 Z M13 14 L23 14 M18 8 L18 34",
  // Duke — ring
  8: "M18 12 A8 8 0 1 1 17.9 12 M18 12 Q14 12 12 16 Q12 22 18 24 Q24 22 24 16 Q22 12 18 12",
  // Prince — orb + sceptre
  9: "M18 4 A10 10 0 1 1 17.9 4 M18 14 L18 32 M14 30 L22 30 M16 4 L20 4 M10 12 L26 12",
  // The King — crown
  10: "M4 28 L4 18 L10 22 L14 8 L20 14 L20 6 L20 14 L26 8 L30 22 L36 18 L36 28 L30 28 L28 34 L26 28 L20 28 L20 36 L20 28 L14 28 L12 34 L10 28 Z",
};

interface RankMorphProps {
  fromLevel: number;
  toLevel: number;
  size?: number;
  onComplete?: () => void;
  className?: string;
}

export function RankMorph({
  fromLevel,
  toLevel,
  size = 80,
  onComplete,
  className,
}: RankMorphProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const path2Ref = useRef<SVGPathElement>(null);
  const hasRun = useRef(false);

  const fromRank = RANKS[Math.min(fromLevel - 1, RANKS.length - 1)];
  const toRank   = RANKS[Math.min(toLevel   - 1, RANKS.length - 1)];

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const path1 = pathRef.current;
    const path2 = path2Ref.current;
    if (!path1 || !path2) return;

    if (reduced) {
      path1.setAttribute("d", RANK_PATHS[toLevel] ?? RANK_PATHS[10]);
      onComplete?.();
      return;
    }

    // ── anime.js v4 morphTo — real source from juliangarnier/anime ─────────────
    // morphTo(path2, precision) returns a FunctionValue [fromPoints, toPoints]
    // by sampling both paths at equal intervals. Handles unequal point counts.
    animate(path1, {
      d: svg.morphTo(path2, 0.5),
      duration: 800,
      ease:     "spring(1, 80, 10, 0)",
      onComplete: () => {
        onComplete?.();
      },
    });

    // Also animate the color
    animate(path1, {
      stroke:   toRank.color,
      fill:     `${toRank.color}40`,
      duration: 800,
      ease:     "outQuart",
    });
  }, [fromLevel, toLevel, toRank.color, onComplete]);

  const fromPath = RANK_PATHS[fromLevel] ?? RANK_PATHS[1];
  const toPath   = RANK_PATHS[toLevel]   ?? RANK_PATHS[10];

  return (
    <svg
      viewBox="0 0 36 36"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-label={`Rank up to ${toRank.name}`}
    >
      {/* Hidden target path — morphTo reads its `d` attribute */}
      <path
        ref={path2Ref}
        d={toPath}
        style={{ display: "none" }}
      />
      {/* Animated path — starts as fromPath, morphs to toPath */}
      <path
        ref={pathRef}
        d={fromPath}
        stroke={fromRank.color}
        fill={`${fromRank.color}40`}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
