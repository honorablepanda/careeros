#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const WEB = path.join(ROOT, 'apps', 'web');
const PROJECT_JSON = path.join(WEB, 'project.json');
const NEXT_DIR = path.join(WEB, '.next');
const NX_CACHE = path.join(ROOT, '.nx', 'cache');

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}
function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}
function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {}
}

function logHeader(title) {
  console.log('\n' + '—'.repeat(80));
  console.log(title);
  console.log('—'.repeat(80));
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: 'inherit', // <- stream all logs to your terminal
    env: {
      ...process.env,
      NX_DAEMON: 'false',
      NX_VERBOSE_LOGGING: 'true',
      FORCE_COLOR: '1',
      ...opts.env,
    },
    cwd: opts.cwd || ROOT,
    shell: process.platform === 'win32', // helpful on Windows for pnpm -w exec
  });
  return res.status === 0;
}

(function main() {
  logHeader('Environment');
  console.log(`Node:   ${process.version}`);
  console.log(`Root:   ${ROOT}`);
  console.log(`Web:    ${WEB}`);
  console.log(
    `Exists: project.json=${exists(PROJECT_JSON)}, .next=${exists(
      NEXT_DIR
    )}, nx cache=${exists(NX_CACHE)}`
  );

  logHeader('Inspecting apps/web/project.json (if present)');
  if (exists(PROJECT_JSON)) {
    const pj = readJson(PROJECT_JSON);
    if (pj) {
      console.log(
        JSON.stringify(
          {
            name: pj.name,
            root: pj.root,
            sourceRoot: pj.sourceRoot,
            targets: pj.targets ? Object.keys(pj.targets) : [],
            build: pj.targets?.build,
            serve: pj.targets?.serve,
          },
          null,
          2
        )
      );
    } else {
      console.log('(!) Could not parse apps/web/project.json');
    }
  } else {
    console.log('(!) apps/web/project.json not found.');
  }

  logHeader('nx show project web --json');
  run('pnpm', ['-w', 'exec', 'nx', 'show', 'project', 'web', '--json']) ||
    console.log(
      '↑ If this failed, project "web" might be named differently or misconfigured.'
    );

  logHeader('nx show project web (human-friendly)');
  run('pnpm', ['-w', 'exec', 'nx', 'show', 'project', 'web']) ||
    console.log('↑ Failed.');

  logHeader('Clearing Next & Nx cache');
  rmrf(NEXT_DIR);
  rmrf(NX_CACHE);
  console.log('Cleared apps/web/.next and .nx/cache');

  // 1) Try Nx (run-style)
  logHeader(
    'Attempt 1: pnpm -w exec nx run web:build --skip-nx-cache --verbose'
  );
  if (
    run('pnpm', [
      '-w',
      'exec',
      'nx',
      'run',
      'web:build',
      '--skip-nx-cache',
      '--verbose',
    ])
  ) {
    console.log('✓ Build ok (run-style)');
    return;
  }
  console.log('✗ Attempt 1 failed.');

  // 2) Try Nx (target-style)
  logHeader('Attempt 2: pnpm -w exec nx build web --skip-nx-cache --verbose');
  if (
    run('pnpm', [
      '-w',
      'exec',
      'nx',
      'build',
      'web',
      '--skip-nx-cache',
      '--verbose',
    ])
  ) {
    console.log('✓ Build ok (target-style)');
    return;
  }
  console.log('✗ Attempt 2 failed.');

  // 3) Try plain Next (bypasses Nx). This isolates whether Nx wiring is the culprit.
  logHeader('Attempt 3: Plain Next build inside apps/web (bypass Nx)');
  if (!exists(path.join(WEB, 'package.json'))) {
    console.log(
      '(!) apps/web/package.json missing — plain Next build may not work if web app relies on root deps only.'
    );
  }
  if (run('pnpm', ['-w', 'exec', 'next', 'build'], { cwd: WEB })) {
    console.log(
      '✓ next build succeeded in apps/web (Nx config may be the issue).'
    );
    return;
  }
  console.log(
    '✗ Attempt 3 failed: next build also failed. Check the error above (TS/ESLint/imports, etc.).'
  );

  logHeader('What to look for next');
  console.log(
    [
      '• If ALL attempts failed: the error you saw above is the root cause (e.g., TypeScript error, missing import).',
      '• If ONLY Nx failed but Next succeeded: inspect apps/web/project.json targets.build.executor and options.',
      '• Verify project name: run "pnpm -w exec nx show projects" and confirm "web" exists.',
      '• If project name differs, replace "web" in the commands with the real name.',
      '• Ensure project.json has a "build" target and it points to a Next.js executor (e.g., @nx/next:build).',
    ].join('\n')
  );
})();
