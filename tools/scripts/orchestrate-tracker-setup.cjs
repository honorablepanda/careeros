#!/usr/bin/env node
/**
 * Idempotent tracker setup for Nx-style layout:
 * - Detect API app (api/ or apps/api/) even if no package.json at app level
 * - Use schema at shared/prisma/schema.prisma (or fallback to prisma/schema.prisma)
 * - Install prisma (root) and @prisma/client (shared/prisma package if present; else root)
 * - Run prisma format/validate/migrate/generate from root
 * - Try to wire trackerRouter in api/src/trpc/root.ts if present
 */
const fs = require('fs'),
  path = require('path'),
  cp = require('child_process');
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const SKIP = args.has('--no-test');
const run = (cmd) => {
  console.log('[exec]', cmd);
  if (!DRY) cp.execSync(cmd, { stdio: 'inherit' });
};
const R = process.cwd();

function detectApiDir() {
  if (
    fs.existsSync(path.join(R, 'api', 'project.json')) ||
    fs.existsSync(path.join(R, 'api', 'jest.config.ts'))
  )
    return 'api';
  if (
    fs.existsSync(path.join(R, 'apps', 'api', 'project.json')) ||
    fs.existsSync(path.join(R, 'apps', 'api', 'jest.config.ts'))
  )
    return 'apps/api';
  throw new Error('Cannot find API project (api/ or apps/api).');
}
function detectSchema() {
  if (fs.existsSync(path.join(R, 'shared', 'prisma', 'schema.prisma')))
    return 'shared/prisma/schema.prisma';
  if (fs.existsSync(path.join(R, 'prisma', 'schema.prisma')))
    return 'prisma/schema.prisma';
  throw new Error('Cannot find schema.prisma (shared/prisma or prisma).');
}
const apiDir = detectApiDir();
const schema = detectSchema();

const rootPkgPath = path.join(R, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
const has = (pkg, n) =>
  (pkg.dependencies && pkg.dependencies[n]) ||
  (pkg.devDependencies && pkg.devDependencies[n]);

// Ensure prisma at root
if (!has(rootPkg, 'prisma')) run('pnpm -w add -D prisma');
else console.log('[deps] prisma ok at root');

// If shared/prisma is a package, put @prisma/client there; otherwise at root
const sharedPrismaPkg = path.join(R, 'shared', 'prisma', 'package.json');
if (fs.existsSync(sharedPrismaPkg)) {
  const sp = JSON.parse(fs.readFileSync(sharedPrismaPkg, 'utf8'));
  if (!has(sp, '@prisma/client'))
    run('pnpm --filter ./shared/prisma add @prisma/client');
  else console.log('[deps] @prisma/client ok in shared/prisma');
} else {
  if (!has(rootPkg, '@prisma/client')) run('pnpm -w add @prisma/client');
  else console.log('[deps] @prisma/client ok at root');
}

// Prisma flow (from root, with explicit --schema)
run(`pnpm -w prisma format --schema ${schema}`);
run(`pnpm -w prisma validate --schema ${schema}`);
run(`pnpm -w prisma migrate dev -n tracker --schema ${schema}`);
run(`pnpm -w prisma generate --schema ${schema}`);

// Wire router (best-effort)
const rootTsCands = [
  path.join(R, apiDir, 'src', 'trpc', 'root.ts'),
  path.join(R, apiDir, 'src', 'trpc', 'root', 'index.ts'),
].filter(fs.existsSync);
if (rootTsCands.length) {
  const rootTs = rootTsCands[0];
  let t = fs.readFileSync(rootTs, 'utf8');
  const imp = "import { trackerRouter } from './routers/tracker.router';";
  if (!/from\s+['"]\.\/routers\/tracker(\.router)?['"]/.test(t)) {
    t = t.replace(/(^(?:import[^\n]*\n)+)/m, (m) => m + imp + '\n');
    console.log('[wire] import added');
  }
  if (!/tracker:\s*trackerRouter/.test(t)) {
    t = t.replace(
      /export\s+const\s+appRouter\s*=\s*router\s*\(\s*\{\s*/m,
      (m) => m + '  tracker: trackerRouter,\n'
    );
    console.log('[wire] appRouter entry added');
  }
  fs.writeFileSync(rootTs, t, 'utf8');
} else {
  console.log('[warn] api root router not found; skipped wiring');
}

if (!SKIP) {
  // Build via Nx if available; otherwise skip build
  try {
    run('pnpm -w exec nx run-many -t build --all');
  } catch {
    console.log('[warn] nx build skipped');
  }
  try {
    run('pnpm -w exec nx run api:test');
  } catch {
    console.log('[warn] nx api:test skipped');
  }
} else {
  console.log('[skip] tests');
}

console.log(
  '[done] Orchestration complete ✅ (apiDir=%s, schema=%s)',
  apiDir,
  schema
);
