import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

// ─── Chunk-splitting strategy ───────────────────────────────────────────────
// Goal: parallel downloads, long-term caching of stable vendor code, fast FCP.
// The app code itself stays small (~150KB) and loads last.
function manualChunks(id: string) {
  // React core — changes rarely
  if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
    return "vendor-react";
  }
  // Solana stack — heavy but only needed after wallet connect
  if (id.includes("node_modules/@solana") || id.includes("node_modules/buffer/") || id.includes("node_modules/bs58")) {
    return "vendor-solana";
  }
  // Animation libs — framer, gsap, anime, react-spring, ogl
  if (
    id.includes("node_modules/framer-motion") ||
    id.includes("node_modules/gsap") ||
    id.includes("node_modules/animejs") ||
    id.includes("node_modules/@react-spring") ||
    id.includes("node_modules/ogl")
  ) {
    return "vendor-animation";
  }
  // UI primitives — radix, lucide, clsx, cva, tailwind-merge
  if (
    id.includes("node_modules/@radix-ui") ||
    id.includes("node_modules/lucide-react") ||
    id.includes("node_modules/clsx") ||
    id.includes("node_modules/class-variance-authority") ||
    id.includes("node_modules/tailwind-merge")
  ) {
    return "vendor-ui";
  }
  // Node polyfills (buffer/process shims)
  if (id.includes("vite-plugin-node-polyfills") || id.includes("node_modules/process/")) {
    return "vendor-polyfills";
  }
}

export default defineConfig({
  // Relative base so the build loads from ANY host/path — GitHub Pages
  // sub-path, Cloudflare Pages root, custom domains, and Phantom in-app browser.
  base: "./",

  plugins: [
    react(),
    tailwindcss(),
    // @solana/web3.js + wallet adapters expect Node globals (Buffer/process)
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
    // NOTE: cloudflare() plugin removed from default build.
    // It injects wrangler.json into dist/ which breaks GitHub Pages and
    // adds SSR transformations incompatible with static hosting.
    // For Cloudflare Pages deploys, use `npm run deploy` (wrangler handles it).
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    // Target modern browsers only (no IE11 polyfills)
    target: "es2020",
    // Increase warning limit since we're splitting intentionally
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
