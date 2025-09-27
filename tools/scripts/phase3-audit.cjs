#!/usr/bin/env node
/**
 * Phase 3 Reset Audit — read-only by default (use --fix to auto-repair safe items)
 *
 * What it checks:
 *  1) Prisma schema presence + basic models (Tracker/Activity if present)
 *  2) apps/api Prisma scripts (format/validate/migrate/generate)
 *  3) Prisma singleton correctness (accepts libs/shared/... or shared/...)
 *  4) tsconfig.base.json path aliases (accepts @careeros/* and @careeros/shared/* styles)
 *  5) Local API tRPC runtime files (apps/api/src/trpc/{context,trpc,root}.ts)
 *  6) Routers import ../trpc (not @careeros/shared/trpc or @careeros/trpc)
 *  7) Jest config sanity (skipped if Vitest config present for API)
 *  8) Web /tracker page present (optional)
 *  9) (optional with --run) Run prisma format/validate, tsc -b, nx run api:test
 *
 * Usage:
 *   node tools/scripts/phase3-audit.cjs           # read-only audit
 *   node tools/scripts/phase3-audit.cjs --fix     # auto-patch safe items
 *   node tools/scripts/phase3-audit.cjs --run     # run prisma format/validate, tsc -b, api:test
 *   node tools/scripts/phase3-audit.cjs --fix --run
 */

const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const FIX  = process.argv.includes('--fix');
const RUN  = process.argv.includes('--run');
const HELP = process.argv.includes('-h') || process.argv.includes('--help');
const ROOT = process.cwd();

if (HELP) {
  console.log(`
Phase 3 Reset Audit

Usage:
  node tools/scripts/phase3-audit.cjs           # read-only audit
  node tools/scripts/phase3-audit.cjs --fix     # auto-patch safe items
  node tools/scripts/phase3-audit.cjs --run     # run prisma format/validate, tsc -b, api:test
  node tools/scripts/phase3-audit.cjs --fix --run
`);
  process.exit(0);
}

const rel = (p) => path.relative(ROOT, p);

function ok(s)   { console.log('✔️  ' + s); }
function warn(s) { console.log('⚠️  ' + s); }
function bad(s)  { console.log('❌ ' + s); }

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function exists(p)   { return fs.existsSync(p); }

const SKIP_JEST = exists(path.join(ROOT, 'apps', 'api', 'vitest.config.ts'));

const paths = {
  prismaSchema: path.join(ROOT, 'prisma', 'schema.prisma'),
  apiPkg: path.join(ROOT, 'apps', 'api', 'package.json'),
  tsbase: path.join(ROOT, 'tsconfig.base.json'),

  // Accept both locations for the prisma singleton
  prismaTsLibs:   path.join(ROOT, 'libs', 'shared', 'prisma', 'src', 'prisma.ts'),
  prismaIndexLibs:path.join(ROOT, 'libs', 'shared', 'prisma', 'src', 'index.ts'),
  prismaTsShared: path.join(ROOT, 'shared', 'prisma', 'src', 'prisma.ts'),
  prismaIndexShared: path.join(ROOT, 'shared', 'prisma', 'src', 'index.ts'),

  trpcDir:      path.join(ROOT, 'apps', 'api', 'src', 'trpc'),
  trpcContext:  path.join(ROOT, 'apps', 'api', 'src', 'trpc', 'context.ts'),
  trpcTrpc:     path.join(ROOT, 'apps', 'api', 'src', 'trpc', 'trpc.ts'),
  trpcRoot:     path.join(ROOT, 'apps', 'api', 'src', 'trpc', 'root.ts'),
  routersDir1:  path.join(ROOT, 'apps', 'api', 'src', 'trpc', 'routers'),
  routersDir2:  path.join(ROOT, 'apps', 'api', 'src', 'router'), // some repos use this

  jestBridge:   path.join(ROOT, 'tools', 'jest-trpc-bridge.cjs'),
  apiJest:      path.join(ROOT, 'apps', 'api', 'jest.config.ts'),

  webTrackerPage: path.join(ROOT, 'web', 'src', 'app', 'tracker', 'page.tsx'),
};

