import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@usevoice/core": path.resolve(__dirname, "../core/src")
    }
  }
});
