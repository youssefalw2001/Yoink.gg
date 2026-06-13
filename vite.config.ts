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
 *   - animation libs      (framer-motion, gsap, animejs, ogl, react-spring)
 * These cache independently across deploys and shrink the entry chunk,
 * while the Solana + polyfill init order stays identical to the working build.
 */
function manualChunks(id: string) {
  if (
    id.includes("node_modules/react-dom") ||
    id.includes("node_modules/react/") ||
    id.includes("node_modules/scheduler/")
  ) {
    return "react";
  }
  if (
    id.includes("node_modules/framer-motion") ||
    id.includes("node_modules/gsap") ||
    id.includes("node_modules/animejs") ||
    id.includes("node_modules/ogl") ||
    id.includes("node_modules/@react-spring")
  ) {
    return "animation";
  }
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

  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks },
    },
  },
});
