#!/usr/bin/env node
/**
 * tools/scripts/project-scan.cjs
 *
 * One-touch project scanner that:
 *  - Runs lightweight "smart" checks against source files
 *  - Optionally runs lint, Prisma validate, TypeScript noEmit checks
 *  - Optionally runs heavy Nx/Next build & Vitest (API & Web)
 * Outputs:
 *  - tools/reports/scan-YYYY-MM-DD-HH-MM-SS.log
 *  - tools/reports/scan-YYYY-MM-DD-HH-MM-SS.json
 *
 * Flags:
 *   --fast        : skip Nx/Next build step
 *   --noWeb       : skip "vitest web" tests
 *   --noApi       : skip "vitest api" tests
 *   --noLint      : skip ESLint
 *   --onlySmart   : run only smart checks (no commands)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = process.cwd();
const reportsDir = path.join(repo, 'tools', 'reports');

const args = new Set(process.argv.slice(2));
const OPTS = {
  fast: args.has('--fast'),
  noWeb: args.has('--noWeb'),
  noApi: args.has('--noApi'),
  noLint: args.has('--noLint'),
  onlySmart: args.has('--onlySmart'),
};

function nowStamp() {
  const d = new Date();
  const pad = (n) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readSafe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function exists(p) { return fs.existsSync(p); }

function timeit(fn) {
  const t0 = process.hrtime.bigint();
  try {
    const out = fn();
    const t1 = process.hrtime.bigint();
    return { out, ms: Number(t1 - t0) / 1e6 };
  } catch (e) {
    const t1 = process.hrtime.bigint();
    return { err: e, ms: Number(t1 - t0) / 1e6 };
  }
}

function runCmd(name, cmd, args, opts = {}) {
  const started = process.hrtime.bigint();
  const res = spawnSync(cmd, args, {
    cwd: repo,
    shell: process.platform === 'win32',
    encoding: 'utf8',
    env: process.env,
    ...opts,
  });
  const ended = process.hrtime.bigint();

  const duration = Number(ended - started) / 1e9;
  const status = res.status === null ? (res.error ? -1 : 0) : res.status;

  return {
    kind: 'command',
    name,
    cmd: [cmd, ...args].join(' '),
    status,
    duration,
    stdout: res.stdout || '',
    stderr: res.stderr || (res.error ? String(res.error) : ''),
  };
}

function firstLines(str, maxLines = 200) {
  const lines = (str || '').split(/\r?\n/);
  return lines.slice(0, maxLines).join('\n');
}

function sectionLog(lines, header = null) {
  const arr = Array.isArray(lines) ? lines : [lines];
  const head = header ? `${header}\n` : '';
  return head + arr.join('\n') + '\n';
}

// ------------------ Smart checks ------------------

function smartSummaryRouterShape() {
  const file = path.join(repo, 'apps', 'api', 'src', 'router', 'summary.ts');
  const src = readSafe(file) || '';
  const ok =
    /export\s+const\s+summaryRouter\s*=/.test(src) &&
    /statusCounts/.test(src) &&
    /latest/.test(src);

  return {
    kind: 'smart',
    name: 'summary router shape',
    ok,
    details: `exports router: ${/export\s+const\s+summaryRouter\s*=/.test(src)}\n` +
      `has statusCounts: ${/statusCounts/.test(src)}\n` +
      `has latest: ${/latest/.test(src)}`,
  };
}

function smartVitestSetupTrpcMock() {
  const file = path.join(repo, 'web', 'vitest.setup.ts');
  const src = readSafe(file) || '';
  const hasJestDom = /@testing-library\/jest-dom/.test(src);
  const hasViMock = /vi\.mock\(\s*["']@\/trpc["']\s*,?/.test(src);
  const hasSettingsUpdateUseMutation = /settings:\s*{[\s\S]*?\bupdate\b:\s*{[\s\S]*?\buseMutation\b/.test(src);
  // error pattern: “return { … }” directly inside vi.mock callback body
  const returnInsideMock = /vi\.mock\(\s*["']@\/trpc["']\s*,\s*\(\)\s*=>\s*{[\s\S]*?\breturn\b[\s\S]*?}\s*\)/m.test(src);

  return {
    kind: 'smart',
    name: 'vitest setup trpc mock',
    ok: hasJestDom && hasViMock && hasSettingsUpdateUseMutation && !returnInsideMock,
    details:
      `has jest-dom import: ${hasJestDom}\n` +
      `has vi.mock("@/trpc"): ${hasViMock}\n` +
      `has settings.update.useMutation: ${hasSettingsUpdateUseMutation}\n` +
      `return inside mock: ${returnInsideMock}`,
  };
}

function smartActivityPageRoleField() {
  // There are 2 activity pages: nested route and flat route
  const files = [
    path.join(repo, 'web', 'app', 'tracker', '[id]', 'activity', 'page.tsx'),
    path.join(repo, 'web', 'app', 'tracker', 'activity', 'page.tsx'),
    path.join(repo, 'web', 'src', 'app', 'tracker', 'activity', 'page.tsx'),
  ];
  let selectsRole = false;
  let rendersRole = false;

  for (const f of files) {
    const src = readSafe(f);
    if (!src) continue;
    if (/select:\s*{[\s\S]*\brole\b\s*:\s*true/.test(src)) selectsRole = true;
    if (/\bapp\.role\b/.test(src)) rendersRole = true;
  }

  return {
    kind: 'smart',
    name: 'activity page role field',
    ok: !rendersRole || selectsRole,
    details: `selects role: ${selectsRole}\nrenders role: ${rendersRole}`,
  };
}

function smartWebVitestConfigBasics() {
  const file = path.join(repo, 'web', 'vitest.config.ts');
  const src = readSafe(file) || '';
  const jsdom = /environment:\s*['"]jsdom['"]/.test(src);
  const setupIncludes = /setupFiles:\s*\[\s*['"].*vitest\.setup\.ts['"]\s*]/.test(src);
  // avoid “spec ” (with trailing space) mistakes
  const includeOk = /include:\s*\[\s*['"].*\.(?:test|spec)\.tsx?['"]\s*]/.test(src);

  return {
    kind: 'smart',
    name: 'web vitest.config.ts basics',
    ok: jsdom && setupIncludes && includeOk,
    details: `jsdom: ${jsdom}\nsetupFiles includes vitest.setup.ts: ${setupIncludes}\ninclude glob OK: ${includeOk}`,
  };
}

// ------------------ Main ------------------

const stamp = nowStamp();
ensureDir(reportsDir);
const logPath = path.join(reportsDir, `scan-${stamp}.log`);
const jsonPath = path.join(reportsDir, `scan-${stamp}.json`);

const LOG = [];
const JSON_RESULTS = {
  timestamp: stamp,
  options: OPTS,
  results: [],
};

function pushSmart(res, durationMs) {
  JSON_RESULTS.results.push({ ...res, duration: +(durationMs / 1000).toFixed(3) });
  LOG.push(sectionLog(
    [
      `> ${res.name}`,
      `status: ${res.ok ? 'OK' : 'ISSUE'}`,
      res.details,
    ].join('\n')
  ));
}

function runSmartChecks() {
  const checks = [
    smartSummaryRouterShape,
    smartVitestSetupTrpcMock,
    smartActivityPageRoleField,
    smartWebVitestConfigBasics,
  ];

  LOG.push('──────────────\n Smart checks\n──────────────\n');

  for (const c of checks) {
    const { out, err, ms } = timeit(c);
    if (err) {
      pushSmart({ kind: 'smart', name: c.name || 'unknown', ok: false, details: String(err) }, ms);
    } else {
      pushSmart(out, ms);
    }
  }
}

function runTooling() {
  LOG.push('\n──────────────────\n Tools & commands\n──────────────────\n');

  if (!OPTS.noLint && !OPTS.onlySmart) {
    JSON_RESULTS.results.push(runCmd(
      'eslint (report only)',
      'pnpm',
      ['-w', 'exec', 'eslint', '.', '--ext', '.ts,.tsx', '--format', 'stylish'],
    ));
  } else {
    LOG.push('skipped eslint (flag)\n');
  }

  if (!OPTS.onlySmart) {
    JSON_RESULTS.results.push(runCmd(
      'prisma validate',
      'pnpm',
      ['-w', 'exec', 'prisma', 'validate'],
    ));

    // Type-check: API (only if tsconfig exists)
    const apiTsconfig = path.join(repo, 'apps', 'api', 'tsconfig.json');
    if (exists(apiTsconfig)) {
      JSON_RESULTS.results.push(runCmd(
        'tsc --noEmit (api)',
        'pnpm',
        ['-w', 'exec', 'tsc', '-p', 'apps/api/tsconfig.json', '--noEmit'],
      ));
    } else {
      JSON_RESULTS.results.push({
        kind: 'command',
        name: 'tsc --noEmit (api)',
        cmd: 'skipped (no apps/api/tsconfig.json)',
        status: null,
        duration: 0,
        stdout: '',
        stderr: '',
      });
      LOG.push('skipped ts type-check for api (no apps/api/tsconfig.json)\n');
    }

    // Type-check: WEB
    JSON_RESULTS.results.push(runCmd(
      'tsc --noEmit (web)',
      'pnpm',
      ['-w', 'exec', 'tsc', '-p', 'web/tsconfig.json', '--noEmit'],
    ));
  }
}

function runHeavy() {
  if (OPTS.onlySmart) return;

  // Nx/Next build (skip if --fast)
  if (!OPTS.fast) {
    JSON_RESULTS.results.push(runCmd(
      'nx build web',
      'pnpm',
      ['-w', 'exec', 'nx', 'run', 'web:build'],
    ));
  } else {
    LOG.push('skipped nx build (fast mode)\n');
  }

  // Vitest (api)
  if (!OPTS.noApi) {
    JSON_RESULTS.results.push(runCmd(
      'vitest api',
      'pnpm',
      ['-w', 'test:api'],
    ));
  } else {
    LOG.push('skipped vitest api (flag)\n');
  }

  // Vitest (web)
  if (!OPTS.noWeb) {
    JSON_RESULTS.results.push(runCmd(
      'vitest web',
      'pnpm',
      ['-w', 'test:web'],
    ));
  } else {
    LOG.push('skipped vitest web (flag)\n');
  }
}

function writeReports() {
  // Compose human readable log
  const header =
`──────────────────────────────────────
 # Project scan @ ${stamp}
──────────────────────────────────────
log: ${logPath}
json: ${jsonPath}
`;
  const body = LOG.join('\n');

  let commandsLog = '';
  for (const r of JSON_RESULTS.results) {
    if (r.kind !== 'command') continue;
    commandsLog += `\n> ${r.name}\n$ ${r.cmd}\nexit: ${r.status}\n--- stdout ---\n${firstLines(r.stdout)}\n\n--- stderr ---\n${firstLines(r.stderr)}\n`;
  }

  const finalLog = `${header}\n${body}\n${commandsLog}\n`;

  fs.writeFileSync(logPath, finalLog, 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(JSON_RESULTS, null, 2), 'utf8');

  console.log('— Scan complete —');
  console.log('Text report:', path.relative(repo, logPath));
  console.log('JSON report:', path.relative(repo, jsonPath));
}

// Run
runSmartChecks();
runTooling();
runHeavy();
writeReports();
