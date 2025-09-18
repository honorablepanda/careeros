import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  root: __dirname,
  plugins: [react(), tsconfigPaths({ ignoreConfigErrors: true })],
  test: { 
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
    coverage: { reporter: ['text', 'html'], reportsDirectory: './coverage' },
  },
});
