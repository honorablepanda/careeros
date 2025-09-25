#!/usr/bin/env node
/**
 * scan-trpc-web.cjs (v2)
 * Scans web specs/pages for @careeros/trpc usage and reports missing mocks.
 * If Jest moduleNameMapper maps @careeros/trpc to a mock file, do NOT flag it.
 *
 * Output: scans/trpc-scan-report-<ISO>.json (and .log printed to stdout)
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const WEB_DIR = path.join(ROOT, 'web');
const SPECS_DIR = path.join(WEB_DIR, 'specs');
const JEST_CONFIG = path.join(WEB_DIR, 'jest.config.ts');
const SCANS_DIR = path.join(ROOT, 'scans');

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}
function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}
function list(dir) {
  try {
    return fs.readdirSync(dir).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function findAllSpecs() {
  const files = [];
  if (exists(SPECS_DIR)) {
    for (const f of list(SPECS_DIR)) {
      if (/\.(test|spec)\.tsx?$/.test(f)) files.push(f);
    }
  }
  return files;
}

// Very lightweight import/mock extraction
function parseImportsAndMocks(src) {
  const imports = new Set();
  const mocks = new Set();

  // import ... from '<path>'
  const importRe = /import\s+[^'"]*\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(importRe)) {
    imports.add(m[1]);
  }

  // jest.mock('<path>'[, ...])
  const mockRe = /jest\.mock\(\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(mockRe)) {
    mocks.add(m[1]);
  }

  return { imports, mocks };
}

function mapperHasTrpc(jestText) {
  if (!jestText) return false;
  // Works whether mapper is an object literal or serialized string
  return /moduleNameMapper[\s\S]*@careeros\/trpc/.test(jestText);
}

(function main() {
  if (!exists(SCANS_DIR)) fs.mkdirSync(SCANS_DIR, { recursive: true });

  const when = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonOut = path.join(SCANS_DIR, `trpc-scan-report-${when}.json`);
  const out = {
    when,
    webDir: WEB_DIR,
    jest: {
      configPath: JEST_CONFIG,
      moduleNameMapper: '',
      mapperHasTrpc: false,
    },
    specsAnalyzed: 0,
    importedModules: [],
    mockedModules: [],
    resolution: { issues: [] },
  };

  // Read jest config text (don’t execute it)
  const jestText = exists(JEST_CONFIG) ? read(JEST_CONFIG) : '';
  out.jest.moduleNameMapper = jestText.includes('moduleNameMapper')
    ? jestText
    : '';
  out.jest.mapperHasTrpc = mapperHasTrpc(jestText);

  // Scan specs
  const specFiles = findAllSpecs();
  out.specsAnalyzed = specFiles.length;

  const imported = new Set();
  const mocked = new Set();

  for (const spec of specFiles) {
    const src = read(spec);
    const { imports, mocks } = parseImportsAndMocks(src);
    for (const i of imports) imported.add(i);
    for (const m of mocks) mocked.add(m);
  }

  out.importedModules = Array.from(imported).sort();
  out.mockedModules = Array.from(mocked).sort();

  // Find any @careeros/trpc imports that were not explicitly jest.mock(...)'d
  const trpcImports = out.importedModules.filter((m) =>
    /^@careeros\/trpc(\/.*)?$/.test(m)
  );
  const trpcMocked = out.mockedModules.filter((m) =>
    /^@careeros\/trpc(\/.*)?$/.test(m)
  );

  const unmockedTrpcPaths = trpcImports.filter((m) => !trpcMocked.includes(m));

  // Only flag if there's NO moduleNameMapper handling @careeros/trpc
  if (unmockedTrpcPaths.length && !out.jest.mapperHasTrpc) {
    out.resolution.issues.push({
      type: 'missing-mocks',
      message:
        'Spec is not mocking trpc for the exact import path(s) used by the page.',
      missingFor: unmockedTrpcPaths,
    });
  }

  fs.writeFileSync(jsonOut, JSON.stringify(out, null, 2), 'utf8');

  // Console summary
  console.log('=== tRPC Web Scan ===');
  console.log('Specs analyzed:', out.specsAnalyzed);
  console.log(
    'Jest mapper includes @careeros/trpc:',
    out.jest.mapperHasTrpc ? 'yes' : 'no'
  );
  if (out.resolution.issues.length) {
    console.log('Issues:');
    for (const i of out.resolution.issues) {
      console.log(
        '-',
        i.message,
        i.missingFor ? `[${i.missingFor.join(', ')}]` : ''
      );
    }
    process.exitCode = 2;
  } else {
    console.log('No issues detected ✅');
  }
})();
