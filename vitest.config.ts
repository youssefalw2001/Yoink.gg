import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Test-only config. Resolves the "@" alias the same way the app's vite.config
 * does, but deliberately omits the app build plugins (react/tailwind/node
 * polyfills) so the pure-logic test suite runs fast in a plain Node environment.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
