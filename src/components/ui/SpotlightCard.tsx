/**
 * SpotlightCard — ported directly from Aceternity UI's card-spotlight pattern.
 * Uses useMotionValue + useMotionTemplate to track the mouse and paint a
 * radial-gradient reveal mask that follows the cursor, exactly as seen on
 * Aceternity's Card Spotlight component.
 *
 * Source reference: ui.aceternity.com/components/card-spotlight
 * Ported to TypeScript / Tailwind v4 / Vite (no Next.js required).
 */

import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  /** radius of the spotlight in px */
  radius?: number;
}

export function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(112, 0, 255, 0.18)",
  radius = 320,
}: SpotlightCardProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // The radial mask that follows the cursor — pure Aceternity pattern
  const background = useMotionTemplate`
    radial-gradient(
      ${radius}px circle at ${mouseX}px ${mouseY}px,
      ${spotlightColor},
      transparent 80%
    )
  `;

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  }

  function handleMouseLeave() {
    // Smoothly fade spotlight back to center on leave
    mouseX.set(-radius);
    mouseY.set(-radius);
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn("group/spotlight relative", className)}
    >
      {/* Spotlight layer — only opacity ever changes, transform drives position */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/spotlight:opacity-100"
        style={{ background }}
        aria-hidden
      />
      {children}
    </div>
  );
}