const summary = [];
function add(key, status, msg) {
  summary.push({ key, status, msg });
  console.log(`   • [${status}] ${key}: ${msg}`);
}

/* =======================================================================================
 * 1) Prisma schema presence + basic models
 * =======================================================================================
 */
console.log('\n== Prisma schema check ==');
if (exists(paths.prismaSchema)) {
  ok(`Found ${rel(paths.prismaSchema)}`);
  const s = fs.readFileSync(paths.prismaSchema, 'utf8');
  const hasTracker =
    /model\s+Tracker(Item)?\b/.test(s) ||
    /model\s+Application\b/.test(s);
  const hasActivity = /model\s+ApplicationActivity\b/.test(s); // optional — warn only

  add(
    'schema:tracker',
    hasTracker ? 'ok' : 'warn',
    hasTracker ? 'Tracker-like model present' : 'Tracker model not detected (ok if not yet added)'
  );
  add(
    'schema:activity',
    hasActivity ? 'ok' : 'warn',
    hasActivity ? 'ApplicationActivity present' : 'ApplicationActivity not detected (only warn)'
  );
} else {
  bad('Missing prisma/schema.prisma');
  add('schema', 'fail', 'prisma/schema.prisma missing');
}

/* =======================================================================================
 * 2) apps/api Prisma scripts
 * =======================================================================================
 */
console.log('\n== apps/api prisma scripts ==');
if (exists(paths.apiPkg)) {
  const pkg = readJSON(paths.apiPkg);
  pkg.scripts ||= {};
  const sc = pkg.scripts;

  const want = {
    'prisma': 'prisma',
    'prisma:migrate': 'prisma migrate dev --schema ../../prisma/schema.prisma',
    'prisma:generate': 'prisma generate --schema ../../prisma/schema.prisma',
    'prisma:format': 'prisma format --schema ../../prisma/schema.prisma',
    'prisma:validate': 'prisma validate --schema ../../prisma/schema.prisma',
  };

  const missing = Object.entries(want).filter(([k, v]) => sc[k] !== v);
  if (missing.length === 0) {
    ok('apps/api prisma scripts present');
    add('api:prisma-scripts', 'ok', 'present');
  } else {
    warn('apps/api prisma scripts incomplete');
    add('api:prisma-scripts', 'warn', 'incomplete');
    if ( FIX ) {
      pkg.scripts = { ...sc, ...want };
      fs.writeFileSync(paths.apiPkg, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      ok('patched apps/api/package.json scripts');
    }
  }
} else {
  bad('apps/api/package.json missing');
  add('api:pkg', 'fail', 'missing');
}

/* =======================================================================================
 * 3) Prisma singleton correctness (accept both locations)
 * =======================================================================================
 */
console.log('\n== Prisma singleton (shared/prisma or libs/shared/prisma) ==');

function checkPrismaFile(pth) {
  if (!exists(pth)) return { present:false, good:false };
  const s = fs.readFileSync(pth, 'utf8');
  const hasSingleton = /new PrismaClient\(/.test(s) && /globalForPrisma/.test(s);
  const noFakeUser  = !/Prisma\.User\b/.test(s); // guard against past typo
  return { present:true, good:(hasSingleton && noFakeUser) };
}

const libCheck    = checkPrismaFile(paths.prismaTsLibs);
const sharedCheck = checkPrismaFile(paths.prismaTsShared);

if (libCheck.present || sharedCheck.present) {
  const where = (libCheck.present ? rel(paths.prismaTsLibs) : rel(paths.prismaTsShared));
  const isGood = (libCheck.present && libCheck.good) || (sharedCheck.present && sharedCheck.good);
  add('prisma.ts', isGood ? 'ok' : 'warn', isGood ? `singleton OK (${where})` : `rewrite recommended (${where})`);
  if (!isGood && FIX) {
    const tpl = `import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { Prisma };
`;
    const target = libCheck.present ? paths.prismaTsLibs : (sharedCheck.present ? paths.prismaTsShared : paths.prismaTsLibs);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, tpl, 'utf8');
    const idx = target.endsWith('libs/shared/prisma/src/prisma.ts') ? paths.prismaIndexLibs : paths.prismaIndexShared;
    fs.mkdirSync(path.dirname(idx), { recursive: true });
    if (!exists(idx)) fs.writeFileSync(idx, "export * from './prisma';\n", 'utf8');
    ok(`patched ${rel(target)}`);
  }
} else {
  warn('no prisma singleton found (shared/ or libs/shared/)');
  add('prisma.ts', 'warn', 'missing (will still pass if not used)');
  if (FIX) {
    const target = paths.prismaTsLibs;
    const tpl = `import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { Prisma };
`;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, tpl, 'utf8');
    fs.mkdirSync(path.dirname(paths.prismaIndexLibs), { recursive: true });
    fs.writeFileSync(paths.prismaIndexLibs, "export * from './prisma';\n", 'utf8');
    ok(`created ${rel(target)} + index.ts`);
  }
}

