#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Scan all Next.js page files for common issues and optionally run TS/ESLint checks.
 *
 * Outputs:
 *  - tools/reports/pages-scan-YYYY-MM-DD-HH-mm-ss.log
 *  - tools/reports/pages-scan-YYYY-MM-DD-HH-mm-ss.json
 *
 * Usage:
 *   node tools/scripts/scan-pages.cjs
 *   node tools/scripts/scan-pages.cjs --fast        # skip tsc/eslint (much faster)
 *   node tools/scripts/scan-pages.cjs --no-tsc      # skip TypeScript check
 *   node tools/scripts/scan-pages.cjs --no-eslint   # skip ESLint check
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const webDir = path.join(root, 'web'); // adjust if your web app root is different
const reportsDir = path.join(root, 'tools', 'reports');

const args = new Set(process.argv.slice(2));
const FAST = args.has('--fast');
const RUN_TSC = FAST ? false : !args.has('--no-tsc');
const RUN_ESLINT = FAST ? false : !args.has('--no-eslint');

// -------- helpers --------
const ts = () => {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
};
const ensureDir = (p) => {
  fs.mkdirSync(p, { recursive: true });
};
const readFile = (p) => fs.readFileSync(p, 'utf8');

function walk(dir, matcher) {
  const out = [];
  (function rec(current) {
    const entries = fs.existsSync(current)
      ? fs.readdirSync(current, { withFileTypes: true })
      : [];
    for (const e of entries) {
      const fp = path.join(current, e.name);
      if (e.isDirectory()) rec(fp);
      else if (matcher(fp)) out.push(fp);
    }
  })(dir);
  return out;
}

function run(cmd, args, cwd = root) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    cmd: [cmd].concat(args).join(' '),
  };
}

// -------- scan logic --------
const pageMatchers = [
  // top-level app dir (app router)
  (fp) =>
    /(?:^|[\\/])web[\\/](?:src[\\/])?app[\\/].*?page\.(tsx|ts|jsx|js)$/.test(
      fp
    ),
  // a few app sub-locations you’re using
  (fp) => /(?:^|[\\/])web[\\/]app[\\/].*?\.(tsx|ts)$/.test(fp), // e.g. web/app/tracker/activity/page.tsx (built copies)
];

// collect files
const allFiles = walk(webDir, (fp) => {
  const rel = path.relative(webDir, fp);
  // ignore build outputs
  if (/^[\\/]?\.next[\\/]/.test(rel)) return false;
  if (/node_modules/.test(fp)) return false;
  // match pages and common UI files
  return pageMatchers.some((m) => m(fp)) || /src[\\/].*\.(tsx|ts)$/.test(rel);
});

// analysis regexes
const reTrpcHook =
  /\btrpc\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\.(useQuery|useMutation)\b/g;
const rePrismaSelectRole = /\bselect\s*:\s*{[^}]*\brole\s*:\s*true/gs; // naive flag for role in select
const reDotRole = /(?<!['"`])\brole\b(?!['"`])\s*[:.]/g; // rough signal of reading a role property
const reAnyWarning = /@typescript-eslint\/no-explicit-any/; // to highlight files with “any” rule triggers

const findings = [];

for (const fp of allFiles) {
  const rel = path.relative(root, fp);
  let content;
  try {
    content = readFile(fp);
  } catch {
    continue;
  }

  const trpc = [];
  let m;
  while ((m = reTrpcHook.exec(content))) {
    trpc.push({ router: m[1], procedure: m[2], hook: m[3], index: m.index });
  }

  const prismaRoleSelect = rePrismaSelectRole.test(content);
  rePrismaSelectRole.lastIndex = 0; // reset for next file

  const dotRoleHits = [...content.matchAll(reDotRole)].map((mm) => mm.index);
  const hasAnyRule = reAnyWarning.test(content);

  // Does the file look like a Next page?
  const isPage = /[\\/]app[\\/].*page\.(tsx|ts|jsx|js)$/.test(fp);

  if (
    trpc.length ||
    prismaRoleSelect ||
    dotRoleHits.length ||
    isPage ||
    hasAnyRule
  ) {
    findings.push({
      file: rel,
      isPage,
      trpcHooks: trpc,
      prismaSelectHasRole: prismaRoleSelect,
      roleReads: dotRoleHits, // locations where `.role` might be referenced
      hasNoExplicitAnyRule: hasAnyRule,
    });
  }
}

// optional: TypeScript project check (noEmit)
let tsc = null;
if (RUN_TSC) {
  // Try to find the correct web tsconfig (fall back to repo root)
  const tsconfigCandidates = [
    path.join(webDir, 'tsconfig.json'),
    path.join(webDir, 'tsconfig.app.json'),
    path.join(root, 'tsconfig.json'),
  ];
  const tsconfig = tsconfigCandidates.find((p) => fs.existsSync(p));
  if (tsconfig) {
    tsc = run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [
      '-w',
      'exec',
      'tsc',
      '-p',
      tsconfig,
      '--noEmit',
      '--pretty',
      'false',
    ]);
  } else {
    tsc = {
      status: -1,
      stdout: '',
      stderr: 'No tsconfig found for web app.',
      cmd: 'tsc (skipped)',
    };
  }
}

// optional: ESLint check (JSON formatter)
let eslint = null;
if (RUN_ESLINT) {
  const pattern = path.join('web', '**', '*.{ts,tsx}');
  eslint = run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [
    '-w',
    'exec',
    'eslint',
    pattern,
    '-f',
    'json',
  ]);
  try {
    // keep parsed output to summarize top issues
    eslint.parsed = JSON.parse(eslint.stdout || '[]');
  } catch {
    eslint.parsed = [];
  }
}

