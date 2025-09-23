#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * fuzz-web-vitest.cjs
 *
 * Tries 20 vetted variations of:
 *  - web/test/setup-tests.ts
 *  - web/vitest.config.ts
 * (and ensures a safe '@/trpc' stub)
 *
 * For each combo:
 *  - writes files
 *  - (optionally) clears Vitest cache
 *  - runs vitest for the web package only
 *  - saves full output + a CSV summary row
 *
 * Usage:
 *   node tools/scripts/fuzz-web-vitest.cjs
 *   node tools/scripts/fuzz-web-vitest.cjs --clean-between
 *   node tools/scripts/fuzz-web-vitest.cjs --heapMB=6144
 *   node tools/scripts/fuzz-web-vitest.cjs --apply-best   (keep the best combo files)
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const getArg = (name, def = null) => {
  const found = args.find(a => a.startsWith(`${name}=`));
  return found ? found.split('=').slice(1).join('=').trim() : def;
};

const CLEAN_BETWEEN = has('--clean-between');
const APPLY_BEST = has('--apply-best');
const HEAP_MB = parseInt(getArg('--heapMB', '6144'), 10) || 6144;

const repoRoot = process.cwd();
const webDir = path.resolve(repoRoot, 'web');
const testDir = path.resolve(webDir, 'test');

const vitestConfigPath = path.resolve(webDir, 'vitest.config.ts');
const setupTestsPath   = path.resolve(testDir, 'setup-tests.ts');
const trpcStubPath     = path.resolve(testDir, 'trpc.stub.ts');

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(repoRoot, 'tools', 'test-logs', `vitest-fuzz-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const summaryCsv = path.resolve(outDir, 'summary.csv');
fs.writeFileSync(summaryCsv, [
  'tryIndex,setupVariant,configVariant,exitCode,passedFiles,failedFiles,totalFiles,passedTests,failedTests,totalTests,durationMs,logFile'
].join(',') + '\n', 'utf8');

function readIfExists(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; }
}
function writeFile(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, 'utf8');
}

const original = {
  vitest: readIfExists(vitestConfigPath),
  setup:  readIfExists(setupTestsPath),
  trpc:   readIfExists(trpcStubPath),
};

function restoreOriginals() {
  if (original.vitest != null) writeFile(vitestConfigPath, original.vitest);
  if (original.setup  != null) writeFile(setupTestsPath, original.setup);
  if (original.trpc   != null) writeFile(trpcStubPath,   original.trpc);
}

process.on('SIGINT', () => { restoreOriginals(); process.exit(130); });
process.on('exit', () => { if (!APPLY_BEST) restoreOriginals(); });

// ---------- Variants ----------

/** setup-tests.ts variants (all set React global; v3-safe afterEach import) */
const setupVariants = [

{
  id: 'S0-bulletproof-jestdom',
  content: `import React from 'react';
(globalThis as any).React = React;

import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';

// Handle both jest-dom v6 (".../vitest") and v5 ("matchers" + manual extend)
async function installJestDom() {
  try {
    await import('@testing-library/jest-dom/vitest'); // v6+
    return;
  } catch {
    try {
      const matchers = await import('@testing-library/jest-dom/matchers');
      // @ts-ignore - matchers shape differs across versions
      expect.extend(matchers);
      await import('@testing-library/jest-dom'); // ensure side-effects loaded
    } catch {
      // Last resort: continue without extra matchers
    }
  }
}
await installJestDom();

afterEach(() => cleanup());
`,
},

  {
    id: 'S1-vitest-jestdom',
    content: `import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';

// Ensure React is present for classic runtime outputs
(globalThis).React = React;

afterEach(() => cleanup());
`,
  },
  {
    id: 'S2-plain-jestdom-manual-extend',
    content: `import { afterEach, expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);
import { cleanup } from '@testing-library/react';
import React from 'react';

(globalThis).React = React;

afterEach(() => cleanup());
`,
  },
  {
    id: 'S3-vitest-jestdom-plus-jsx',
    content: `import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';

(globalThis).React = React;
// If any test relies on JSX runtime globals, they’ll be pulled from React anyway

afterEach(() => cleanup());
`,
  },
  {
    id: 'S4-plain-jestdom-plus-jsx',
    content: `import { afterEach, expect } from 'vitest';
import '@testing-library/jest-dom';
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);
import { cleanup } from '@testing-library/react';
import React from 'react';

(globalThis).React = React;

