// web/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';

const rootDir = __dirname;
const SRC = path.resolve(rootDir, 'src');
const trpcStub = path.resolve(rootDir, 'test/trpc.stub.ts');

const aliasForSrc = [{ find: /^@\//, replacement: `${SRC}/` }];
const aliasForTrpcStub = [
  { find: /^@\/trpc$/, replacement: trpcStub },
  { find: /^@\/trpc\/react$/, replacement: trpcStub },
  { find: /^@careeros\/trpc$/, replacement: trpcStub },
];

export default defineConfig({
  // 👉 make Vitest treat "web/" as the project root
  root: rootDir,

  plugins: [
    react(),
    // keep explicit aliases first; tsconfig paths acts as a fallback
    tsconfigPaths(),
  ],

  resolve: {
    alias: [...aliasForSrc, ...aliasForTrpcStub],
  },

  test: {
    environment: 'jsdom',
    // 👉 absolute path so it doesn’t try to load at repo root
    setupFiles: [path.resolve(rootDir, 'test/setup-tests.ts')],
    alias: [...aliasForSrc, ...aliasForTrpcStub],
    globals: true,
    css: true,
    // limit to web tests only
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'specs/**/*.{test,spec}.{ts,tsx}',
    ],
  },
});
