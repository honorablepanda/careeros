#!/usr/bin/env node
/**
 * tools/scripts/check-trpc-alias.cjs
 *
 * Quick checker to verify your Vitest config stubs TRPC correctly:
 *  - web/vitest.config.ts exists
 *  - imports vite-tsconfig-paths
 *  - plugins include tsconfigPaths()
 *  - defines: const trpcStub = path.resolve(__dirname, './test/trpc.stub.ts')
 *  - resolve.alias and test.alias map:
 *      @/trpc, @/trpc/react, @careeros/trpc  -> trpcStub
 *  - web/test/trpc.stub.ts exists and exports:
 *      named "trpc" and default "trpc"
 *  - (optional) stub has settings.get.useQuery mock
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const webDir = path.join(ROOT, 'web');
const vitestConfig = path.join(webDir, 'vitest.config.ts');
const stubPath = path.join(webDir, 'test', 'trpc.stub.ts');

const COLORS = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
const tick = COLORS.green('  ✓');
const cross = COLORS.red('  ✗');
const warn = COLORS.yellow('  !');

let issues = 0;

function logHeader(title) {
  console.log(`▶ ${title}`);
}

function ok(msg) {
  console.log(`${tick} ${msg}`);
}

function fail(msg, hint) {
  issues++;
  console.log(`${cross} ${msg}`);
  if (hint) console.log(COLORS.dim(`    ${hint}`));
}

function hint(msg) {
  console.log(`${warn} ${msg}`);
}

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function containsPluginsTsconfigPaths(src) {
  // Rough but effective: matches "plugins: [ ... tsconfigPaths( ..." across lines
  const re = /plugins\s*:\s*\[\s*[\s\S]*?tsconfigPaths\s*\(/m;
  return re.test(src);
}

function hasTsconfigPathsImport(src) {
  return /from\s+['"]vite-tsconfig-paths['"]/.test(src) || /require\(['"]vite-tsconfig-paths['"]\)/.test(src);
}

function hasTrpcStubConst(src) {
  return /const\s+trpcStub\s*=\s*path\.resolve\(\s*__dirname\s*,\s*['"]\.\/test\/trpc\.stub\.ts['"]\s*\)/.test(src);
}

function hasAliasMapping(src, pattern) {
  // Looks for { find: /^...$/, replacement: trpcStub }
  const findRe = new RegExp(`find\\s*:\\s*/\\^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\$/`);
  const replRe = /replacement\s*:\s*trpcStub/;
  // Try both resolve.alias and test.alias blocks, but a simple "exists anywhere" is enough
  return findRe.test(src) && replRe.test(src);
}

function stubHasNamedTrpc(src) {
  return /export\s+(const|let|var)\s+trpc\b/.test(src) || /export\s*\{\s*trpc\s*\}/.test(src);
}

function stubHasDefaultTrpc(src) {
  return /export\s+default\s+trpc\b/.test(src);
}

function stubHasSettingsGetUseQuery(src) {
  // heuristic: looks for settings.get.useQuery definition
  return /settings\s*:\s*\{\s*get\s*:\s*\{\s*useQuery\s*:\s*\(\)\s*=>/.test(src);
}

(async function main() {
  logHeader('check-trpc-alias');

  // vitest.config.ts presence
  const vitestSrc = readFileSafe(vitestConfig);
  if (!vitestSrc) {
    fail(`Missing ${path.relative(ROOT, vitestConfig)}`, 'Create web/vitest.config.ts and add the TRPC stubbing aliases.');
    printSummary();
    process.exit(1);
  } else {
    ok(`Found ${path.relative(ROOT, vitestConfig)}`);
  }

  // tsconfigPaths import
  if (hasTsconfigPathsImport(vitestSrc)) {
    ok('Imports vite-tsconfig-paths');
  } else {
    fail('Does not import vite-tsconfig-paths', `Add: import tsconfigPaths from 'vite-tsconfig-paths'`);
  }

  // plugins include tsconfigPaths()
  if (containsPluginsTsconfigPaths(vitestSrc)) {
    ok('plugins include tsconfigPaths()');
  } else {
    fail('plugins do not include tsconfigPaths()', 'Add tsconfigPaths() to the plugins array (keep it after the explicit aliases).');
  }

  // trpcStub const
  if (hasTrpcStubConst(vitestSrc)) {
    ok('trpcStub path set to ./test/trpc.stub.ts');
  } else {
    fail('trpcStub path not set to ./test/trpc.stub.ts', `Add: const trpcStub = path.resolve(__dirname, './test/trpc.stub.ts')`);
  }

  // alias checks (in either resolve.alias or test.alias – we just check content presence)
  const requiredAliases = [
    { pat: '@\\/trpc', label: '@/trpc' },
    { pat: '@\\/trpc\\/react', label: '@/trpc/react' },
    { pat: '@careeros\\/trpc', label: '@careeros/trpc' },
  ];

  for (const a of requiredAliases) {
    if (hasAliasMapping(vitestSrc, a.pat)) {
      ok(`alias for ${a.label} present`);
    } else {
      fail(`alias for ${a.label} missing`, `Add { find: /^${a.pat}$/, replacement: trpcStub } to test.alias and/or resolve.alias.`);
    }
  }

  // Stub presence
  const stubSrc = readFileSafe(stubPath);
  if (!stubSrc) {
    fail(`Missing ${path.relative(ROOT, stubPath)}`, 'Create the stub; export a named "trpc" and default "trpc".');
    printSummary();
    process.exitCode = 1;
    return;
  } else {
    ok(`Found ${path.relative(ROOT, stubPath)}`);
  }

  // Stub named export
  if (stubHasNamedTrpc(stubSrc)) {
    ok('stub exports named "trpc"');
  } else {
    fail('stub missing named export "trpc"', `Add: export const trpc = /* ... */;`);
  }

  // Stub default export
  if (stubHasDefaultTrpc(stubSrc)) {
    ok('stub exports default "trpc"');
  } else {
    fail('stub missing default export "trpc"', `Add: export default trpc;`);
  }

  // Optional: settings.get.useQuery
  if (stubHasSettingsGetUseQuery(stubSrc)) {
    ok('stub mocks settings.get.useQuery (optional)');
  } else {
    hint('stub does not appear to mock settings.get.useQuery (optional)\n    Hint: implement a simple hook: settings: { get: { useQuery: () => ({ data:{...}, isLoading:false, error:null }) } }');
  }

  printSummary();
  process.exitCode = issues ? 1 : 0;
})();

function printSummary() {
  if (issues === 0) {
    console.log(COLORS.green('\n✓ All checks passed'));
  } else {
    console.log(COLORS.red(`\n✗ ${issues} issue(s) found`));
  }
}