afterEach(() => cleanup());
`,
  },
];

/** vitest.config.ts variants */
function vitestConfigTemplate(opts) {
  const {
    id, environment, pool, addGlobals,
    includeGlobs = [
      'specs/**/*.{test,spec}.ts?(x)',
      'src/**/*.spec.ts?(x)',
    ],
    excludeGlobs = [
      '**/node_modules/**',
      '**/dist/**',
      // keep other packages’ tests out
      'web-e2e/**',
      '../**',
      '../../**',
      '../../apps/**',
      '../../api-e2e/**',
      '../../shared/**',
      '../../packages/**',
    ],
  } = opts;

  return `import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  test: {
    environment: '${environment}',
    pool: '${pool}',
    ${addGlobals ? 'globals: true,' : ''}
    setupFiles: [path.resolve(__dirname, 'test/setup-tests.ts')],
    environmentOptions: { jsdom: { url: 'http://localhost' } },
    include: ${JSON.stringify(includeGlobs)},
    exclude: ${JSON.stringify(excludeGlobs)},
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@/trpc': path.resolve(__dirname, 'test/trpc.stub.ts'),
    },
  },
});
`;
}

const configVariants = [
  { id: 'C1-jsdom-forks-narrow',      environment: 'jsdom',     pool: 'forks',   addGlobals: false },
  { id: 'C2-jsdom-threads-narrow',    environment: 'jsdom',     pool: 'threads', addGlobals: false },
  { id: 'C3-happydom-forks-narrow',   environment: 'happy-dom', pool: 'forks',   addGlobals: false },
  { id: 'C4-jsdom-forks-narrow-g',    environment: 'jsdom',     pool: 'forks',   addGlobals: true  },
  { id: 'C5-happydom-threads-narrow', environment: 'happy-dom', pool: 'threads', addGlobals: false },
];

/** Very safe, catch-all TRPC stub that handles any nested router usage */
const trpcStub = `// web/test/trpc.stub.ts
// Extremely forgiving TRPC client stub for tests
type Any = any;

function makeLeaf(): Any {
  const leaf: Any = {};
  (leaf as Any).useQuery = (_args?: Any, _opts?: Any) =>
    ({ data: [], isLoading: false, error: null });
  (leaf as Any).useMutation = (_opts?: Any) =>
    ({ mutate: (_: Any) => {}, isLoading: false, error: null });
  return new Proxy(leaf, {
    get(target, prop) {
      if (prop in target) return (target as Any)[prop];
      return makeLeaf();
    }
  });
}

const root: Any = new Proxy({}, {
  get(_t, _p) { return makeLeaf(); }
});

export const trpc: Any = root;
export default root;
`;

// Build the 20 tried combos (4 setup x 5 config)
const tries = [];
for (const s of setupVariants) {
  for (const c of configVariants) {
    tries.push({ setup: s, config: c });
  }
}
// Safety: only first 20
const combos = tries.slice(0, 20);

// ---------- helpers ----------

function run(cmd, opts = {}) {
  try {
    const out = cp.execSync(cmd, { stdio: 'pipe', env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${HEAP_MB}` }, ...opts });
    return { code: 0, stdout: out.toString(), stderr: '' };
  } catch (err) {
    const stdout = err?.stdout?.toString?.() || '';
    const stderr = err?.stderr?.toString?.() || err?.message || '';
    return { code: err.status ?? 1, stdout, stderr };
  }
}

// best-effort parse of vitest summary
function parseSummary(text) {
  // Examples:
  // "Test Files  38 passed (39)"
  // "Tests  39 passed (40)"
  // "Duration  156.34s"
  const rx = /Test Files\s+(\d+)\s+passed\s+\((\d+)\)|Test Files\s+(\d+)\s+failed\s+\((\d+)\)/g;
  const rx2 = /Tests\s+(\d+)\s+passed\s+\((\d+)\)|Tests\s+(\d+)\s+failed\s+\((\d+)\)/g;
  const rx3 = /Duration\s+([\d.]+)s/g;

  let passedFiles = null, totalFiles = null, failedFiles = null;
  let passedTests = null, totalTests = null, failedTests = null;
  let durationMs = null;

  let m;
  while ((m = rx.exec(text))) {
    if (m[1] && m[2]) { passedFiles = +m[1]; totalFiles = +m[2]; }
    if (m[3] && m[4]) { failedFiles = +m[3]; totalFiles = +m[4]; }
  }
  while ((m = rx2.exec(text))) {
    if (m[1] && m[2]) { passedTests = +m[1]; totalTests = +m[2]; }
    if (m[3] && m[4]) { failedTests = +m[3]; totalTests = +m[4]; }
  }
  const md = rx3.exec(text);
  if (md && md[1]) durationMs = Math.round(parseFloat(md[1]) * 1000);

  if (failedFiles == null && totalFiles != null && passedFiles != null) {
    failedFiles = Math.max(0, totalFiles - passedFiles);
  }
  if (failedTests == null && totalTests != null && passedTests != null) {
    failedTests = Math.max(0, totalTests - passedTests);
  }

  return { passedFiles, failedFiles, totalFiles, passedTests, failedTests, totalTests, durationMs };
}

