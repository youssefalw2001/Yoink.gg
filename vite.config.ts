import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

/**
 * SAFE chunk splitting — speed without breaking wallet connect.
 *
 * HARD RULE: NEVER split the Node polyfills (Buffer / process), bs58, or
 * @solana into separate chunks. Doing so breaks runtime init order and
 * crashes publicKey.toBase58() with a ".slice of undefined" error on connect.
 * Those MUST stay in the main entry chunk together (they fall through here).
 *
 * We ONLY split libraries that have ZERO dependency on Node globals at init:
 *   - react / react-dom  (universally safe to split)
 *   - animation libs      (framer-motion, gsap, animejs, react-spring)
 * These cache independently across deploys and shrink the entry chunk,
 * while the Solana + polyfill init order stays identical to the working build.
 *
 * ── WHY THE ANIMATION LIBS ARE SPLIT INDIVIDUALLY ───────────────────────────
 *
 * These used to share a single "animation" chunk. That silently defeated all
 * route-level code splitting: `framer-motion` is imported by ~41 modules
 * including App.tsx, so the combined chunk was always fetched on first paint —
 * and it dragged `gsap` and `@react-spring/web` along with it, even though
 * their only consumers (ShopScreen, WinReveal, BagAmount) are lazy.
 *
 * A shared manual chunk is only ever as lazy as its most eager member. Giving
 * each library its own chunk lets Rollup load it exactly when a route that
 * needs it is actually requested. `rough-notation` is named here for the same
 * reason: its sole consumer is BagAmount, behind the disabled Bag feature.
 */
function manualChunks(id: string) {
  if (
    id.includes("node_modules/react-dom") ||
    id.includes("node_modules/react/") ||
    id.includes("node_modules/scheduler/")
  ) {
    return "react";
  }
  // Eager: used by ~41 modules including the app shell.
  if (id.includes("node_modules/framer-motion")) return "framer-motion";
  // Lazy: each of these has only code-split consumers, so each gets its own
  // chunk and is fetched on demand rather than on first paint.
  if (id.includes("node_modules/gsap")) return "gsap";
  if (id.includes("node_modules/@react-spring")) return "react-spring";
  if (id.includes("node_modules/rough-notation")) return "rough-notation";
  if (id.includes("node_modules/animejs")) return "animejs";
  // EVERYTHING ELSE (solana, buffer, process, polyfills, app code) stays in
  // the entry chunk so polyfill globals initialize before Solana uses them.
}

export default defineConfig({
  // Relative base so the build loads from ANY host — GitHub Pages sub-path,
  // Render, Cloudflare, custom domains, and the Phantom in-app browser.
  base: "./",

  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // keepNames preserves function/component names through minification so
  // error stacks + React component stacks are readable in production
  // (instead of cryptic single-letter names like "c.slice").
  esbuild: {
    keepNames: true,
  },

  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks },
    },
  },
});