// -------- write reports --------
ensureDir(reportsDir);
const stamp = ts().replace('T', '-').slice(0, 19);
const jsonPath = path.join(reportsDir, `pages-scan-${stamp}.json`);
const logPath = path.join(reportsDir, `pages-scan-${stamp}.log`);

const summary = {
  generatedAt: new Date().toISOString(),
  root,
  webDir,
  fast: FAST,
  ran: {
    tsc: RUN_TSC,
    eslint: RUN_ESLINT,
  },
  counts: {
    scannedFiles: allFiles.length,
    flaggedFiles: findings.length,
    pagesFlagged: findings.filter((f) => f.isPage).length,
    trpcHookSites: findings.reduce((n, f) => n + (f.trpcHooks?.length || 0), 0),
    prismaRoleSelectFiles: findings.filter((f) => f.prismaSelectHasRole).length,
    roleReadsFiles: findings.filter((f) => (f.roleReads?.length || 0) > 0)
      .length,
  },
  findings,
  tsc,
  eslint: RUN_ESLINT
    ? {
        status: eslint.status,
        cmd: eslint.cmd,
        issues: (eslint.parsed || []).flatMap((f) =>
          (f.messages || []).map((msg) => ({
            filePath: f.filePath,
            ruleId: msg.ruleId,
            severity: msg.severity,
            line: msg.line,
            column: msg.column,
            message: msg.message,
          }))
        ),
      }
    : null,
};

fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf8');

// human log
const lines = [];
lines.push('— Pages Scan —');
lines.push(`Root: ${root}`);
lines.push(`Web dir: ${webDir}`);
lines.push(
  `Mode: ${
    FAST
      ? 'FAST (no tsc, no eslint)'
      : `FULL (tsc=${RUN_TSC}, eslint=${RUN_ESLINT})`
  }`
);
lines.push('');
lines.push('== Summary ==');
lines.push(JSON.stringify(summary.counts, null, 2));
lines.push('');
lines.push('== Findings (per file) ==');
for (const f of findings) {
  lines.push(`• ${f.file}`);
  if (f.isPage) lines.push('  - kind: page file');
  if (f.trpcHooks?.length) {
    const hooks = f.trpcHooks
      .map((h) => `${h.router}.${h.procedure}.${h.hook}`)
      .filter((v, i, a) => a.indexOf(v) === i);
    lines.push(`  - trpc hooks: ${hooks.join(', ')}`);
  }
  if (f.prismaSelectHasRole)
    lines.push(`  - prisma select contains "role: true" (verify model)`);
  if (f.roleReads?.length)
    lines.push(`  - potential ".role" reads (${f.roleReads.length} hits)`);
  if (f.hasNoExplicitAnyRule)
    lines.push(`  - file has @typescript-eslint/no-explicit-any warnings`);
}
lines.push('');
if (RUN_TSC && summary.tsc) {
  lines.push('== TypeScript check ==');
  lines.push(`cmd: ${summary.tsc.cmd}`);
  lines.push(`exit: ${summary.tsc.status}`);
  if (summary.tsc.stderr.trim()) lines.push(summary.tsc.stderr.trim());
  if (summary.tsc.stdout.trim()) lines.push(summary.tsc.stdout.trim());
  lines.push('');
}
if (RUN_ESLINT && summary.eslint) {
  lines.push('== ESLint (top 50 issues) ==');
  const top = (summary.eslint.issues || []).slice(0, 50);
  for (const i of top) {
    lines.push(
      `- ${path.relative(root, i.filePath)}:${i.line}:${i.column} [${
        i.ruleId || 'rule?'
      }] ${i.message}`
    );
  }
  lines.push('');
}

fs.writeFileSync(logPath, lines.join('\n'), 'utf8');

console.log('— Scan complete —');
console.log('Text report:', path.relative(root, logPath));
console.log('JSON report:', path.relative(root, jsonPath));
