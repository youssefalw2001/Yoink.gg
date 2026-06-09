/**
 * YOINK.GG — Anime.js v4 Animated Brand Icons
 *
 * Wraps the BrandIcons SVGs with anime.js createDrawable() so they
 * draw themselves on first mount.
 *
 * Works for any SVG path by:
 *   1. Finding all <path>, <line>, <circle>, <polyline> inside the SVG
 *   2. Creating drawable proxies for each
 *   3. Animating draw 0→1 with staggered delay
 *
 * API: drop-in replacement for BrandIcons — same props.
 *
 * Source: juliangarnier/anime/src/svg/drawable.js (createDrawable)
 */

import { useEffect, useRef } from "react";
import { animate, createDrawable, stagger } from "animejs";
import { BRAND_ICONS } from "./BrandIcons";

type IconName = keyof typeof BRAND_ICONS;

interface AnimatedBrandIconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  /** Trigger re-draw on value change (e.g. active state) */
  trigger?: string | number | boolean;
}

export function AnimatedBrandIcon({
  name,
  size = 24,
  color = "currentColor",
  className,
  trigger,
}: AnimatedBrandIconProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hasDrawn = useRef(false);
  const prevTrigger = useRef(trigger);

  const Icon = BRAND_ICONS[name];

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const isRetrigger = trigger !== prevTrigger.current;
    prevTrigger.current = trigger;

    if (hasDrawn.current && !isRetrigger) return;
    hasDrawn.current = true;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    // Select all drawable SVG geometry elements
    const elements = wrap.querySelectorAll(
      "path, line, circle, polyline, rect, ellipse"
    );
    if (!elements.length) return;

    const drawables = createDrawable(elements as unknown as NodeListOf<SVGGeometryElement>, 0, 0);

    animate(drawables, {
      draw:     ["0 0", "0 1"],
      duration: 500,
      ease:     "outExpo",
      delay:    stagger(40),
    });
  }, [trigger]);

  return (
    <div ref={wrapRef} className={`inline-flex items-center justify-center ${className ?? ""}`}>
      <Icon size={size} color={color} />
    </div>
  );
}

/**
 * AnimatedNavIcon — used in the header nav.
 * Draws on mount (first load) and re-draws when `active` changes.
 */
export function AnimatedNavIcon({
  name,
  size = 16,
  color,
  active = false,
}: {
  name: IconName;
  size?: number;
  color?: string;
  active?: boolean;
}) {
  return (
    <AnimatedBrandIcon
      name={name}
      size={size}
      color={color ?? (active ? "#FFD700" : "currentColor")}
      trigger={active ? "active" : "inactive"}
    />
  );
}
