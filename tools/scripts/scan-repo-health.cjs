#!/usr/bin/env node
/**
 * scan-repo-health.cjs
 *
 * Purpose:
 *   Scan the entire project folder for required files/configs and report anything missing or suspicious.
 *
 * Output:
 *   - scans/repo-health-<timestamp>.log  (human-readable)
 *   - scans/repo-health-<timestamp>.json (structured)
 *
 * Exit code:
 *   - 0  => no blocking issues
 *   - 2  => one or more blocking issues found
 *
 * Usage:
 *   node tools/scripts/scan-repo-health.cjs
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

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function rel(root, p) { return p ? path.relative(root, p) : '(none)'; }
function ensureDir(p) { if (!exists(p)) fs.mkdirSync(p, { recursive: true }); }

function findFirst(pathsArr) { return pathsArr.find(exists) || null; }

function hasModuleNameMapperAlias(jestText, aliasRegexSource) {
  if (!jestText) return false;
  // Very lightweight parse for moduleNameMapper: { ... 'pattern': 'target', ... }
  const m = jestText.match(/moduleNameMapper\s*:\s*\{([\s\S]*?)\}/);
  if (!m) return false;
  const block = m[1];
  const re = new RegExp(aliasRegexSource);
  return re.test(block);
}

function extractModuleNameMapperBlock(jestText) {
  if (!jestText) return null;
  const m = jestText.match(/moduleNameMapper\s*:\s*\{([\s\S]*?)\}/);
  return m ? m[1].trim() : null;
}

(function main() {
  const root = gitRoot();
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const scansDir = path.join(root, 'scans');
  ensureDir(scansDir);
  const jsonOut = path.join(scansDir, `repo-health-${now}.json`);
  const logOut  = path.join(scansDir, `repo-health-${now}.log`);

  const report = {
    meta: {
      when: new Date().toISOString(),
      root,
      cwd: process.cwd(),
    },
    locations: {
      prismaSchema: null,
      apiPackageJson: null,
      webRoot: null,
      webJestConfig: null,
      webTsSpec: null,
      webSetupTests: null,
      webTrpcMock: null,
      trackerSpec: null,
      indexSpec: null,
      orchestrator: null,
      trpcScan: null,
      nxJson: null,
      ciWorkflow: null,
      playwrightConfig: null,
    },
    checks: [],
    issues: [],
    suggestions: [],
  };

  const pushIssue = (severity, code, message, details = {}) => {
    report.issues.push({ severity, code, message, details });
  };
  const pushCheck = (ok, code, message, details = {}) => {
    report.checks.push({ ok, code, message, details });
    if (!ok) pushIssue('error', code, message, details);
  };
  const pushWarn = (code, message, details = {}) => {
    report.issues.push({ severity: 'warn', code, message, details });
  };
  const suggest = (code, message, example) => {
    report.suggestions.push({ code, message, example });
  };

  // --- Paths to check --------------------------------------------------------
  const prismaSchema = findFirst([
    path.join(root, 'prisma', 'schema.prisma'),
    path.join(root, 'apps', 'api', 'prisma', 'schema.prisma'), // legacy pattern
  ]);
  report.locations.prismaSchema = prismaSchema;

  const apiPkg = findFirst([
    path.join(root, 'apps', 'api', 'package.json'),
  ]);
  report.locations.apiPackageJson = apiPkg;

  const webRoot = findFirst([
    path.join(root, 'apps', 'web'),
    path.join(root, 'web'),
  ]);
  report.locations.webRoot = webRoot;

  const webJestConfig = webRoot ? findFirst([
    path.join(webRoot, 'jest.config.ts'),
    path.join(webRoot, 'jest.config.js'),
  ]) : null;
  report.locations.webJestConfig = webJestConfig;

  const webTsSpec = webRoot ? findFirst([
    path.join(webRoot, 'tsconfig.spec.json'),
  ]) : null;
  report.locations.webTsSpec = webTsSpec;

  const webSetupTests = webRoot ? findFirst([
    path.join(webRoot, 'test', 'setupTests.ts'),
    path.join(webRoot, 'test', 'setupTests.js'),
  ]) : null;
  report.locations.webSetupTests = webSetupTests;

  const webTrpcMock = webRoot ? findFirst([
    path.join(webRoot, 'test', 'trpc.mock.ts'),
    path.join(webRoot, 'test', 'trpc.mock.js'),
  ]) : null;
  report.locations.webTrpcMock = webTrpcMock;

  const trackerSpec = webRoot ? findFirst([
    path.join(webRoot, 'specs', 'tracker.spec.tsx'),
    path.join(webRoot, 'specs', 'tracker.spec.ts'),
  ]) : null;
  report.locations.trackerSpec = trackerSpec;

  const indexSpec = webRoot ? findFirst([
    path.join(webRoot, 'specs', 'index.spec.tsx'),
    path.join(webRoot, 'specs', 'index.spec.ts'),
  ]) : null;
  report.locations.indexSpec = indexSpec;

  const orchestrator = findFirst([
    path.join(root, 'tools', 'scripts', 'orchestrate-tracker-setup.cjs'),
  ]);
  report.locations.orchestrator = orchestrator;

  const trpcScan = findFirst([
    path.join(root, 'tools', 'scripts', 'scan-trpc-web.cjs'),
  ]);
  report.locations.trpcScan = trpcScan;

  const nxJson = findFirst([
    path.join(root, 'nx.json'),
  ]);
  report.locations.nxJson = nxJson;

  const ciWorkflow = findFirst([
    path.join(root, '.github', 'workflows', 'ci.yml'),
    path.join(root, '.github', 'workflows', 'ci.yaml'),
  ]);
  report.locations.ciWorkflow = ciWorkflow;

  const playwrightConfig = findFirst([
    path.join(root, 'playwright.config.ts'),
    path.join(root, 'playwright.config.js'),
    path.join(root, 'apps', 'web-e2e', 'playwright.config.ts'),
    path.join(root, 'web-e2e', 'playwright.config.ts'),
  ]);
  report.locations.playwrightConfig = playwrightConfig;

  // --- Prisma checks ---------------------------------------------------------
  pushCheck(!!prismaSchema, 'PRISMA_SCHEMA_PRESENT',
    prismaSchema ? `Found prisma schema at ${rel(root, prismaSchema)}` : 'Prisma schema not found',
  );

  if (prismaSchema) {
    const ps = readText(prismaSchema);
    if (!ps) {
      pushIssue('warn', 'PRISMA_SCHEMA_READ', 'Could not read prisma schema.');
    } else {
      if (!/datasource\s+\w+\s+\{[\s\S]*?provider\s*=\s*".+?"[\s\S]*?url\s*=\s*env\(.+?\)/m.test(ps)) {
        pushWarn('PRISMA_DATASOURCE_URL', 'Prisma schema datasource.url env reference not found or malformed.',
          { hint: 'Ensure datasource { provider="postgresql", url=env("DATABASE_URL") }' });
      }
      if (!/generator\s+\w+\s+\{[\s\S]*?provider\s*=\s*"(prisma-client-js|node|js)"/m.test(ps)) {
        pushWarn('PRISMA_GENERATOR', 'Prisma client generator may be missing.',
          { hint: 'Ensure generator client { provider = "prisma-client-js" }' });
      }
    }
  }

  // --- API package.json prisma scripts --------------------------------------
  if (apiPkg) {
    const pkg = readJSON(apiPkg);
    const scripts = (pkg && pkg.scripts) || {};
    const expected = {
      'prisma': 'prisma',
      'prisma:migrate': 'prisma migrate dev --schema ../../prisma/schema.prisma',
      'prisma:generate': 'prisma generate --schema ../../prisma/schema.prisma',
      'prisma:format': 'prisma format --schema ../../prisma/schema.prisma',
      'prisma:validate': 'prisma validate --schema ../../prisma/schema.prisma',
    };
    const missing = Object.entries(expected).filter(([k, v]) => scripts[k] !== v).map(([k]) => k);
    pushCheck(missing.length === 0, 'API_PRISMA_SCRIPTS',
      missing.length === 0 ? 'apps/api prisma scripts OK'
                           : `apps/api missing/incorrect prisma scripts: ${missing.join(', ')}`,
      { expected, current: scripts });
  } else {
    pushIssue('error', 'API_PACKAGE_JSON_MISSING', 'apps/api/package.json not found.');
  }

  // --- Web project checks ----------------------------------------------------
  pushCheck(!!webRoot, 'WEB_ROOT_PRESENT',
    webRoot ? `Web root: ${rel(root, webRoot)}` : 'Web project not found');

  // Jest config
  if (webJestConfig) {
    const jestText = readText(webJestConfig);
    const mapperBlock = extractModuleNameMapperBlock(jestText);
    const hasTrpc = hasModuleNameMapperAlias(jestText, '^\\^@careeros\\/trpc(?:\\/\\.\\*)?\\$|\\^@careeros\\/trpc\\(\\?:\\/\\.\\*\\)\\?\\$');
    const hasAtAlias = hasModuleNameMapperAlias(jestText, '^\\^@\\/(\\.*)\\$|\\^@\\/(\\(\\.\\*\\))\\$');

    pushCheck(!!mapperBlock, 'WEB_JEST_MAPPER_PRESENT',
      mapperBlock ? 'web Jest moduleNameMapper present' : 'web Jest moduleNameMapper missing');

    pushCheck(hasTrpc, 'WEB_JEST_TRPC_MAPPED',
      hasTrpc ? '@careeros/trpc mapped to a mock file' : '@careeros/trpc not mapped in web Jest config');

    pushCheck(hasAtAlias, 'WEB_JEST_AT_ALIAS',
      hasAtAlias ? '^@/(.*)$ alias present' : '^@/(.*)$ alias missing in web Jest config');

  } else {
    pushIssue('error', 'WEB_JEST_CONFIG_MISSING', 'web/jest.config.(ts|js) not found.');
  }

  // tsconfig.spec.json
  if (webTsSpec) {
    const tsSpec = readJSON(webTsSpec);
    const co = tsSpec && tsSpec.compilerOptions || {};
    const jsxOK = co.jsx === 'react-jsx';
    const types = Array.isArray(co.types) ? co.types : [];
    const hasJestDom = types.includes('@testing-library/jest-dom');
    const isoOK = co.isolatedModules === true;

    pushCheck(jsxOK, 'WEB_TS_SPEC_JSX',
      jsxOK ? 'tsconfig.spec.json jsx=react-jsx' : 'tsconfig.spec.json should set jsx=react-jsx');

    pushCheck(hasJestDom, 'WEB_TS_SPEC_JESTDOM_TYPES',
      hasJestDom ? 'jest-dom types present' : 'add "@testing-library/jest-dom" to tsconfig.spec.json compilerOptions.types');

    pushCheck(isoOK, 'WEB_TS_SPEC_ISO',
      isoOK ? 'isolatedModules=true' : 'set isolatedModules=true in tsconfig.spec.json');
  } else {
    pushIssue('error', 'WEB_TS_SPEC_MISSING', 'web/tsconfig.spec.json not found.');
  }

  // setupTests
  pushCheck(!!webSetupTests, 'WEB_SETUP_TESTS',
    webSetupTests ? `setupTests present at ${rel(root, webSetupTests)}` : 'web/test/setupTests.(ts|js) missing',
  );

  // trpc mock
  pushCheck(!!webTrpcMock, 'WEB_TRPC_MOCK',
    webTrpcMock ? `tRPC mock present at ${rel(root, webTrpcMock)}`
                : 'web/test/trpc.mock.(ts|js) missing');

  if (webTrpcMock) {
    const txt = readText(webTrpcMock) || '';
    const hasNamed = /\bexport\s+const\s+trpc\b/.test(txt) || /module\.exports\s*=\s*\{[\s\S]*trpc/.test(txt);
    const hasDefault = /\bexport\s+default\b/.test(txt) || /module\.exports\s*=\s*\{[\s\S]*default/.test(txt);
    if (!hasNamed || !hasDefault) {
      pushWarn('WEB_TRPC_MOCK_EXPORTS', 'tRPC mock should export both named `trpc` and default { trpc }.');
    }
  }

  // basic specs present
  pushCheck(!!trackerSpec, 'WEB_TRACKER_SPEC_PRESENT',
    trackerSpec ? `tracker spec at ${rel(root, trackerSpec)}` : 'web/specs/tracker.spec.(tsx|ts) missing');

  pushCheck(!!indexSpec, 'WEB_INDEX_SPEC_PRESENT',
    indexSpec ? `index spec at ${rel(root, indexSpec)}` : 'web/specs/index.spec.(tsx|ts) missing');

  // orchestrator & scan tools
  pushCheck(!!orchestrator, 'SCRIPT_ORCHESTRATOR_PRESENT',
    orchestrator ? `orchestrator present at ${rel(root, orchestrator)}` : 'tools/scripts/orchestrate-tracker-setup.cjs missing');

  pushCheck(!!trpcScan, 'SCRIPT_TRPC_SCAN_PRESENT',
    trpcScan ? `trpc scan present at ${rel(root, trpcScan)}` : 'tools/scripts/scan-trpc-web.cjs missing');

  // nx.json (workspace sanity)
  pushCheck(!!nxJson, 'NX_JSON_PRESENT', nxJson ? 'nx.json present' : 'nx.json missing');

  // CI presence
  pushCheck(!!ciWorkflow, 'CI_WORKFLOW_PRESENT',
    ciWorkflow ? `CI workflow present at ${rel(root, ciWorkflow)}`
               : '.github/workflows/ci.yml missing');

  // Playwright config (optional)
  if (!playwrightConfig) {
    pushWarn('PLAYWRIGHT_CONFIG_MISSING', 'Playwright config not found (ok if you are not running E2E yet).');
  } else {
    report.locations.playwrightConfig = playwrightConfig;
  }

  // suggestions (generic)
  suggest('RUN_API_PRISMA_VALIDATE', 'Run Prisma sanity once to verify migrations & client', 'pnpm -F ./apps/api run prisma:validate && pnpm -F ./apps/api run prisma:generate');
  suggest('RUN_TESTS_WEB', 'Run web tests to verify mock wiring', 'pnpm run test:web');
  suggest('ADD_CI', 'Add CI step for web tests', 'pnpm run test:web');

  // write files
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');

  const logLines = [];
  logLines.push('=== Repo Health Scan ===');
  logLines.push(`When: ${report.meta.when}`);
  logLines.push(`Root: ${report.meta.root}`);
  logLines.push('');
  logLines.push('Locations:');
  Object.entries(report.locations).forEach(([k, v]) => {
    logLines.push(`  - ${k}: ${v ? rel(root, v) : '(not found)'}`);
  });
  logLines.push('');
  logLines.push('Checks:');
  report.checks.forEach(c => {
    logLines.push(`  ${c.ok ? '✓' : '✗'} ${c.code} — ${c.message}`);
  });
  logLines.push('');
  if (report.issues.length) {
    logLines.push('Issues:');
    report.issues.forEach(i => {
      logLines.push(`  [${i.severity}] ${i.code} — ${i.message}`);
    });
  } else {
    logLines.push('Issues: (none)');
  }
  logLines.push('');
  if (report.suggestions.length) {
    logLines.push('Suggestions:');
    report.suggestions.forEach(s => {
      logLines.push(`  - ${s.code}: ${s.message}`);
      if (s.example) logLines.push(`      e.g. ${s.example}`);
    });
  }
  logLines.push('');

  fs.writeFileSync(logOut, logLines.join('\n'), 'utf8');

  console.log('✓ Repo health scan complete');
  console.log('  Log :', path.relative(process.cwd(), logOut));
  console.log('  JSON:', path.relative(process.cwd(), jsonOut));

  // Exit non-zero if there are any error-severity issues
  const hasErrors = report.issues.some(i => i.severity === 'error');
  if (hasErrors) process.exitCode = 2;
})();
