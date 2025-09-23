#!/usr/bin/env node
/* Force a stable Vitest baseline for the web package. */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = process.cwd();
const web = path.join(root, 'web');
const testDir = path.join(web, 'test');
const cfg = path.join(web, 'vitest.config.ts');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function backup(p) {
  if (!fs.existsSync(p)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = p + `.bak.${stamp}`;
  fs.copyFileSync(p, bak);
  return bak;
}
function write(p, s) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, s.replace(/\r\n/g, '\n'), 'utf8');
  console.log('• wrote', path.relative(root, p));
}

if (!fs.existsSync(web)) {
  console.error('web/ not found next to tools/. Are you in repo root?');
  process.exit(1);
}

console.log('→ Backing up current files (if present)…');
const bakCfg = backup(cfg);
const bakSetup = backup(path.join(testDir, 'setup-tests.ts'));
const bakStub = backup(path.join(testDir, 'trpc.stub.ts'));
if (bakCfg) console.log('  -', path.relative(root, bakCfg));
if (bakSetup) console.log('  -', path.relative(root, bakSetup));
if (bakStub) console.log('  -', path.relative(root, bakStub));

console.log('→ Writing baseline files…');

// --- setup-tests.ts (bulletproof)
write(path.join(testDir, 'setup-tests.ts'), `
import { afterEach, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';

// Make React available for any classic-runtime compiled JSX.
(globalThis as any).React = React;

// Sanity: stable URL for code using location/origin.
try {
  const loc: any = globalThis.location;
  if (loc && loc.href === 'about:blank') {
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost'),
      writable: true,
      configurable: true,
    });
  }
} catch { /* ignore */ }

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
`);

// --- trpc.stub.ts (safe mock)
write(path.join(testDir, 'trpc.stub.ts'), `
import { vi } from 'vitest';

// A tiny fake TRPC surface, enough for pages to render.
const fake = {
  tracker: {
    getApplications: {
      useQuery: () => ({ data: [], isLoading: false, error: undefined }),
    },
    addApplication: {
      useMutation: () => ({ mutate: vi.fn() }),
    },
  },
};

// Mock several likely IDs – it's okay if some never resolve.
vi.mock('@/utils/trpc', () => ({ trpc: fake }));
vi.mock('~/utils/trpc', () => ({ trpc: fake }));
vi.mock('@/lib/trpc', () => ({ trpc: fake }));
vi.mock('src/utils/trpc', () => ({ trpc: fake }));
`);

// --- vitest.config.ts (minimal, web-only)
write(cfg, `
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (p: string) => path.resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: {
      '@': r('./src'),
    },
  },
  test: {
    // Limit to the web package only
    include: ['specs/**/*.spec.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'build', 'coverage', '**/*.e2e.*'],
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost' } },
    setupFiles: [r('./test/setup-tests.ts'), r('./test/trpc.stub.ts')],
    globals: true,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Keep logs readable
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
  },
});
`);

// Optional: ensure test script has heap flag (non-destructive)
const pkgPath = path.join(root, 'package.json');
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.scripts = pkg.scripts || {};
  const want = 'cross-env NODE_OPTIONS=--max-old-space-size=6144 vitest run --config web/vitest.config.ts --pool forks';
  if (pkg.scripts['test:web'] !== want) {
    const bakPkg = backup(pkgPath);
    if (bakPkg) console.log('  -', path.relative(root, bakPkg));
    pkg.scripts['test:web'] = want;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log('• updated package.json scripts.test:web');
  }
} catch {
  // ignore if package.json shape is different
}

// Optional: run tests if asked
if (process.argv.includes('--run-tests')) {
  console.log('→ Clearing Vitest cache…');
  try { cp.execSync('pnpm -w dlx rimraf web/node_modules/.vitest', { stdio: 'inherit' }); } catch {}

  console.log('→ Running tests with 6GB heap, pool=forks…');
  cp.execSync('pnpm -w test:web', { stdio: 'inherit' });
}
console.log('✅ Baseline written.');