/* =======================================================================================
 * 4) tsconfig.base.json aliases (accept both styles; ensure both if --fix)
 * =======================================================================================
 */
console.log('\n== tsconfig.base.json aliases ==');
if (exists(paths.tsbase)) {
  const base = readJSON(paths.tsbase);
  base.compilerOptions ||= {};
  base.compilerOptions.paths ||= {};
  const p = base.compilerOptions.paths;

  // detect existing roots
  const hasSharedRoot = exists(paths.prismaIndexShared);
  const hasLibsRoot   = exists(paths.prismaIndexLibs);

  // choose a preferred mapping root
  const preferredPrismaIndex = hasSharedRoot ? 'shared/prisma/src/index.ts'
                           : (hasLibsRoot   ? 'libs/shared/prisma/src/index.ts'
                                            : 'shared/prisma/src/index.ts');
  const preferredTrpcIndex   = exists(path.join(ROOT,'shared','trpc','src','index.ts'))
                           ? 'shared/trpc/src/index.ts'
                           : 'libs/shared/trpc/src/index.ts';

  const wantAny = [
    ['@careeros/prisma', [preferredPrismaIndex]],
    ['@careeros/trpc',   [preferredTrpcIndex]],
    ['@careeros/types',  ['libs/types/src/index.ts']],
    ['@careeros/api',    ['apps/api/src/trpc/root.ts']],
    ['@careeros/routers/*', ['apps/api/src/router/*']],
  ];
  const wantCompat = [
    ['@careeros/shared/prisma', [preferredPrismaIndex]],
    ['@careeros/shared/trpc',   [preferredTrpcIndex]],
    ['@careeros/shared/trpc/*', [preferredTrpcIndex.replace('/index.ts','/*')]],
  ];

  function diff(list) {
    return list.filter(([k, v]) => JSON.stringify(p[k] || []) !== JSON.stringify(v));
  }
  const missingAny   = diff(wantAny);
  const missingCompat= diff(wantCompat);

  if (missingAny.length === 0 && missingCompat.length === 0) {
    ok('aliases present');
    add('aliases', 'ok', 'paths OK');
  } else {
    warn('aliases incomplete');
    add('aliases', 'warn', 'incomplete');
    if (FIX) {
      for (const [k,v] of [...wantAny, ...wantCompat]) p[k] = v;
      fs.writeFileSync(paths.tsbase, JSON.stringify(base, null, 2) + '\n', 'utf8');
      ok('patched tsconfig.base.json paths');
    }
  }
} else {
  bad('tsconfig.base.json missing');
  add('tsconfig', 'fail', 'missing');
}

/* =======================================================================================
 * 5) Local API tRPC runtime files
 * =======================================================================================
 */
console.log('\n== API local tRPC runtime files ==');
const needTrpc = [paths.trpcContext, paths.trpcTrpc, paths.trpcRoot];
const missingTrpc = needTrpc.filter((p) => !exists(p));
if (missingTrpc.length === 0) {
  ok('context.ts, trpc.ts, root.ts present');
  add('api:trpc-local', 'ok', 'present');
} else {
  warn('missing local tRPC runtime files: ' + missingTrpc.map(rel).join(', '));
  add('api:trpc-local', 'warn', 'missing pieces');
}

/* =======================================================================================
 * 6) Routers import ../trpc (not @careeros/shared/trpc or @careeros/trpc)
 * =======================================================================================
 */
