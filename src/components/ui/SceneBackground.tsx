/**
 * SceneBackground — upgraded global atmosphere layer.
 *
 * Layers (bottom → top):
 *   <AuroraShader>  — OGL WebGL GLSL fragment shader (real GPU aurora)
 *   .scene-vignette — darkens corners
 *   .scene-scanlines — subtle CRT lines (hidden on mobile)
 *   .scene-danger   — red edge pulse in endgame
 *
 * If WebGL is unavailable the canvas renders nothing and the
 * CSS body::before/after aurora (defined in index.css) remains
 * visible as automatic fallback.
 */

import { AuroraShader } from "./AuroraShader";

interface SceneBackgroundProps {
  danger?: boolean;
}

export function SceneBackground({ danger = false }: SceneBackgroundProps) {
  return (
    <>
      {/* OGL WebGL aurora — replaces CSS body::before/after */}
      <AuroraShader danger={danger} />

      {/* vignette, scanlines, danger glow */}
      <div className="scene-vignette" aria-hidden />
      <div className="scene-scanlines" aria-hidden />
      <div className="scene-danger" data-active={String(danger)} aria-hidden />
    </>
  );
}