function cleanVitestCaches() {
  console.log('▶ clearing Vitest cache…');
  run('pnpm -w dlx rimraf node_modules/.vitest web/node_modules/.vitest');
}

// ---------- main ----------

(async function main() {
  console.log('▶ Fuzzing Vitest setup for web…');
  if (!fs.existsSync(webDir)) {
    console.error(`web/ folder not found at ${webDir}`);
    process.exit(1);
  }

  // Always ensure TRPC stub
  writeFile(trpcStubPath, trpcStub);

  let best = null;

  for (let i = 0; i < combos.length; i++) {
    const { setup, config } = combos[i];
    const label = `try-${String(i + 1).padStart(2, '0')}__${setup.id}__${config.id}`;
    const logFile = path.resolve(outDir, `${label}.log`);
    console.log(`\n▶ [${i + 1}/${combos.length}] ${label}`);

    // write variant files
    writeFile(setupTestsPath, setup.content);
    writeFile(vitestConfigPath, vitestConfigTemplate(config));
    if (CLEAN_BETWEEN) cleanVitestCaches();

    // run tests
    const start = Date.now();
    const cmd = `pnpm -w vitest run --config ${path.relative(repoRoot, vitestConfigPath)}`;
    const res = run(cmd);
  // quick hint printed to console
  const firstErrLine =
    (res.stderr || res.stdout).split(/\r?\n/).find(l =>
      /error|failed|cannot|not found|referenceerror|typeerror/i.test(l)
    ) || '(no obvious first error line)';
  console.log(`   ↳ first error hint: ${firstErrLine}`);

    const end = Date.now();

    const fullOut = `# CMD
${cmd}

# EXIT CODE
${res.code}

# STDOUT
${res.stdout}

# STDERR
${res.stderr}
`;
    fs.writeFileSync(logFile, fullOut, 'utf8');

    const parsed = parseSummary(res.stdout + '\n' + res.stderr);
    const row = [
      i + 1,
      setup.id,
      config.id,
      res.code,
      parsed.passedFiles ?? '',
      parsed.failedFiles ?? '',
      parsed.totalFiles ?? '',
      parsed.passedTests ?? '',
      parsed.failedTests ?? '',
      parsed.totalTests ?? '',
      parsed.durationMs ?? (end - start),
      path.relative(repoRoot, logFile),
    ].join(',') + '\n';
    fs.appendFileSync(summaryCsv, row, 'utf8');

    // track best (most passed tests/files, then lowest exitCode)
    const gotTotals = Number.isFinite(parsed?.totalFiles) || Number.isFinite(parsed?.totalTests);
const succeeded = res.code === 0 && gotTotals;
const score = succeeded
  ? (parsed.passedTests ?? 0) * 1e6 + (parsed.passedFiles ?? 0) * 1e3
  : -1; // hard fail
    if (!best || score > best.score) best = { succeeded, i, setup, config, parsed, code: res.code, logFile, score };
  }

  console.log(`\n▶ Done. Summary: ${path.relative(repoRoot, summaryCsv)}`);
  if (best) {
    console.log('▶ Best result:');
    console.log(`   - setup:  ${best.setup.id}`);
    console.log(`   - config: ${best.config.id}`);
    console.log(`   - files:  ${best.parsed.passedFiles ?? '?'} passed / ${best.parsed.totalFiles ?? '?'} total`);
    console.log(`   - tests:  ${best.parsed.passedTests ?? '?'} passed / ${best.parsed.totalTests ?? '?'} total`);
    console.log(`   - code:   ${best.code}`);
    console.log(`   - log:    ${path.relative(repoRoot, best.logFile)}`);

    
if (APPLY_BEST) {
  const ok = !!(best && (best.succeeded ?? (best.parsed && (Number.isFinite(best.parsed.totalFiles) || Number.isFinite(best.parsed.totalTests)))) && best.code === 0);
  if (ok) {
    console.log('▶ Applying best combo to working tree…');
    writeFile(setupTestsPath, best.setup.content);
    writeFile(vitestConfigPath, vitestConfigTemplate(best.config));
  } else {
    console.log('▶ No successful run to apply (no totals or nonzero exit). Keeping originals.');
  }
} 
 else {
      console.log('▶ Restoring originals (pass --apply-best to keep the winner).');
    }
  }

  if (!APPLY_BEST) restoreOriginals();
})();
