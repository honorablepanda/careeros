#!/usr/bin/env node
/* Harden the local CI loop:
 * - Ensure cross-env is installed at workspace root
 * - Patch package.json "ci:web" to disable Nx Daemon
 * - Optional: clean caches
 * - Run the local CI loop
 *
 * Usage:
 *   node tools/scripts/harden-ci-web.cjs           # apply + run with defaults
 *   node tools/scripts/harden-ci-web.cjs --port 3000
 *   node tools/scripts/harden-ci-web.cjs --no-clean
 *   node tools/scripts/harden-ci-web.cjs --no-run
 *   node tools/scripts/harden-ci-web.cjs --dry-run
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const cwd = process.cwd();
const pkgPath = path.join(cwd, 'package.json');

const argv = process.argv.slice(2);
const getFlag = (name, def=false) => {
  const on = argv.some(a => a === `--${name}`);
  const off = argv.some(a => a === `--no-${name}`);
  return off ? false : (on ? true : def);
};
const getOpt = (name, def) => {
  const i = argv.findIndex(a => a === `--${name}`);
  return i >= 0 && argv[i+1] ? argv[i+1] : def;
};

const DRY = getFlag('dry-run', false);
const RUN = getFlag('run', true);
const CLEAN = getFlag('clean', true);
const PORT = getOpt('port', '3000');

function log(msg){ console.log(msg); }
function info(msg){ console.log('• ' + msg); }
function ok(msg){ console.log('✓ ' + msg); }
function warn(msg){ console.warn('! ' + msg); }
function fail(msg){ console.error('✗ ' + msg); }

function sh(cmd, opts={}) {
  info(`$ ${cmd}`);
  if (DRY) return;
  cp.execSync(cmd, { stdio: 'inherit', ...opts });
}

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJSON(p, obj) {
  const pretty = JSON.stringify(obj, null, 2);
  fs.writeFileSync(p, pretty + '\n', 'utf8');
}

function hasDep(pkg, name) {
  return Boolean(
    pkg.dependencies?.[name] ||
    pkg.devDependencies?.[name] ||
    pkg.optionalDependencies?.[name]
  );
}

function patchCiScript(pkg) {
  pkg.scripts = pkg.scripts || {};
  const desired = `start-server-and-test "cross-env NX_DAEMON=false pnpm -w exec nx run web:serve --port=${PORT}" http://localhost:${PORT} "pnpm run activity:ci:auto"`;

  if (pkg.scripts['ci:web'] && pkg.scripts['ci:web'] === desired) {
    ok('package.json scripts already OK');
    return false;
  }

  if (!pkg.scripts['activity:ci:auto']) {
    // keep your existing script name if it differs, but in your repo it exists already
    // we won’t invent a new one — just warn if missing.
    warn('script "activity:ci:auto" not found — ensure seed-and-verify script exists.');
  }

  pkg.scripts['ci:web'] = desired;
  ok('patched "ci:web" script');
  return true;
}

function ensureCrossEnv(pkg) {
  if (hasDep(pkg, 'cross-env')) {
    ok('devDep cross-env already present');
    return;
  }
  info('installing cross-env at workspace root');
  sh('pnpm -w add -D cross-env');
}

function maybeWarnReactQuery(pkg) {
  // If @tanstack/react-query v5 present + @trpc/react-query v10 → warn
  const rq = (pkg.dependencies?.['@tanstack/react-query'] || pkg.devDependencies?.['@tanstack/react-query'] || '').trim();
  const trpcRQ = (pkg.dependencies?.['@trpc/react-query'] || pkg.devDependencies?.['@trpc/react-query'] || '').trim();
  const isRQ5 = rq.startsWith('5') || rq.startsWith('^5') || rq.startsWith('~5') || rq.includes('^5.');
  const isTRPC10 = trpcRQ.startsWith('10') || trpcRQ.startsWith('^10');

  if (isRQ5 && isTRPC10) {
    warn('Detected @tanstack/react-query v5 with @trpc/react-query v10 — peer mismatch. Consider: pnpm -w add @tanstack/react-query@^4');
  }
}

function cleanCaches() {
  if (!CLEAN) { info('skip cache cleanup (--no-clean)'); return; }
  const paths = [
    '.nx/workspace-data',
    'web/.next',
    'apps/web/.next' // legacy, harmless if missing
  ];
  for (const p of paths) {
    if (DRY) { info(`[dry-run] rimraf ${p}`); continue; }
    try {
      if (fs.existsSync(path.join(cwd, p))) {
        info(`rimraf ${p}`);
        // cross-platform rimraf: use node to remove recursively
        fs.rmSync(path.join(cwd, p), { recursive: true, force: true });
      }
    } catch (e) { /* ignore */ }
  }
}

(function main() {
  log('— Harden CI Web —');

  if (!fs.existsSync(pkgPath)) {
    fail(`No package.json at ${pkgPath}`);
    process.exit(1);
  }

  const pkg = readJSON(pkgPath);

  // 1) Ensure cross-env
  ensureCrossEnv(pkg);

  // 2) Patch ci:web
  const changed = patchCiScript(pkg);

  if (changed && !DRY) {
    // backup
    const bak = pkgPath + '.bak.' + Date.now();
    fs.copyFileSync(pkgPath, bak);
    info(`backed up package.json → ${path.relative(cwd, bak)}`);
    writeJSON(pkgPath, pkg);
  }

  // 3) Warn (optional) about react-query v5 + trpc v10
  maybeWarnReactQuery(pkg);

  // 4) Clean caches (optional)
  cleanCaches();

  // 5) Run the quick loop
  if (!RUN) {
    info('skipping run (--no-run). You can now do: pnpm run ci:web');
    ok('Done.');
    return;
  }

  info('running local CI loop…');
  try {
    sh('pnpm run ci:web');
    ok('Local CI loop finished.');
  } catch (e) {
    fail('Local CI loop failed.');
    process.exit(1);
  }
})();
