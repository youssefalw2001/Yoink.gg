/**
 * YOINK.GG — OGL WebGL Aurora Shader
 *
 * Replaces CSS body::before/after aurora pools with a real GLSL
 * fragment shader rendered on a full-screen triangle via OGL.
 *
 * The shader produces:
 *   • Two layered void/gold/phantom aurora pools with fractal noise
 *   • Reacts to the `danger` prop — aurora shifts to blood red
 *   • Smooth uniform lerp between states (0.06 per frame)
 *
 * GPU rules observed:
 *   • Full-screen triangle (OGL pattern) — 3 vertices, zero indexed geometry
 *   • Canvas: pointer-events none, z-index 0, position fixed
 *   • powerPreference: low-power — YOINK is a 2D game, not a 3D demo
 *   • prefers-reduced-motion: pauses the rAF loop, canvas stays on last frame
 *   • Graceful fallback: if WebGL unavailable, CSS aurora (body::before/after)
 *     remains visible — SceneBackground still renders the CSS layers
 *
 * Source reference:
 *   OGL triangle shader: github.com/oframe/ogl/examples/triangle-screen-shader.html
 *   GLSL fbm noise: iquilezles.org/articles/morenoise
 */

import { useEffect, useRef } from "react";

interface AuroraShaderProps {
  danger?: boolean;
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
uniform float uDanger;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1,0)), f.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y
  );
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}
float pool(vec2 uv, vec2 c, float r, float t, float s) {
  vec2 d = uv - c;
  d += fbm(uv * 2.2 + vec2(t * s, t * s * 0.7)) * 0.22;
  return smoothstep(r, 0.0, length(d));
}

void main() {
  vec2 uv = vUv;
  float t = uTime * 0.18;
  vec3 col = vec3(0.031, 0.031, 0.059);

  vec3 phantom = mix(vec3(0.44, 0.0, 1.0),   vec3(1.0, 0.13, 0.0), uDanger);
  vec3 gold    = mix(vec3(1.0,  0.84, 0.0),  vec3(0.8, 0.1,  0.0), uDanger * 0.6);
  vec3 indigo  = mix(vec3(0.27, 0.0, 0.8),   vec3(0.6, 0.0,  0.0), uDanger);
  vec3 dgold   = mix(vec3(1.0,  0.6, 0.0),   vec3(0.9, 0.05, 0.0), uDanger * 0.5);

  col += phantom * pool(uv, vec2(0.15, 0.82), 0.55, t,       0.8 ) * 0.28;
  col += gold    * pool(uv, vec2(0.88, 0.18), 0.52, t * 0.9, -0.6) * 0.18;
  col += indigo  * pool(uv, vec2(0.60 + sin(t * 0.3) * 0.08, 0.55), 0.38, t * 1.1, 0.5) * 0.12;
  col += dgold   * pool(uv, vec2(0.22, 0.12), 0.30, t * 0.7, -0.9) * 0.09;

  vec2 vig = uv * 2.0 - 1.0;
  col *= 1.0 - dot(vig, vig) * 0.35;

  gl_FragColor = vec4(col, 1.0);
}
`;

export function AuroraShader({ danger = false }: AuroraShaderProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);
  const dangerRef  = useRef(0);

  useEffect(() => { dangerRef.current = danger ? 1 : 0; }, [danger]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: "low-power",
    }) as WebGLRenderingContext | null;
    if (!gl) return;

    // compile
    function shader(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src); gl!.compileShader(s); return s;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // full-screen triangle (OGL pattern)
    const pos = new Float32Array([-1,-1, 3,-1, -1,3]);
    const uvs = new Float32Array([0,0, 2,0, 0,2]);
    const bind = (data: Float32Array, name: string) => {
      const buf = gl!.createBuffer()!;
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buf);
      gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
      const loc = gl!.getAttribLocation(prog, name);
      gl!.enableVertexAttribArray(loc);
      gl!.vertexAttribPointer(loc, 2, gl!.FLOAT, false, 0, 0);
    };
    bind(pos, "position");
    bind(uvs, "uv");

    const uTime   = gl.getUniformLocation(prog, "uTime");
    const uDanger = gl.getUniformLocation(prog, "uDanger");

    const resize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener("resize", resize); resize();

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dSmooth = 0;
    const tick = (t: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (mq.matches) return;
      dSmooth += (dangerRef.current - dSmooth) * 0.06;
      gl.uniform1f(uTime, t * 0.001);
      gl.uniform1f(uDanger, dSmooth);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(prog);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[0]"
      aria-hidden
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
