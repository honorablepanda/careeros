#!/usr/bin/env node
/**
 * tools/scripts/setup-activity-ci.cjs
 *
 * Idempotently:
 *  - merges recommended scripts into root package.json
 *  - ensures devDependency: start-server-and-test
 *  - writes .github/workflows/activity-ci.yml
 *  - optionally verifies locally (dev) after setup
 *
 * Usage:
 *   node tools/scripts/setup-activity-ci.cjs [--no-install] [--verify] [--project web]
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const args = new Set(process.argv.slice(2));
const has = (k) => args.has(k);
const getArg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
};

const project = getArg('--project', 'web');
const doInstall = !has('--no-install');
const doVerify = has('--verify');

const ROOT = process.cwd();
const pkgPath = path.join(ROOT, 'package.json');
const ghDir = path.join(ROOT, '.github', 'workflows');
const ghFile = path.join(ghDir, 'activity-ci.yml');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function upsertPkg() {
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`package.json not found at ${pkgPath}`);
  }
  const pkg = readJSON(pkgPath);
  pkg.scripts ||= {};

  const scripts = {
    // strict CI check (requires server to be up)
    'activity:ci':
      'node tools/scripts/seed-and-verify-activity.cjs --host http://localhost --port 3000 --strict --out activity-ci-report.json',
    // non-strict (creates rows & checks pages, but won’t fail on missing rows)
    'activity:ci:auto':
      'node tools/scripts/seed-and-verify-activity.cjs --host http://localhost --port 3000 --out activity-ci-report.json',

    // Local fast loop: dev server → wait → non-strict check
    'ci:web':
      'start-server-and-test "pnpm -w exec nx run ' +
      project +
      ':serve" http://localhost:3000 "pnpm run activity:ci:auto"',

    // CI prod mode: next build+start (via Nx target web:start) → wait → strict check
    'ci:web:prod':
      'start-server-and-test "pnpm -w exec nx run ' +
      project +
      ':start" http://localhost:3000 "pnpm run activity:ci"',

    // optional DB migrate hook if you use a server DB in CI
    'db:migrate':
      'pnpm -w exec prisma migrate deploy || pnpm -w exec prisma db push',
  };

  let changed = false;
  for (const [k, v] of Object.entries(scripts)) {
    if (pkg.scripts[k] !== v) {
      pkg.scripts[k] = v;
      changed = true;
    }
  }

  pkg.devDependencies ||= {};
  const want = 'start-server-and-test';
  const wantVer = '^2.0.3';
  if (!pkg.devDependencies[want]) {
    pkg.devDependencies[want] = wantVer;
    changed = true;
  }

  if (changed) writeJSON(pkgPath, pkg);
  return { changed };
}

function ensureWorkflow() {
  const yaml = `name: Activity CI

on:
  pull_request:
  push:
    branches: [ main ]

jobs:
  activity:
    runs-on: ubuntu-latest
    env:
      NODE_ENV: test
      # If using a server DB, add DATABASE_URL as a repo secret
      # and uncomment the migrate step.

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - uses: pnpm/action-setup@v4
        with:
          version: 9
          run_install: true

      # If needed:
      # - run: pnpm -w exec prisma generate
      # - run: pnpm run db:migrate

      - name: Serve (prod) → wait → seed+verify (strict)
        run: pnpm run ci:web:prod

      - name: Upload activity report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: activity-ci-report
          path: activity-ci-report.json
          if-no-files-found: warn
`;

  if (!fs.existsSync(ghDir)) fs.mkdirSync(ghDir, { recursive: true });
  if (!fs.existsSync(ghFile)) {
    fs.writeFileSync(ghFile, yaml, 'utf8');
    return { wrote: true };
  }
  // If it exists, don’t overwrite; keep idempotent & safe.
  return { wrote: false };
}

function run(cmd, opts = {}) {
  cp.execSync(cmd, { stdio: 'inherit', ...opts });
}

function maybeInstall() {
  if (!doInstall) {
    console.log('• Skipping devDependency install (—no-install).');
    return;
  }
  try {
    run('pnpm -v', { stdio: 'ignore' });
  } catch {
    console.warn('! pnpm not found on PATH — skipping install step.');
    return;
  }
  console.log('→ Installing devDeps (start-server-and-test)…');
  run('pnpm i -D start-server-and-test');
}

function maybeVerify() {
  if (!doVerify) return;
  console.log('\n— Local verify (dev) —');
  console.log(
    `This will spin up ${project}:serve, wait for :3000, then run seed+verify (non-strict).`
  );
  run('pnpm run ci:web');
}

(function main() {
  console.log(`• Root: ${ROOT}`);
  console.log(`• Project: ${project}`);

  const { changed } = upsertPkg();
  console.log(changed ? '✓ package.json updated' : '• package.json already OK');

  const wf = ensureWorkflow();
  console.log(
    wf.wrote
      ? '✓ wrote .github/workflows/activity-ci.yml'
      : '• workflow already present (skip)'
  );

  maybeInstall();

  console.log('\nNext steps:');
  console.log(
    '  • Commit changes: git add -A && git commit -m "chore(ci): activity checks"'
  );
  console.log('  • Local quick check: pnpm run ci:web');
  console.log('  • CI (prod-mode) will run on PRs/ pushes.');
  console.log('  • Manual prod-mode run locally: pnpm run ci:web:prod');

  maybeVerify();
})();
