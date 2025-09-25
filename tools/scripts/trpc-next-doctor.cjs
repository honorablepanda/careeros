#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = process.cwd();
const rel = (p) => path.join(ROOT, p);
const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const readJSON = (p) =>
  fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;

const start = new Date();
const outDir = rel('tools/logs');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '_')
  .slice(0, 19);
const logPath = path.join(outDir, `doctor_${stamp}.log`);

const lines = [];
const log = (s = '') => {
  lines.push(s);
};

const section = (title) => {
  log('');
  log('## ' + title);
};
const status = {
  OK: (m) => log('  ✓ ' + m),
  WARN: (m) => log('  ! ' + m),
  FAIL: (m) => log('  ✖ ' + m),
};

let failCount = 0;
let warnCount = 0;

const fail = (m) => {
  failCount++;
  status.FAIL(m);
};
const warn = (m) => {
  warnCount++;
  status.WARN(m);
};
const ok = (m) => status.OK(m);

// ---- helpers
function getInstalledVersion(pkgName) {
  // Try standard node_modules symlink
  let p = rel(path.join('node_modules', pkgName, 'package.json'));
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')).version || null;
    } catch {}
  }
  // Fallback: search pnpm store in node_modules/.pnpm
  const enc = pkgName.replace('/', '+');
  const base = rel('node_modules/.pnpm');
  if (!fs.existsSync(base)) return null;
  const dirs = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(enc + '@'));
  for (const d of dirs) {
    const nested = path.join(
      base,
      d.name,
      'node_modules',
      pkgName,
      'package.json'
    );
    if (fs.existsSync(nested)) {
      try {
        return JSON.parse(fs.readFileSync(nested, 'utf8')).version || null;
      } catch {}
    }
  }
  return null;
}

function firstMatchRe(s, re) {
  const m = s && s.match(re);
  return m ? m[1] || m[0] : null;
}

// ---- HEADER
log(`# Workspace Doctor Report`);
log(
  `Time: ${start.toISOString()} (${
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'local TZ'
  })`
);
log(`OS: ${os.platform()} ${os.release()} | Node: ${process.version}`);
log(`Root: ${ROOT}`);

