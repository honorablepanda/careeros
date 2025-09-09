#!/usr/bin/env node
/**
 * scan-trpc-web.cjs
 *
 * Purpose:
 *   Diagnose why web/specs/tracker.spec.tsx can't mock/resolve `trpc`.
 *
 * What it does:
 *  - Finds the web project root (apps/web or web)
 *  - Locates Tracker page (src/app/tracker/page.tsx/tsx)
 *  - Extracts the *actual* import path(s) your page uses for `trpc`
 *  - Locates the tracker spec (specs/tracker.spec.tsx)
 *  - Extracts all jest.mock() module names used in the spec
 *  - Reads web Jest config and reports moduleNameMapper for '^@/(.*)$'
 *  - Reads tsconfig.base.json paths (e.g., '@/*') and prints them
 *  - Tries to resolve '@careeros/trpc' from web root
 *  - Writes a detailed .log and .json report to scans/
 *
 * Usage:
 *   node tools/scripts/scan-trpc-web.cjs
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function gitRoot() {
  try {
    return cp.execSync('git rev-parse --show-toplevel', { stdio: ['ignore','pipe','ignore'] })
      .toString().trim();
  } catch {
    return process.cwd();
  }
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function exists(p) { return fs.existsSync(p); }
function findFirst(pathsArr) { return pathsArr.find(exists) || null; }

function listCandidates(dir, names) {
  for (const name of names) {
    const p = path.join(dir, name);
    if (exists(p)) return p;
  }
  return null;
}

function extractImports(srcText) {
  if (!srcText) return [];
  const re = /import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  const out = [];
  let m;
  while ((m = re.exec(srcText))) out.push(m[1]);
  return out;
}

function extractTrpcImports(srcText) {
  if (!srcText) return [];
  // grab import lines that reference trpc (named or default) OR any path likely to be trpc
  const lines = srcText.split(/\r?\n/);
  const hits = [];
  for (const ln of lines) {
    const m = ln.match(/import\s+(.+)\s+from\s+['"]([^'"]+)['"]/);
    if (!m) continue;
    const binding = m[1];
    const mod = m[2];
    if (/\btrpc\b/.test(binding) || /trpc|utils\/api|lib\/trpc/.test(mod)) {
      hits.push({ binding: binding.trim(), module: mod });
    }
  }
  return hits;
}

function extractJestMocks(specText) {
  if (!specText) return [];
  const re = /jest\.mock\(\s*['"]([^'"]+)['"]/g;
  const mods = new Set();
  let m;
  while ((m = re.exec(specText))) mods.add(m[1]);
  return Array.from(mods);
}

function tryResolve(mod, basedir) {
  try {
    return require.resolve(mod, { paths: [basedir] });
  } catch {
    return null;
  }
}

(function main() {
  const root = gitRoot();
  const reportDir = path.join(root, 'scans');
  if (!exists(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  // Detect web project root
  const webRoot = [path.join(root, 'apps', 'web'), path.join(root, 'web')].find(exists);
  const webSrc = webRoot ? path.join(webRoot, 'src') : null;

  const out = {
    meta: {
      when: new Date().toISOString(),
      root,
      webRoot: webRoot || null,
      webSrc: webSrc || null,
    },
    files: {},
    jest: { moduleNameMapper: null, hasAtAlias: false, configPath: null },
    tsconfig: { basePath: null, aliases: null },
    tracker: { pagePath: null, imports: [], trpcImports: [], specPath: null, specMocks: [] },
    resolution: {
      careerosTrpcResolvedTo: null,
      issues: [],
      suggestions: [],
    },
  };

  // Resolve likely paths
  const trackerPage = webRoot
    ? listCandidates(path.join(webRoot, 'src', 'app', 'tracker'), ['page.tsx', 'page.ts', 'index.tsx', 'index.ts'])
    : null;

  const trackerSpec = findFirst([
    path.join(webRoot || root, 'specs', 'tracker.spec.tsx'),
    path.join(root, 'specs', 'tracker.spec.tsx'),
  ]);

  const jestPaths = [
    path.join(webRoot || '', 'jest.config.ts'),
    path.join(root, 'apps', 'web', 'jest.config.ts'),
    path.join(root, 'web', 'jest.config.ts'),
    path.join(root, 'jest.config.ts'),
  ].filter(Boolean);

  const jestConfigPath = jestPaths.find(exists) || null;
  const tsBasePath = findFirst([path.join(root, 'tsconfig.base.json'), path.join(root, 'tsconfig.json')]);

  out.files.trackerPage = trackerPage;
  out.files.trackerSpec = trackerSpec;
  out.files.jestConfig = jestConfigPath;
  out.files.tsconfigBase = tsBasePath;

  // Read & parse TS config
  const tsBase = readJSON(tsBasePath);
  if (tsBase && tsBase.compilerOptions && tsBase.compilerOptions.paths) {
    out.tsconfig.basePath = tsBasePath;
    out.tsconfig.aliases = tsBase.compilerOptions.paths;
  }

  // Read & scan Tracker page
  const pageText = readText(trackerPage);
  const allImports = extractImports(pageText);
  const trpcImports = extractTrpcImports(pageText);
  out.tracker.pagePath = trackerPage;
  out.tracker.imports = allImports;
  out.tracker.trpcImports = trpcImports;

  // Read & scan spec for mocks
  const specText = readText(trackerSpec);
  const specMocks = extractJestMocks(specText);
  out.tracker.specPath = trackerSpec;
  out.tracker.specMocks = specMocks;

  // Parse Jest config for moduleNameMapper (rough text parse; safe even if TS)
  if (jestConfigPath) {
    const jestText = readText(jestConfigPath);
    out.jest.configPath = jestConfigPath;

    const mapperBlock = jestText && jestText.match(/moduleNameMapper\s*:\s*\{([\s\S]*?)\}/);
    if (mapperBlock) {
      const block = mapperBlock[1];
      out.jest.moduleNameMapper = block.trim();
      out.jest.hasAtAlias = /\^@\/\(\.\*\)\$/.test(block) || /\^@\//.test(block);
    } else {
      out.jest.moduleNameMapper = null;
    }
  }

  // Try resolving '@careeros/trpc' from webRoot
  if (webRoot) {
    out.resolution.careerosTrpcResolvedTo = tryResolve('@careeros/trpc', webRoot);
  }

  // Analysis: mismatches between imports & mocks
  const importedModules = new Set(trpcImports.map(i => i.module));
  const mockedModules = new Set(specMocks);

  const notMocked = Array.from(importedModules).filter(m => !mockedModules.has(m));
  const mockedUnused = Array.from(mockedModules).filter(m => !importedModules.has(m) && !/^@\//.test(m));

  if (notMocked.length) {
    out.resolution.issues.push({
      type: 'missing-mocks',
      message: `Spec is not mocking trpc for the exact import path(s) used by the page.`,
      missingFor: notMocked,
    });
  }
  if (mockedUnused.length) {
    out.resolution.issues.push({
      type: 'unused-mocks',
      message: `Spec mocks modules that the page does not import.`,
      mockedUnused,
    });
  }

  // Suggestions
  if (!out.jest.hasAtAlias) {
    out.resolution.suggestions.push({
      type: 'jest-alias',
      message: `Add an alias for '^@/(.*)$' → '<rootDir>/src/$1' to your web Jest config (or rely on virtual mocks).`,
      example: `moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' }`,
    });
  }

  if (notMocked.length) {
    notMocked.forEach(m => {
      out.resolution.suggestions.push({
        type: 'add-jest-mock',
        message: `At the top of specs/tracker.spec.tsx, add a jest.mock for '${m}'.`,
        code: `jest.mock('${m}', () => { const trpc = { tracker: { getApplications: { useQuery: () => ({ data: [] }) }, createApplication: { useMutation: () => ({ mutate: jest.fn() }) }, updateApplication: { useMutation: () => ({ mutate: jest.fn() }) }, deleteApplication: { useMutation: () => ({ mutate: jest.fn() }) } } }; return { __esModule: true, trpc, default: { trpc } }; }, ${/^@\//.test(m) ? '{ virtual: true }' : ''});`
      });
    });
  }

  if (!out.resolution.careerosTrpcResolvedTo) {
    out.resolution.suggestions.push({
      type: 'resolve-careeros-trpc',
      message: `@careeros/trpc does not resolve from the web project root. If your page imports this path, either add a workspace alias or mock it virtually in Jest.`,
      exampleVirtualMock: `jest.mock('@careeros/trpc', () => ({ __esModule: true, trpc: { tracker: {/* ... */} }, default: { trpc: { /* ... */ } } }), { virtual: true });`,
    });
  }

  // Write files
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(reportDir, `trpc-scan-report-${ts}.json`);
  const logPath = path.join(reportDir, `trpc-scan-report-${ts}.log`);

  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf8');

  // Human-readable log
  const lines = [];
  lines.push('=== tRPC Web Scan Report ===');
  lines.push(`When: ${out.meta.when}`);
  lines.push(`Repo root: ${root}`);
  lines.push(`Web root: ${out.meta.webRoot || '(not found)'}`);
  lines.push('');
  lines.push(`Tracker page: ${out.tracker.pagePath || '(not found)'}`);
  lines.push(`Tracker imports (${out.tracker.imports.length}): ${out.tracker.imports.join(', ') || '-'}`);
  lines.push('tRPC-related imports:');
  (out.tracker.trpcImports.length ? out.tracker.trpcImports : [{binding:'-', module:'-'}]).forEach(i => {
    lines.push(`  - binding: ${i.binding}  from: ${i.module}`);
  });
  lines.push('');
  lines.push(`Tracker spec: ${out.tracker.specPath || '(not found)'}`);
  lines.push(`jest.mock() modules: ${out.tracker.specMocks.join(', ') || '-'}`);
  lines.push('');
  lines.push(`Jest config: ${out.jest.configPath || '(not found)'}`);
  lines.push(`Has '^@/(.*)$' alias in moduleNameMapper: ${out.jest.hasAtAlias ? 'YES' : 'NO'}`);
  lines.push('');
  lines.push(`@careeros/trpc resolves from web root: ${out.resolution.careerosTrpcResolvedTo ? 'YES' : 'NO'}`);
  if (out.resolution.careerosTrpcResolvedTo) {
    lines.push(`  -> ${out.resolution.careerosTrpcResolvedTo}`);
  }
  lines.push('');
  if (out.resolution.issues.length) {
    lines.push('Issues:');
    out.resolution.issues.forEach(it => {
      lines.push(`  - ${it.type}: ${it.message}`);
      if (it.missingFor) lines.push(`    missingFor: ${it.missingFor.join(', ')}`);
      if (it.mockedUnused) lines.push(`    mockedUnused: ${it.mockedUnused.join(', ')}`);
    });
  } else {
    lines.push('Issues: (none detected)');
  }
  lines.push('');
  if (out.resolution.suggestions.length) {
    lines.push('Suggestions:');
    out.resolution.suggestions.forEach(s => {
      lines.push(`  - ${s.type}: ${s.message}`);
      if (s.example) lines.push(`    e.g. ${s.example}`);
      if (s.code) lines.push(`    code: ${s.code}`);
      if (s.exampleVirtualMock) lines.push(`    e.g. ${s.exampleVirtualMock}`);
    });
  } else {
    lines.push('Suggestions: (none)');
  }
  fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');

  console.log(`✓ Scan complete`);
  console.log(`  Log : ${path.relative(process.cwd(), logPath)}`);
  console.log(`  JSON: ${path.relative(process.cwd(), jsonPath)}`);

  // Non-zero exit if we found blocking issues
  if (out.resolution.issues.length) process.exitCode = 2;
})();
