/**
 * SceneBackground — global atmosphere layer.
 *
 * Layers (bottom → top):
 *   body::before / ::after  — aurora pools (pure CSS, defined in index.css)
 *   <Meteors>               — Aceternity meteor streaks (transform + opacity only)
 *   .scene-vignette         — darkens corners
 *   .scene-scanlines        — subtle CRT lines
 *   .scene-danger           — red edge pulse in endgame
 */

import { Meteors } from "./Meteors";

interface SceneBackgroundProps {
  danger?: boolean;
}

export function SceneBackground({ danger = false }: SceneBackgroundProps) {
  return (
    <>
      {/* Aceternity-style meteor streaks — z-index 0, behind UI */}
      <div className="pointer-events-none fixed inset-0 z-[0] overflow-hidden" aria-hidden>
        <Meteors number={18} />
      </div>

      {/* vignette, scanlines, danger glow */}
      <div className="scene-vignette" aria-hidden />
      <div className="scene-scanlines" aria-hidden />
      <div className="scene-danger" data-active={String(danger)} aria-hidden />
    </>
  );
}
