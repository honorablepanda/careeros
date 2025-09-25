/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname),
  test: {
    environment: "jsdom",
    globals: true,
    css: true,
    include: [
      "**/*.{test,spec}.{ts,tsx}",
      "src/**/*.{test,spec}.{ts,tsx}",
      "app/**/*.{test,spec}.{ts,tsx}",
      "specs/**/*.{test,spec}.{ts,tsx}",
      "test/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: [
      "node_modules",
      "dist",
      "build",
      "coverage",
      "**/*.e2e.*",
      "web-e2e/**",
      "api-e2e/**",
    ],
    setupFiles: [path.resolve(__dirname, "vitest.setup.ts")],
    pool: "forks",
    reporters: ["default"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