// ---- Prisma model & router check
section('Prisma schema & tracker router');
const schemaPath = rel('prisma/schema.prisma');
const schema = readIf(schemaPath);
if (!schema) {
  fail(`Missing prisma/schema.prisma`);
} else {
  const modelNames = [
    ...schema.matchAll(/^\s*model\s+([A-Za-z0-9_]+)\s*\{/gm),
  ].map((m) => m[1]);
  if (modelNames.length === 0) {
    warn(`No Prisma models found in prisma/schema.prisma`);
  } else {
    ok(`Found models: ${modelNames.join(', ')}`);
  }
  // Infer the application model + prisma property
  // Prefer 'Application' or anything containing 'Application'
  let model = modelNames.find((n) => n === 'Application');
  if (!model) model = modelNames.find((n) => /Application/i.test(n));
  if (!model) {
    warn(
      `No model named 'Application' found; tracker router should use 'ctx.prisma.<yourModel>'`
    );
  } else {
    const clientProp = model.charAt(0).toLowerCase() + model.slice(1);
    ok(`Application-like model: ${model} → prisma property '${clientProp}'`);
    // Check router file usage
    const trackerPath = rel('apps/api/src/trpc/routers/tracker.router.ts');
    const tracker = readIf(trackerPath);
    if (!tracker) {
      fail(`Missing ${path.relative(ROOT, trackerPath)}`);
    } else {
      const usesFindMany = tracker.includes(
        `ctx.prisma.${clientProp}.findMany`
      );
      const usesCreate = tracker.includes(`ctx.prisma.${clientProp}.create`);
      const usesUpdate = tracker.includes(`ctx.prisma.${clientProp}.update`);
      const usesDelete = tracker.includes(`ctx.prisma.${clientProp}.delete`);
      if (usesFindMany && usesCreate && usesUpdate && usesDelete) {
        ok(
          `tracker.router.ts uses ctx.prisma.${clientProp}.{findMany,create,update,delete}`
        );
      } else {
        warn(
          `tracker.router.ts does not consistently use 'ctx.prisma.${clientProp}.*' (check findMany/create/update/delete)`
        );
      }
      if (!/from\s+['"]\.\.\/trpc['"]/.test(tracker)) {
        warn(
          `tracker.router.ts does not import { router, procedure } from '../trpc'`
        );
      }
      if (!/from\s+['"]zod['"]/.test(tracker)) {
        warn(`tracker.router.ts missing 'zod' import`);
      }
    }
  }
}

// ---- API tRPC runtime (context/trpc/root)
section('API tRPC runtime');
const ctxPath = rel('apps/api/src/trpc/context.ts');
const trpcPath = rel('apps/api/src/trpc/trpc.ts');
const rootPath = rel('apps/api/src/trpc/root.ts');
const ctxSrc = readIf(ctxPath);
const trpcSrc = readIf(trpcPath);
const rootSrc = readIf(rootPath);

if (!ctxSrc) fail(`Missing ${path.relative(ROOT, ctxPath)}`);
else {
  if (!/PrismaClient/.test(ctxSrc)) {
    warn(`context.ts: PrismaClient not imported/used`);
  } else ok(`context.ts present`);
}

if (!trpcSrc) fail(`Missing ${path.relative(ROOT, trpcPath)}`);
else {
  if (!/initTRPC/.test(trpcSrc)) {
    fail(`trpc.ts: does not initialize initTRPC`);
  } else ok(`trpc.ts present with initTRPC`);
}

if (!rootSrc) fail(`Missing ${path.relative(ROOT, rootPath)}`);
else {
  if (!/export\s+const\s+appRouter\s*=/.test(rootSrc)) {
    fail(`root.ts: appRouter export not found`);
  } else ok(`root.ts exports appRouter`);
  if (!/export\s+type\s+AppRouter\s*=\s*typeof\s+appRouter/.test(rootSrc)) {
    fail(`root.ts: 'export type AppRouter = typeof appRouter' not found`);
  } else ok(`root.ts exports AppRouter type`);
  // Router keys + reserved collisions
  const bodyMatch = rootSrc.match(
    /appRouter\s*=\s*router\s*\(\s*\{\s*([\s\S]*?)\}\s*\)/m
  );
  if (bodyMatch) {
    const candidates = bodyMatch[1]
      .split(',')
      .map((s) => s.trim())
      .map((s) => (s.match(/^([A-Za-z0-9_]+)\s*:/) || [null, null])[1])
      .filter(Boolean);
    if (candidates.length) ok(`root router keys: ${candidates.join(', ')}`);
    const reserved = ['useContext', 'useUtils', 'Provider'];
    const hit = candidates.filter((k) => reserved.includes(k));
    if (hit.length) {
      fail(
        `root.ts router keys collide with hooks: ${hit.join(
          ', '
        )} (rename these keys)`
      );
    }
  }
}

// ---- TS aliases (base + web)
section('TypeScript aliases');
const tsbasePath = rel('tsconfig.base.json');
const tsbase = readJSON(tsbasePath);
if (!tsbase) {
  fail(`Missing tsconfig.base.json`);
} else {
  const paths = (tsbase.compilerOptions || {}).paths || {};
  const wantApi = ['apps/api/src/trpc/root.ts'];
  const wantTypes = ['libs/types/src/index.ts'];
  const sameArr = (a = [], b = []) =>
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((x, i) => x === b[i]);
  if (!sameArr(paths['@careeros/api'], wantApi)) {
    fail(
      `tsconfig.base.json: paths["@careeros/api"] != ${JSON.stringify(wantApi)}`
    );
  } else ok(`@careeros/api alias OK`);
  if (!sameArr(paths['@careeros/types'], wantTypes)) {
    fail(
      `tsconfig.base.json: paths["@careeros/types"] != ${JSON.stringify(
        wantTypes
      )}`
    );
  } else ok(`@careeros/types alias OK`);
}

const webTsPath = rel('web/tsconfig.json');
const webTs = readJSON(webTsPath);
if (!webTs) {
  fail(`Missing web/tsconfig.json`);
} else {
  const wpaths = (webTs.compilerOptions || {}).paths || {};
  const wantWeb = ['src/*'];
  const cur = wpaths['@/*'];
  if (!cur || cur.join('|') !== wantWeb.join('|')) {
    fail(`web/tsconfig.json: paths["@/*"] != ${JSON.stringify(wantWeb)}`);
  } else ok(`web alias @/* → src/* OK`);
}

// ---- Web client wiring
section('Web client wiring');
const webClientPath = rel('web/src/trpc.ts');
const webProviderPath = rel('web/src/app/providers.tsx');
const webClient = readIf(webClientPath);
const webProvider = readIf(webProviderPath);

if (!webClient) fail(`Missing ${path.relative(ROOT, webClientPath)}`);
else {
  if (
    !/createTRPCReact/.test(webClient) ||
    !/from\s+['"]@trpc\/react-query['"]/.test(webClient)
  ) {
    fail(
      `web/src/trpc.ts: missing createTRPCReact import from @trpc/react-query`
    );
  } else {
    ok(`web/src/trpc.ts imports createTRPCReact`);
  }
  if (
    !/type\s+\{\s*AppRouter\s*\}\s+from\s+['"]@careeros\/api['"]/.test(
      webClient
    )
  ) {
    fail(
      `web/src/trpc.ts: missing 'type { AppRouter } from "@careeros/api"' import`
    );
  } else ok(`web/src/trpc.ts imports type AppRouter from @careeros/api`);
  if (!/createTRPCReact<\s*AppRouter\s*>\s*\(\)/.test(webClient)) {
    fail(`web/src/trpc.ts: missing 'createTRPCReact<AppRouter>()'`);
  } else ok(`web/src/trpc.ts exports typed client`);
}

if (!webProvider) fail(`Missing ${path.relative(ROOT, webProviderPath)}`);
else {
  if (!/import\s*\{\s*trpc\s*\}\s*from\s*['"]@\/trpc['"]/.test(webProvider)) {
    fail(`providers.tsx: does not import { trpc } from '@/trpc'`);
  } else ok(`providers.tsx imports { trpc } from '@/trpc'`);
  if (!/trpc\.createClient\s*\(/.test(webProvider)) {
    fail(`providers.tsx: missing 'trpc.createClient(...)'`);
  } else ok(`providers.tsx creates trpc client`);
  if (!/httpBatchLink\s*\(\s*\{/.test(webProvider)) {
    warn(`providers.tsx: httpBatchLink not found (ensure link is configured)`);
  } else ok(`providers.tsx uses httpBatchLink`);
}

// ---- Versions
section('Package versions (installed)');
const pkgs = [
  '@trpc/server',
  '@trpc/client',
  '@trpc/react-query',
  '@tanstack/react-query',
  'react',
  'react-dom',
  'next',
];
const versions = {};
for (const name of pkgs) {
  versions[name] = getInstalledVersion(name);
  if (!versions[name]) {
    warn(`Not installed or not resolvable: ${name}`);
  } else {
    ok(`${name}: ${versions[name]}`);
  }
}
function major(v) {
  if (!v) return null;
  const m = v.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
const tServer = major(versions['@trpc/server']);
const tClient = major(versions['@trpc/client']);
const tReact = major(versions['@trpc/react-query']);
const rq = major(versions['@tanstack/react-query']);
const reactMaj = major(versions['react']);
const nextMaj = major(versions['next']);

section('Version consistency rules');
if (tServer && tClient && tReact) {
  if (!(tServer === tClient && tClient === tReact)) {
    fail(
      `@trpc/* majors mismatch (server:${tServer}, client:${tClient}, react-query:${tReact})`
    );
  } else ok(`@trpc/* majors match (${tServer})`);
}
if (tServer === 10 || tClient === 10 || tReact === 10) {
  if (rq && rq !== 4) {
    fail(`tRPC v10 requires @tanstack/react-query v4 (found v${rq})`);
  } else if (rq === 4) ok(`tRPC v10 ↔ react-query v4 OK`);
}
if (tServer === 11 || tClient === 11 || tReact === 11) {
  if (rq && rq !== 5) {
    fail(`tRPC v11 requires @tanstack/react-query v5 (found v${rq})`);
  } else if (rq === 5) ok(`tRPC v11 ↔ react-query v5 OK`);
}
if (reactMaj && rq) {
  // react-query v4 supports React 16-18; v5 supports 18-19
  if (rq === 4 && reactMaj >= 19) {
    warn(
      `react-query v4 + React ${reactMaj}: peer warning (v4 targets React ≤18)`
    );
  }
  if (rq === 5 && reactMaj < 18) {
    fail(`react-query v5 requires React ≥18`);
  }
}
if (nextMaj) ok(`Next major: ${nextMaj}`);

// ---- Summary
section('Summary');
log(`  Failures: ${failCount}`);
log(`  Warnings: ${warnCount}`);
log('');
log(`Log written to: ${logPath}`);
fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');

// Print to stdout
console.log(lines.join('\n'));
process.exit(failCount > 0 ? 1 : 0);
