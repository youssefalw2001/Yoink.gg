import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

// NOTE: Do NOT add manualChunks here. Manually splitting the Buffer/process
// polyfills away from the Solana stack breaks runtime initialization order,
// causing `toBase58()` (bs58 → Buffer) to crash with a ".slice of undefined"
// error the moment a wallet connects. Let Rollup chunk automatically.
export default defineConfig({
  // Relative base so the build loads from ANY host/path — GitHub Pages
  // sub-path, Render, Cloudflare, custom domains, and Phantom in-app browser.
  base: "./",

  plugins: [
    react(),
    tailwindcss(),
    // @solana/web3.js + wallet adapters expect Node globals (Buffer/process)
    // in the browser. Polyfill them so real wallet connection works.
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
