/**
 * YOINK.GG — Anime.js v4 Animated KingAvatar
 *
 * Wraps the deterministic SVG face (KingAvatar) with an
 * anime.js timeline that sequentially reveals the face parts:
 *
 *   1. Hair  → scale + fade from above (200ms)
 *   2. Face  → scale from center (250ms, spring)
 *   3. Eyes  → pop in (150ms each, stagger)
 *   4. Mouth → draw in (100ms)
 *   5. Accessory → slide in (120ms)
 *   6. Crown → drop from top (200ms, spring bounce)
 *
 * Used in KingCard when a new king takes over.
 * The `walletKey` prop changing triggers a fresh animation sequence.
 *
 * Source: anime.js timeline (createTimeline) API
 */

import { useEffect, useRef } from "react";
import { createTimeline, stagger } from "animejs";
import { KingAvatar } from "./KingAvatar";

interface AnimatedKingAvatarProps {
  wallet: string;
  size?: number;
  isKing?: boolean;
  critical?: boolean;
  className?: string;
}

export function AnimatedKingAvatar({
  wallet,
  size = 88,
  isKing = true,
  critical = false,
  className,
}: AnimatedKingAvatarProps) {
  const wrapRef   = useRef<HTMLDivElement>(null);
  const prevWallet = useRef(wallet);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Only animate on wallet change (new king) or initial mount
    const isNew = wallet !== prevWallet.current;
    prevWallet.current = wallet;

    if (!isNew && wrap.dataset.animated === "true") return;
    wrap.dataset.animated = "true";

    const svg = wrap.querySelector("svg");
    if (!svg) return;

    // ── Select face parts by type ────────────────────────────────────────────
    const hair        = svg.querySelectorAll("path:not([d*='34']), rect[rx]");
    const face        = svg.querySelector("ellipse[rx='22']");
    const eyes        = svg.querySelectorAll("ellipse[rx='4.5'], ellipse[rx='2.5'], circle[r='0.9']");
    const eyebrows    = svg.querySelectorAll("path[d*='40']");
    const mouth       = svg.querySelectorAll("path[d*='56']");
    const accessories = svg.querySelectorAll("path[d*='43'], path[d*='62'], circle[cx='24']");
    const crown       = svg.querySelectorAll("path[d*='26 34'], circle[cx='44'][cy='18']");

    // Start all invisible
    const allParts = [hair, face, eyes, eyebrows, mouth, accessories, crown]
      .flatMap((nl) => nl ? Array.from(nl as NodeListOf<Element>) : []);
    allParts.forEach((el) => ((el as HTMLElement).style.opacity = "0"));

    // anime.js timeline — sequential face reveal
    const tl = createTimeline({ defaults: { ease: "outExpo" } });

    if (hair.length) {
      tl.add(hair, { opacity: [0, 1], translateY: [-4, 0], duration: 200 }, 0);
    }
    if (face) {
      tl.add(face, { opacity: [0, 1], scale: [0.6, 1], duration: 250, ease: "spring(1,80,10,0)" }, 100);
    }
    if (eyes.length) {
      tl.add(eyes, { opacity: [0, 1], scale: [0, 1], duration: 150, delay: stagger(20) }, 300);
    }
    if (eyebrows.length) {
      tl.add(eyebrows, { opacity: [0, 1], translateY: [-3, 0], duration: 120 }, 380);
    }
    if (mouth.length) {
      tl.add(mouth, { opacity: [0, 1], scaleX: [0, 1], duration: 100 }, 440);
    }
    if (accessories.length) {
      tl.add(accessories, { opacity: [0, 1], translateX: [-5, 0], duration: 120 }, 480);
    }
    if (crown.length) {
      tl.add(crown, { opacity: [0, 1], translateY: [-8, 0], scale: [0.5, 1], duration: 200, ease: "spring(1,100,12,0)" }, 500);
    }
  }, [wallet]);

  return (
    <div ref={wrapRef} className={`inline-block ${className ?? ""}`}>
      <KingAvatar
        wallet={wallet}
        size={size}
        isKing={isKing}
        critical={critical}
      />
    </div>
  );
}
