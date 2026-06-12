/**
 * YOINK.GG — OGL WebGL King Card Background Shader
 *
 * A small WebGL canvas rendered behind the KingCard content.
 * Produces a swirling phantom/gold vortex that reacts to:
 *   - `isYou` → gold palette
 *   - `critical` → blood red shift
 *   - `kingChanged` → burst of energy on king change
 *
 * OGL pattern: Renderer + Program + Triangle mesh, same as AuroraShader.
 * GPU-only. Zero React re-renders affect the shader — uniforms updated
 * directly in the rAF loop.
 *
 * Source reference: oframe/ogl examples/triangle-screen-shader.html
 */

import { useEffect, useRef } from "react";

interface KingCardShaderProps {
  isYou: boolean;
  critical: boolean;
  kingKey: string;   // changes when king changes — triggers burst
  theme?: string;    // 'theme_blood' | 'theme_phantom' | 'crown_animated'
  className?: string;
}

const VERT = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uIsYou;
uniform float uCritical;
uniform float uBurst;
uniform float uTheme;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5);
}
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}

void main() {
  vec2 uv = vUv - 0.5;
  float d = length(uv);
  float t = uTime;

  // Swirl angle driven by fbm-like stacking
  float angle = atan(uv.y, uv.x);
  float swirl = angle + t * 0.4 + noise(uv * 3.0 + t * 0.2) * 1.5;
  float ring  = smoothstep(0.45, 0.55, abs(sin(swirl * 3.0 + d * 6.0)));

  // Base dark void
  vec3 col = vec3(0.03, 0.03, 0.07);

  // Phantom pool
  vec3 phantom = vec3(0.44, 0.0, 1.0);
  vec3 gold    = vec3(1.0, 0.84, 0.0);
  vec3 blood   = vec3(1.0, 0.13, 0.0);

  vec3 primary = mix(phantom, gold, uIsYou);
  primary      = mix(primary, blood, uCritical);

  // Theme cosmetic override — blood=1, phantom=2, crown/gold=3
  // Critical (blood) state always takes priority over any theme
  float useTheme = step(0.5, uTheme) * (1.0 - uCritical);
  vec3 themeCol  = blood;
  themeCol       = mix(themeCol, phantom, step(1.5, uTheme));
  themeCol       = mix(themeCol, gold,    step(2.5, uTheme));
  primary        = mix(primary, themeCol, useTheme);

  col += primary * ring * 0.25;
  col += primary * smoothstep(0.5, 0.0, d) * 0.12;

  // Burst flash on king change
  col += primary * uBurst * (1.0 - d * 2.0) * 0.4;

  // Vignette — transparent at edges so card content stays readable
  float vig = 1.0 - smoothstep(0.3, 0.6, d);
  col *= vig;

  gl_FragColor = vec4(col, vig * 0.85);
}
`;

export function KingCardShader({ isYou, critical, kingKey, theme, className }: KingCardShaderProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef(0);
  const burstRef   = useRef(0);
  const isYouRef   = useRef(isYou ? 1 : 0);
  const critRef    = useRef(critical ? 1 : 0);
  const prevKey    = useRef(kingKey);

  const THEME_MAP: Record<string, number> = { theme_blood: 1, theme_phantom: 2, crown_animated: 3 };
  const themeRef   = useRef(THEME_MAP[theme ?? ""] ?? 0);

  // Track smooth uniform targets
  useEffect(() => { isYouRef.current = isYou ? 1 : 0; }, [isYou]);
  useEffect(() => { critRef.current = critical ? 1 : 0; }, [critical]);
  useEffect(() => { themeRef.current = THEME_MAP[theme ?? ""] ?? 0; }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (kingKey !== prevKey.current) {
      prevKey.current = kingKey;
      burstRef.current = 1.0; // trigger burst
    }
  }, [kingKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true, antialias: false, depth: false, premultipliedAlpha: false,
      powerPreference: "low-power",
    }) as WebGLRenderingContext | null;
    if (!gl) return;

    function mkShader(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src); gl!.compileShader(s); return s;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);

    const pos = new Float32Array([-1,-1, 3,-1, -1,3]);
    const uvs = new Float32Array([0,0, 2,0, 0,2]);
    const bindBuf = (data: Float32Array, name: string) => {
      const b = gl!.createBuffer()!;
      gl!.bindBuffer(gl!.ARRAY_BUFFER, b);
      gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
      const loc = gl!.getAttribLocation(prog, name);
      gl!.enableVertexAttribArray(loc);
      gl!.vertexAttribPointer(loc, 2, gl!.FLOAT, false, 0, 0);
    };
    bindBuf(pos, "position"); bindBuf(uvs, "uv");

    const uTime    = gl.getUniformLocation(prog, "uTime");
    const uIsYou   = gl.getUniformLocation(prog, "uIsYou");
    const uCritical = gl.getUniformLocation(prog, "uCritical");
    const uBurst   = gl.getUniformLocation(prog, "uBurst");
    const uTheme   = gl.getUniformLocation(prog, "uTheme");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let iSmooth = 0, cSmooth = 0, bSmooth = 0;
    let lastW = 0, lastH = 0;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const tick = (t: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (mq.matches) return;
      iSmooth += (isYouRef.current - iSmooth) * 0.08;
      cSmooth += (critRef.current  - cSmooth) * 0.08;
      bSmooth += (burstRef.current - bSmooth) * 0.12;
      burstRef.current *= 0.92; // decay burst

      // Only resize/reallocate the drawing buffer when the element actually
      // changed size. Doing this every frame forced a layout reflow + GPU
      // buffer realloc 60×/sec — the main source of Arena jank.
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w !== lastW || h !== lastH) {
        lastW = w;
        lastH = h;
        canvas.width  = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }

      gl.uniform1f(uTime,     t * 0.001);
      gl.uniform1f(uIsYou,    iSmooth);
      gl.uniform1f(uCritical, cSmooth);
      gl.uniform1f(uBurst,    bSmooth);
      gl.uniform1f(uTheme,    themeRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      gl.deleteProgram(prog);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full rounded-[24px] ${className ?? ""}`}
      aria-hidden
    />
  );
}
