#!/usr/bin/env node
/**
 * scan-repo-health.cjs
 * Scans the workspace for common build/test issues and logs results.
 *
 * Outputs:
 *  - tools/logs/repo-health-report.txt
 *  - tools/logs/repo-health-report.json
 *
 * Usage:
 *  node tools/scripts/scan-repo-health.cjs --log-dir tools/logs --verbose
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getFlag(name, def = null) {
  const i = args.indexOf(name);
  if (i === -1) return def;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const LOG_DIR = getFlag('--log-dir', path.join('tools', 'logs'));
const VERBOSE = !!getFlag('--verbose', false);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
ensureDir(LOG_DIR);

const textLog = [];
const jsonLog = {
  summary: {},
  jest: [],
  tsconfig: [],
  swcrc: [],
  nx: [],
  errors: [],
};
function log(line) {
  textLog.push(line);
  if (VERBOSE) console.log(line);
}

function listFiles(root, matchFn) {
  const out = [];
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      if (['node_modules', '.git', 'dist', 'coverage'].includes(entry))
        continue;
      const p = path.join(dir, entry);
      const st = fs.statSync(p);
      st.isDirectory() ? walk(p) : matchFn(p) && out.push(p);
    }
  })(root);
  return out;
}

function tryRequire(file) {
  try {
    delete require.cache[require.resolve(file)];
    return { ok: true, value: require(file) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function analyzeJestConfigFile(file) {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  const record = { file: rel, issues: [], notes: [] };

  // 1) Heuristic: unquoted transform keys — ignore comment lines
  const tBlock = content.match(/transform\s*:\s*{([\s\S]*?)}/m);
  if (tBlock) {
    const inner = tBlock[1];
    const badLine = inner.split('\n').find((line) => {
      const t = line.trim();
      if (!t || t.startsWith('//')) return false;
      // If the key starts with ^ or / and is not quoted, warn
      return /^(\^|\/)/.test(t);
    });
    if (badLine) {
      record.issues.push({
        code: 'JEST_TRANSFORM_KEY_UNQUOTED',
        message:
          'transform key appears unquoted; regex keys must be strings like ' +
          `"'^.+\\\\.(t|j)sx?$' : [...]". Offending line: ${badLine.trim()}`,
      });
    }
  }

  // 2) superjson whitelist: robust slice around transformIgnorePatterns to tolerate nested brackets
  const ti = content.indexOf('transformIgnorePatterns');
  if (ti === -1) {
    record.notes.push('No transformIgnorePatterns found (may be fine).');
  } else {
    const slice = content.slice(ti, ti + 800); // look ahead safely
    if (!/superjson/i.test(slice)) {
      record.issues.push({
        code: 'JEST_SUPERJSON_NOT_WHITELISTED',
        message:
          "superjson (ESM) not whitelisted for transform; add '/node_modules/(?!superjson)' or an equivalent PNPM-safe pattern.",
      });
    }
  }

  // 3) pathsToModuleNameMapper presence (alias support) — warn if missing
  if (!/pathsToModuleNameMapper/.test(content)) {
    record.notes.push(
      'pathsToModuleNameMapper not detected (alias mapping may be missing).'
    );
  }

  // 4) Attempt to require if it's .js (don’t try TS configs)
  if (file.endsWith('.js')) {
    const { ok, error } = tryRequire(path.resolve(file));
    if (!ok) {
      record.issues.push({
        code: 'JEST_CONFIG_SYNTAX',
        message: `Failed to load config: ${
          error && error.message ? error.message : String(error)
        }`,
      });
    }
  } else {
    record.notes.push(
      'TS jest config detected (ensure ts-node/ts-jest/babel or convert to JS).'
    );
  }

  jsonLog.jest.push(record);
  if (record.issues.length) {
    log(`✗ JEST: ${rel}`);
    record.issues.forEach((i) => log(`    - [${i.code}] ${i.message}`));
  } else {
    log(`✓ JEST: ${rel}`);
  }
}

function analyzeTSConfig(file) {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
  const record = { file: rel, issues: [], notes: [], target: null };
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const target = j?.compilerOptions?.target || null;
    record.target = target;
    if (!target) record.notes.push('No compilerOptions.target set.');
  } catch (e) {
    record.issues.push({ code: 'TSCONFIG_PARSE_ERROR', message: e.message });
  }
  jsonLog.tsconfig.push(record);
  record.issues.length
    ? log(`✗ TSCONFIG: ${rel}`)
    : log(
        `✓ TSCONFIG: ${rel}${
          record.target ? ' (target=' + record.target + ')' : ''
        }`
      );
  record.issues.forEach((i) => log(`    - [${i.code}] ${i.message}`));
}

function analyzeSwcrc(file) {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
  const record = { file: rel, issues: [], notes: [], jscTarget: null };
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const tgt = j?.jsc?.target || null;
    record.jscTarget = tgt;
    if (tgt && /^es20(23|24|25)$/i.test(String(tgt))) {
      record.issues.push({
        code: 'SWCRC_ES_TOO_RECENT',
        message: `jsc.target is "${tgt}" which may not be supported by current @swc/core. Prefer "es2022" or "esnext".`,
      });
    }
  } catch (e) {
    record.issues.push({ code: 'SWCRC_PARSE_ERROR', message: e.message });
  }
  jsonLog.swcrc.push(record);
  record.issues.length
    ? log(`✗ SWCRC: ${rel}`)
    : log(
        `✓ SWCRC: ${rel}${
          record.jscTarget ? ' (jsc.target=' + record.jscTarget + ')' : ''
        }`
      );
  record.issues.forEach((i) => log(`    - [${i.code}] ${i.message}`));
}

function analyzeNxApiTestTarget() {
  const pj = path.join('apps', 'api', 'project.json');
  const rel = pj.replace(/\\/g, '/');
  const record = {
    file: rel,
    issues: [],
    notes: [],
    testCommand: null,
    jestConfigPath: null,
  };
  if (!fs.existsSync(pj)) {
    record.issues.push({
      code: 'NX_PROJECT_JSON_MISSING',
      message: 'apps/api/project.json not found.',
    });
    jsonLog.nx.push(record);
    log(`✗ NX: ${rel} missing`);
    return;
  }
  try {
    const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
    const cmd = j?.targets?.test?.options?.command || null;
    record.testCommand = cmd;
    if (!cmd) {
      record.issues.push({
        code: 'NX_TEST_TARGET_MISSING',
        message: 'apps/api test target not defined.',
      });
    } else {
      const m = cmd.match(/--config\s+([^\s]+)/);
      if (m) {
        const p = m[1];
        record.jestConfigPath = p;
        const abs = path.resolve(p);
        if (!fs.existsSync(abs))
          record.issues.push({
            code: 'JEST_CONFIG_NOT_FOUND',
            message: `Referenced config not found: ${p}`,
          });
      }
    }
  } catch (e) {
    record.issues.push({ code: 'NX_PROJECT_JSON_PARSE', message: e.message });
  }
  jsonLog.nx.push(record);
  record.issues.length
    ? log(`✗ NX: ${rel}`)
    : log(`✓ NX: ${rel} (test target present)`);
  record.issues.forEach((i) => log(`    - [${i.code}] ${i.message}`));
}

// ---- Run scans ----
log('=== Scanning Jest configs ===');
const jestFiles = listFiles(process.cwd(), (p) =>
  /jest\.config\.(js|ts)$/.test(p)
);
jestFiles.forEach(analyzeJestConfigFile);

log('\n=== Scanning tsconfig files ===');
const tsconfigs = listFiles(
  process.cwd(),
  (p) => /tsconfig\.(base|json|.*\.json)$/i.test(p) && p.endsWith('.json')
);
tsconfigs.forEach(analyzeTSConfig);

log('\n=== Scanning .swcrc files ===');
const swcrcs = listFiles(process.cwd(), (p) => path.basename(p) === '.swcrc');
swcrcs.forEach(analyzeSwcrc);

log('\n=== Checking Nx apps/api test target ===');
analyzeNxApiTestTarget();

// ---- Summaries ----
const countIssues = (arr) =>
  arr.reduce((n, r) => n + (r.issues ? r.issues.length : 0), 0);
jsonLog.summary = {
  jestFiles: jestFiles.map((f) =>
    path.relative(process.cwd(), f).replace(/\\/g, '/')
  ),
  tsconfigFiles: tsconfigs.map((f) =>
    path.relative(process.cwd(), f).replace(/\\/g, '/')
  ),
  swcrcFiles: swcrcs.map((f) =>
    path.relative(process.cwd(), f).replace(/\\/g, '/')
  ),
  issueCounts: {
    jest: countIssues(jsonLog.jest),
    tsconfig: countIssues(jsonLog.tsconfig),
    swcrc: countIssues(jsonLog.swcrc),
    nx: countIssues(jsonLog.nx),
  },
};

// ---- Write logs ----
const txtPath = path.join(LOG_DIR, 'repo-health-report.txt');
const jsonPath = path.join(LOG_DIR, 'repo-health-report.json');
fs.writeFileSync(txtPath, textLog.join('\n') + '\n', 'utf8');
fs.writeFileSync(jsonPath, JSON.stringify(jsonLog, null, 2), 'utf8');

console.log('\n--- Report written ---');
console.log('Text : ' + txtPath);
console.log('JSON : ' + jsonPath);