console.log('\n== Router imports sanity ==');
let misImports = 0;
function scanRouterDir(dir) {
  if (!exists(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const pth = path.join(dir, e.name);
    if (e.isDirectory()) { scanRouterDir(pth); continue; }
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    const s = fs.readFileSync(pth, 'utf8');
    if (/from\s+['"]@careeros\/(?:shared\/)?trpc['"]/.test(s)) {
      misImports++;
      console.log('   ↪ needs rewrite: ' + rel(pth));
    }
  }
}
scanRouterDir(paths.routersDir1);
scanRouterDir(paths.routersDir2);
add('routers:imports', misImports === 0 ? 'ok' : 'warn', misImports === 0 ? 'all good' : `${misImports} file(s) import from shared alias`);

/* =======================================================================================
 * 7) Jest config sanity (skipped if Vitest config present)
 * =======================================================================================
 */
if (!SKIP_JEST) {
  console.log('\n== Jest config sanity ==');
  const hasBridge = exists(paths.jestBridge);
  add('jest:bridge', hasBridge ? 'ok' : 'warn', hasBridge ? 'bridge present' : 'bridge missing (allowlist is also fine)');

  if (exists(paths.apiJest)) {
    const s = fs.readFileSync(paths.apiJest, 'utf8');

    // .mjs in extensionsToTreatAsEsm → Jest warns/fails in recent versions
    const badMjs = /extensionsToTreatAsEsm\s*:\s*\[[^\]]*['"]\.mjs['"]/.test(s);

    // Either: moduleNameMapper mapping @trpc/server to a local bridge, OR allowlist @trpc|tslib
    const hasMapper   = /moduleNameMapper\s*:\s*{[^}]*['"]\^@trpc\/server\$['"]\s*:\s*['"][^'"]*jest-trpc-bridge\.cjs['"]/.test(s);
    const allowlistRe = /transformIgnorePatterns\s*:\s*\[\s*['"]node_modules\/\(\?\!\(\?:@trpc\|tslib\)\)\//;
    const hasAllow    = allowlistRe.test(s);

    add('jest:.mjs', badMjs ? 'fail' : 'ok', badMjs ? '.mjs listed in extensionsToTreatAsEsm — remove it' : 'no .mjs ESM trap');
    add('jest:trpc', (hasMapper || hasAllow) ? 'ok' : 'warn',
        (hasMapper || hasAllow) ? 'mapper/allowlist present' : 'consider adding mapper or allowlist for @trpc|tslib');
  } else {
    warn('apps/api/jest.config.ts missing');
    add('jest:api-config', 'warn', 'missing');
  }
}

/* =======================================================================================
 * 8) Web /tracker page present?
 * =======================================================================================
 */
console.log('\n== Web /tracker page ==');
if (exists(paths.webTrackerPage)) {
  ok(rel(paths.webTrackerPage));
  add('web:tracker', 'ok', 'present');
} else {
  warn('web /tracker/page.tsx missing (ok if deferred)');
  add('web:tracker', 'warn', 'missing');
}

/* =======================================================================================
 * 9) Optional: run sanity commands
 * =======================================================================================
 */
if (RUN) {
  console.log('\n== Running sanity commands ==');
  const run = (cmd) => {
    console.log(' $ ' + cmd);
    try { cp.execSync(cmd, { stdio: 'inherit' }); }
    catch (e) { /* keep going; we only report */ }
  };
  run('pnpm -F ./apps/api run prisma:format');
  run('pnpm -F ./apps/api run prisma:validate');
  run('pnpm -w tsc -b');
  run('nx run api:test --verbose');
}

/* =======================================================================================
 * Summary + exit code
 * =======================================================================================
 */
console.log('\n=== Summary ===');
for (const r of summary) console.log(` - ${r.key}: ${r.status} — ${r.msg}`);

const hasFail = summary.some((r) => r.status === 'fail');
if (!FIX) {
  console.log('\n(re-run with --fix to auto-patch prisma scripts/aliases/prisma.ts; with --run to execute basic checks)');
}
process.exit(hasFail ? 1 : 0);
