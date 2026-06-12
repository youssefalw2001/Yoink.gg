import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

// GitHub Pages serves the site at https://<user>.github.io/<repo>/
// The base must match the repo name exactly.
export default defineConfig({
  // Relative base so the build loads from ANY host/path — GitHub Pages
  // sub-path, Cloudflare Pages root, custom domains, and the Phantom in-app
  // browser alike. Absolute "/Yoink.gg/" 404'd assets off GitHub Pages → blank.
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
