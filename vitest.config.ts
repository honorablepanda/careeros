// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // Run JS/TS React tests in a browser-like DOM
    environment: 'jsdom',
    // Vitest resolves these relative to the config file
    setupFiles: ['web/vitest.setup.ts'],
    // Pick up tests anywhere in the web app
    include: [
      'web/**/*.{test,spec}.{ts,tsx}',
      'apps/web/**/*.{test,spec}.{ts,tsx}', // in case some live under apps/
    ],
    exclude: [
      'node_modules',
      'dist',
      '.next',
      'coverage',
    ],
    globals: true,
    css: true,
    // If you use JSX in .ts files, keep this on
    transformMode: { web: [/\.[jt]sx?$/] },
  },
  // Helpful aliases so imports like "@/..." work in tests
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'web/src'),
      '@careeros/types': path.resolve(__dirname, 'libs/types/src/index.ts'),
      '@careeros/api': path.resolve(__dirname, 'apps/api/src/trpc/root.ts'),
    },
  },
});
