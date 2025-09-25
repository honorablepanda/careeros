/**
 * Jest → Vitest cleanup (idempotent, with dry-run & backups)
 * Usage:
 *   node tools/scripts/auto-migrate-jest-to-vitest.cjs --dry
 *   node tools/scripts/auto-migrate-jest-to-vitest.cjs
 *   node tools/scripts/auto-migrate-jest-to-vitest.cjs --force   # skip pre-test check
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const ROOT = process.cwd();

function sh(cmd) {
  return cp.spawnSync(cmd, { shell: true, stdio: 'pipe', encoding: 'utf8' });
}
function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJSON(p, obj) {
  const body = JSON.stringify(obj, null, 2) + '\n';
  if (DRY) console.log(`[dry] write ${p}\n${body}`);
  else fs.writeFileSync(p, body, 'utf8');
}
function backupFile(src, backupDir) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(backupDir, { recursive: true });
  const dst = path.join(backupDir, path.basename(src));
  if (DRY) console.log(`[dry] move ${src} -> ${dst}`);
  else fs.renameSync(src, dst);
}

function vitestRunDirect(configPath) {
  const cmd = `pnpm -w exec vitest run --config ${configPath}`;
  const r = sh(cmd);
  return r.status === 0;
}

function precheck() {
  if (FORCE) return true;
  console.log('⏳ Running vitest (api)…');
  if (!vitestRunDirect('apps/api/vitest.config.ts')) {
    console.error('❌ Vitest api failed. Fix or use --force.');
    return false;
  }
  console.log('⏳ Running vitest (web)…');
  if (!vitestRunDirect('apps/web/vitest.config.ts')) {
    console.error('❌ Vitest web failed. Fix or use --force.');
    return false;
  }
  console.log('✅ Vitest suites passed.');
  return true;
}

function scanAndBackupJestConfigs() {
  const backupDir = path.join(
    ROOT,
    'tools',
    'backups',
    `jest-${new Date().toISOString().replace(/[:.]/g, '-')}`
  );
  const jestFiles = [
    'jest.config.js',
    'jest.config.cjs',
    'jest.config.ts',
    'jest.preset.js',
    'jest.setup.js',
    'jest.setup.ts',
    'setup-jest.ts',
  ];
  const found = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (
        jestFiles.includes(name) ||
        /jest\.config\.(js|ts|cjs)$/.test(name)
      )
        found.push(p);
    }
  }
  ['.', 'apps', 'libs'].forEach((base) => {
    const p = path.join(ROOT, base);
    if (fs.existsSync(p)) walk(p);
  });
  if (found.length)
    console.log(`���  Backing up ${found.length} Jest file(s)…`);
  for (const f of found) backupFile(f, backupDir);
}

function rewriteRootScripts() {
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = readJSON(pkgPath);
  pkg.scripts = pkg.scripts || {};
  // remove obvious jest scripts
  for (const k of Object.keys(pkg.scripts)) {
    const v = pkg.scripts[k] || '';
    if (/\bjest\b/i.test(v) || /^test:.*jest/.test(k) || k === 'jest') {
      if (DRY) console.log(`[dry] remove script ${k}`);
      else delete pkg.scripts[k];
    }
  }
  // ensure vitest scripts exist
  pkg.scripts['test:api'] ||= 'vitest run --config apps/api/vitest.config.ts';
  pkg.scripts['test:web'] ||= 'vitest run --config apps/web/vitest.config.ts';
  pkg.scripts['test'] ||= 'pnpm -w -r --parallel run test:*';
  writeJSON(pkgPath, pkg);
}

function rewireNxProjectTests() {
  const projects = [];
  function walk(base) {
    const dir = path.join(ROOT, base);
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        const pj = path.join(p, 'project.json');
        if (fs.existsSync(pj)) projects.push(p);
        walk(p);
      }
    }
  }
  walk('apps');
  walk('libs');
  let patched = 0;
  for (const dir of projects) {
    const pjPath = path.join(dir, 'project.json');
    const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
    if (
      pj.targets &&
      pj.targets.test &&
      pj.targets.test.executor === '@nrwl/jest:jest'
    ) {
      const rel = path.relative(ROOT, dir).replace(/\\/g, '/');
      const vitestConfig = rel.startsWith('apps/web')
        ? 'apps/web/vitest.config.ts'
        : rel.startsWith('apps/api')
        ? 'apps/api/vitest.config.ts'
        : null;
      if (vitestConfig) {
        pj.targets.test = {
          executor: '@nx/workspace:run-commands',
          options: { command: `vitest run --config ${vitestConfig}` },
        };
        patched++;
        if (DRY) console.log(`[dry] rewrite test target in ${pjPath}`);
        else
          fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2) + '\n', 'utf8');
      }
    }
  }
  if (patched)
    console.log(`��� Rewired ${patched} Nx test target(s) to Vitest.`);
}

function suggestJestRemoval() {
  const rootPkgPath = path.join(ROOT, 'package.json');
  const MAYBE = [
    'jest',
    'ts-jest',
    '@types/jest',
    'babel-jest',
    'jest-environment-jsdom',
    'identity-obj-proxy',
    '@nrwl/jest',
    '@nx/jest',
  ];
  const hits = new Set();
  function scanPkg(p) {
    if (!fs.existsSync(p)) return;
    const pkg = readJSON(p);
    for (const sec of [
      'devDependencies',
      'dependencies',
      'optionalDependencies',
    ]) {
      if (pkg[sec])
        for (const name of MAYBE) if (pkg[sec][name]) hits.add(name);
    }
  }
  scanPkg(rootPkgPath);
  for (const base of ['apps', 'libs']) {
    const dir = path.join(ROOT, base);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name, 'package.json');
      if (fs.existsSync(p)) scanPkg(p);
    }
  }
  if (hits.size) {
    console.log('\n��� You can remove these Jest packages:');
    console.log(`pnpm -w remove ${Array.from(hits).join(' ')}`);
  } else {
    console.log('\n✅ No obvious Jest packages found.');
  }
}

function main() {
  // warn if dirty
  const st = sh('git status --porcelain');
  if (st.status !== 0) {
    console.error(st.stderr || st.stdout);
    process.exit(1);
  }
  if (st.stdout.trim() && !DRY)
    console.warn('⚠ Working tree has changes. Commit first for easy rollback.');

  if (!precheck()) process.exit(1);

  scanAndBackupJestConfigs();
  rewriteRootScripts();
  rewireNxProjectTests();
  suggestJestRemoval();

  console.log('\n✨ Done. Verify with:');
  console.log('   pnpm -w test:api && pnpm -w test:web && pnpm -w build');
}
main();
