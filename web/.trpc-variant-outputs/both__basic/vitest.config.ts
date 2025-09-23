import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

const trpcStub = path.resolve(__dirname, './test/trpc.stub.ts');

export default defineConfig({
  plugins: [
    tsconfigPaths(),
  ],
  resolve: {
    alias: [
      { find: /^@\/trpc$/, replacement: trpcStub },
      { find: /^@\/trpc\/react$/, replacement: trpcStub },
      { find: /^@careeros\/trpc$/, replacement: trpcStub },
    ],
  },
  test: {
    environment: 'jsdom',
    alias: [
      { find: /^@\/trpc$/, replacement: trpcStub },
      { find: /^@\/trpc\/react$/, replacement: trpcStub },
      { find: /^@careeros\/trpc$/, replacement: trpcStub },
    ],
  },
});
