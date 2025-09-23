// web/vitest.config.ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Vite root (for path resolution)
  root: r("./"),

  resolve: {
    alias: [
      // Ensure the TRPC hook imports resolve to our test stub FIRST.
      {
        find: /^@\/(?:lib\/)?trpc(?:\/client|\/react)?$/,
        replacement: r("./test/trpc.stub.ts"),
      },
      { find: /^@\/trpc$/, replacement: r("./test/trpc.stub.ts") },

      // Standard "@" alias to web/src
      { find: "@", replacement: r("./src") },
    ],
  },

  test: {
    // Vitest’s file search root (explicit so globs resolve inside /web)
    root: r("./"),

    environment: "jsdom",
    globals: true,
    clearMocks: true,
    setupFiles: [r("./test/setup-tests.ts")],

    // One simple include that catches specs under both /specs and /src
    include: ["**/*.spec.{ts,tsx}"],

    // Keep e2e and other packages out of this package’s test run
    exclude: [
      "node_modules",
      "dist",
      "build",
      "coverage",

      "**/*.e2e.*",
      "web-e2e/**",
      "api-e2e/**",

      // monorepo siblings
      "../**",
      "../../**",
      "apps/**",
      "packages/**",
      "shared/**",
    ],

    pool: "forks",
  },

  environmentOptions: {
    jsdom: {
      url: "http://localhost",
    },
  },
});
