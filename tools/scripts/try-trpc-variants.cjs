#!/usr/bin/env node
/* tools/scripts/try-trpc-variants.cjs
 *
 * Tries several variants of web/vitest.config.ts and web/test/trpc.stub.ts,
 * runs the alias checker + web tests, logs results, and restores originals.
 *
 * Usage:
 *   node tools/scripts/try-trpc-variants.cjs
 *
 * Optional:
 *   APPLY_BEST=1 node tools/scripts/try-trpc-variants.cjs   // keeps the first fully passing combo
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const WEB_DIR = path.join(ROOT, 'web');
const VITEST_CONFIG = path.join(WEB_DIR, 'vitest.config.ts');
const TRPC_STUB = path.join(WEB_DIR, 'test', 'trpc.stub.ts');

const REPORT_PATH = path.join(ROOT, 'trpc-variants-report.json');
const VARIANTS_DIR = path.join(WEB_DIR, '.trpc-variant-outputs');

const APPLY_BEST = process.env.APPLY_BEST === '1';

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function writeFileEnsured(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}
function run(cmd, opts = {}) {
  try {
    const out = execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', ...opts });
    return { ok: true, code: 0, stdout: out, stderr: '' };
  } catch (err) {
    return {
      ok: false,
      code: err.status ?? 1,
      stdout: err.stdout?.toString?.() ?? '',
      stderr: err.stderr?.toString?.() ?? (err.message || ''),
    };
  }
}
function shortErr(s, max = 10) {
  if (!s) return '';
  const lines = s.split(/\r?\n/).filter(Boolean);
  return lines.slice(0, max).join('\n');
}

function vitestConfigTemplate({ aliasPlacement }) {
  // aliasPlacement: 'resolve' | 'test' | 'both'
  const putResolve = aliasPlacement === 'resolve' || aliasPlacement === 'both';
  const putTest = aliasPlacement === 'test' || aliasPlacement === 'both';

  const resolveAliases = putResolve
    ? `alias: [
      { find: /^@\\/trpc$/, replacement: trpcStub },
      { find: /^@\\/trpc\\/react$/, replacement: trpcStub },
      { find: /^@careeros\\/trpc$/, replacement: trpcStub },
    ],`
    : '';

  const testAliases = putTest
    ? `alias: [
      { find: /^@\\/trpc$/, replacement: trpcStub },
      { find: /^@\\/trpc\\/react$/, replacement: trpcStub },
      { find: /^@careeros\\/trpc$/, replacement: trpcStub },
    ],`
    : '';

  return `import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

const trpcStub = path.resolve(__dirname, './test/trpc.stub.ts');

export default defineConfig({
  plugins: [
    tsconfigPaths(),
  ],
  resolve: {
    ${resolveAliases}
  },
  test: {
    environment: 'jsdom',
    ${testAliases}
  },
});
`;
}

function trpcStubBasic() {
  return `// web/test/trpc.stub.ts — basic stub
type UseQuery<T> = { data: T | undefined; isLoading: boolean; error: unknown };
type UseMut = { mutate: (..._args: any[]) => void; isLoading: boolean; error: unknown };

const noop = () => {};

export const trpc = {
  settings: {
    get: {
      useQuery: (): UseQuery<{
        theme: 'light' | 'dark';
        timezone: string;
        notificationsEnabled: boolean;
        emailFrequency: 'daily' | 'weekly' | 'off';
      }> => ({
        data: {
          theme: 'light',
          timezone: 'UTC',
          notificationsEnabled: true,
          emailFrequency: 'weekly',
        },
        isLoading: false,
        error: null,
      }),
    },
    update: {
      useMutation: (): UseMut => ({ mutate: noop, isLoading: false, error: null }),
    },
  },
} as const;

export default trpc;
`;
}

function trpcStubRicher() {
  return `// web/test/trpc.stub.ts — richer stub (adds no-op routers)
type UseQuery<T> = { data: T | undefined; isLoading: boolean; error: unknown };
type UseMut = { mutate: (..._args: any[]) => void; isLoading: boolean; error: unknown };
const uq = <T>(data: T): UseQuery<T> => ({ data, isLoading: false, error: null });
const um = (): UseMut => ({ mutate: () => {}, isLoading: false, error: null });

export const trpc = {
  settings: {
    get: { useQuery: () => uq({ theme: 'light', timezone: 'UTC', notificationsEnabled: true, emailFrequency: 'weekly' }) },
    update: { useMutation: um },
  },
  // Add a few harmless defaults used elsewhere, in case a test touches them:
  dashboard: { get: { useQuery: () => uq({}) } },
  metrics: { get: { useQuery: () => uq({}) } },
  notifications: { list: { useQuery: () => uq([]) } },
  planner: { list: { useQuery: () => uq([]) } },
  achievements: { list: { useQuery: () => uq([]) } },
  interviews: { list: { useQuery: () => uq([]) } },
  skills: { list: { useQuery: () => uq([]) } },
  profile: { get: { useQuery: () => uq({ name: 'Test', email: 'test@example.com' }) } },
  applications: { list: { useQuery: () => uq([]) } },
  tracker: { list: { useQuery: () => uq([]) } },
} as const;

export default trpc;
`;
}

const VITEST_VARIANTS = [
  { key: 'resolve-only', aliasPlacement: 'resolve' },
  { key: 'test-only', aliasPlacement: 'test' },
  { key: 'both', aliasPlacement: 'both' },
];

const STUB_VARIANTS = [
  { key: 'basic', builder: trpcStubBasic },
  { key: 'richer', builder: trpcStubRicher },
];

function saveVariantFiles(name, vitestConfig, trpcStub) {
  const dir = path.join(VARIANTS_DIR, name);
  writeFileEnsured(path.join(dir, 'vitest.config.ts'), vitestConfig);
  writeFileEnsured(path.join(dir, 'trpc.stub.ts'), trpcStub);
}

function main() {
  console.log('▶ try-trpc-variants');
  const start = Date.now();

  // Backups
  const vitestOrig = readFileSafe(VITEST_CONFIG);
  const stubOrig = readFileSafe(TRPC_STUB);
  if (!vitestOrig) {
    console.error(`✗ Cannot read ${VITEST_CONFIG}. Aborting.`);
    process.exit(2);
  }
  if (!stubOrig) {
    console.error(`✗ Cannot read ${TRPC_STUB}. Aborting.`);
    process.exit(2);
  }

  fs.mkdirSync(VARIANTS_DIR, { recursive: true });

  const results = [];
  let kept = null;

  for (const v of VITEST_VARIANTS) {
    for (const s of STUB_VARIANTS) {
      const comboKey = `${v.key}__${s.key}`;
      console.log(`\n— Variant: ${comboKey} —`);

      const vitestConf = vitestConfigTemplate({ aliasPlacement: v.aliasPlacement });
      const stubConf = s.builder();

      // Save copies for inspection
      saveVariantFiles(comboKey, vitestConf, stubConf);

      // Write into place
      writeFileEnsured(VITEST_CONFIG, vitestConf);
      writeFileEnsured(TRPC_STUB, stubConf);

      // Run checks
      const t0 = Date.now();
      const check = run('node tools/scripts/check-trpc-alias.cjs');
      const t1 = Date.now();
      const tests = run('pnpm -w test:web');

      const ok = check.ok && tests.ok;
      results.push({
        variant: comboKey,
        aliasPlacement: v.aliasPlacement,
        stub: s.key,
        check_ok: check.ok,
        test_ok: tests.ok,
        check_code: check.code,
        test_code: tests.code,
        elapsed_ms: { check: t1 - t0, test: Date.now() - t1 },
        check_stdout: check.stdout,
        check_stderr: shortErr(check.stderr),
        test_stdout: shortErr(tests.stdout, 50),
        test_stderr: shortErr(tests.stderr, 50),
      });

      console.log(`  check-trpc-alias: ${check.ok ? '✓ PASS' : '✗ FAIL'}`);
      if (!check.ok) console.log(shortErr(check.stdout || check.stderr, 8));
      console.log(`  test:web        : ${tests.ok ? '✓ PASS' : '✗ FAIL'}`);
      if (!tests.ok) console.log(shortErr(tests.stdout || tests.stderr, 12));

      if (!kept && APPLY_BEST && ok) {
        kept = comboKey;
        console.log(`  → APPLY_BEST=1 specified; keeping variant ${comboKey}`);
      }
    }
  }

  // Restore originals unless APPLY_BEST kept one
  if (!APPLY_BEST || !kept) {
    writeFileEnsured(VITEST_CONFIG, vitestOrig);
    writeFileEnsured(TRPC_STUB, stubOrig);
    console.log('\nRestored original vitest.config.ts and trpc.stub.ts');
  } else {
    console.log(`\nKept variant in-place: ${kept}`);
  }

  // Persist report
  writeFileEnsured(REPORT_PATH, JSON.stringify({
    started_at: new Date(start).toISOString(),
    finished_at: new Date().toISOString(),
    root: ROOT,
    variants_dir: VARIANTS_DIR,
    apply_best: !!APPLY_BEST,
    kept,
    results,
  }, null, 2));

  // Pretty summary
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  console.log('\nSummary:');
  console.log(pad('Variant', 26), pad('Check', 7), pad('Tests', 7));
  for (const r of results) {
    console.log(
      pad(r.variant, 26),
      pad(r.check_ok ? 'PASS' : 'FAIL', 7),
      pad(r.test_ok ? 'PASS' : 'FAIL', 7)
    );
  }

  console.log(`\nJSON report → ${REPORT_PATH}`);
  console.log(`All generated variants → ${VARIANTS_DIR}`);
  console.log('Done.');
}

main();
