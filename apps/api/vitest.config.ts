import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  root: __dirname,
  plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.ts'],
    passWithNoTests: true,
    coverage: { reporter: ['text', 'html'], reportsDirectory: './coverage' },
  },
});
