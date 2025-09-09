#!/usr/bin/env node
/**
 * fix-phase3-all.cjs
 * Idempotently scaffolds Phase-3 modules across API + Web + shared types,
 * and registers each router in the API root router.
 *
 * Safe to re-run.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const MODULES = [
  'auth','onboarding','dashboard','tracker','resume','settings','profile','goals',
  'planner','calendar','roadmap','interviews','activity','notifications','summary',
  'skills','insights','metrics','achievements','networking',
];

const P = {
  apiSrc: path.join(ROOT, 'apps', 'api', 'src'),
  apiRouterDir: path.join(ROOT, 'apps', 'api', 'src', 'router'),
  apiTrpcDir: path.join(ROOT, 'apps', 'api', 'src', 'trpc'),
  webSpecsDir: path.join(ROOT, 'web', 'specs'),
  webAppDir: path.join(ROOT, 'web', 'src', 'app'),
  sharedTypesDir: path.join(ROOT, 'shared', 'types'),
  sharedTypesSrcDir: path.join(ROOT, 'shared', 'types', 'src'),
};

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function writeIfDiff(p, s) {
  const cur = read(p);
  if (cur !== s) {
    mkdirp(path.dirname(p));
    fs.writeFileSync(p, s, 'utf8');
    return true;
  }
  return false;
}
function ensureLineInFile(p, needle, insert) {
  const cur = read(p) ?? '';
  if (!cur.includes(needle)) {
    const next = cur + (cur.endsWith('\n') ? '' : '\n') + insert + '\n';
    mkdirp(path.dirname(p));
    fs.writeFileSync(p, next, 'utf8');
    return true;
  }
  return false;
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

// 0) prisma client singleton (apps/api/src/server/db.ts)
(function ensurePrismaSingleton(){
  const dbPath = path.join(P.apiSrc, 'server', 'db.ts');
  if (!exists(dbPath)) {
    writeIfDiff(dbPath, `import { PrismaClient } from '@prisma/client';
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['query','error','warn'] : ['error'] });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
`);
    console.log('✓ prisma singleton: apps/api/src/server/db.ts');
  } else {
    console.log('= prisma singleton present');
  }
})();

// 1) Create router stubs for each module
function ensureModuleRouter(mod) {
  const file = path.join(P.apiRouterDir, `${mod}.ts`);
  if (exists(file)) { console.log(`= router present: ${mod}`); return; }
  const body = `// apps/api/src/router/${mod}.ts
// Minimal placeholder router for "${mod}" (replace with real tRPC wiring later).
export const ${mod}Router = {} as any;
`;
  writeIfDiff(file, body);
  console.log(`✓ router created: ${mod}`);
}

// 2) Register routers in a root router file
function ensureRootRegistration(mods) {
  const candidates = [
    path.join(P.apiRouterDir, 'root.ts'),
    path.join(P.apiTrpcDir, 'root.ts'),
    path.join(P.apiTrpcDir, 'app.router.ts'),
    path.join(P.apiRouterDir, 'app.router.ts'),
  ];
  let target = candidates.find(exists);

  if (!target) {
    // create a minimal root that exports an object with all routers
    const imports = mods.map(m => `import { ${m}Router } from './${m}';`).join('\n');
    const props = mods.map(m => `  ${m}: ${m}Router,`).join('\n');
    const body = `// Minimal app router (placeholder) – switch to real tRPC when ready
${imports}
export const appRouter = {
${props}
} as any;
export type AppRouter = typeof appRouter;
`;
    target = path.join(P.apiRouterDir, 'root.ts');
    writeIfDiff(target, body);
    console.log('✓ created minimal app router at apps/api/src/router/root.ts');
    return;
  }

  // augment existing root: add imports + properties if missing
  let src = read(target) || '';
  let changed = false;

  for (const m of mods) {
    const importRel = target.includes(path.join('src','router')) ? `./${m}` : `../router/${m}`;
    if (!new RegExp(`\\b${m}Router\\b`).test(src)) {
      src = `import { ${m}Router } from '${importRel}';\n` + src;
      changed = true;
    }
  }

  // Ensure each "m: mRouter" property exists in router object or router({ ... })
  for (const m of mods) {
    if (!new RegExp(`${m}\\s*:\\s*${m}Router`).test(src)) {
      // try router({ ... })
      const replaced = src.replace(/router\(\{\s*/m, match => {
        if (match) return match + `${m}: ${m}Router,\n`;
        return match;
      });
      if (replaced !== src) { src = replaced; changed = true; continue; }

      // try plain object export
      const replaced2 = src.replace(/(\{\s*)([^]*?)(\}\s*[;]?\s*$)/m, (all, a,b,c) => {
        if (/\bappRouter\b/.test(src) && !new RegExp(`${m}\\s*:`).test(b))
          return a + `${m}: ${m}Router,\n` + b + c;
        return all;
      });
      if (replaced2 !== src) { src = replaced2; changed = true; }
    }
  }

  if (changed) {
    fs.writeFileSync(target, src, 'utf8');
    console.log(`✓ updated root router: ${path.relative(ROOT, target)}`);
  } else {
    console.log(`= root router OK: ${path.relative(ROOT, target)}`);
  }
}

// 3) Router unit tests (apps/api/src/router/__tests__/<mod>.spec.ts)
function ensureRouterUnitTest(mod) {
  const dir = path.join(P.apiRouterDir, '__tests__');
  mkdirp(dir);
  const p = path.join(dir, `${mod}.spec.ts`);
  if (exists(p)) { console.log(`= router spec present: ${mod}`); return; }
  writeIfDiff(p, `describe('${mod} router', () => {
  it('exports ${mod}Router', async () => {
    const modFile = await import('../${mod}');
    expect(modFile.${mod}Router).toBeDefined();
  });
});
`);
  console.log(`✓ router spec created: ${mod}`);
}

// 4) E2E placeholder (web/specs/<mod>.e2e.spec.ts)
function ensureE2E(mod) {
  const p = path.join(P.webSpecsDir, `${mod}.e2e.spec.ts`);
  if (exists(p)) { console.log(`= e2e placeholder present: ${mod}`); return; }
  writeIfDiff(p, `// e2e placeholder for "${mod}" – move to web-e2e/ when real Playwright is wired
describe('${mod} page (e2e placeholder)', () => {
  it('placeholder', () => expect(true).toBe(true));
});
`);
  console.log(`✓ e2e placeholder created: ${mod}`);
}

// 5) Web page stub (web/src/app/<mod>/page.tsx)
function ensureWebPage(mod) {
  const dir = path.join(P.webAppDir, mod);
  const p = path.join(dir, 'page.tsx');
  if (exists(p)) { console.log(`= page present: ${mod}`); return; }
  const title = cap(mod);
  writeIfDiff(p, `export default function ${cap(mod)}Page() {
  return (
    <main>
      <h1>${title}</h1>
    </main>
  );
}
`);
  console.log(`✓ page created: ${mod}`);
}

// 6) shared/types/<mod>.ts + export from index
function ensureSharedTypes(mod) {
  const baseDir = exists(P.sharedTypesSrcDir) ? P.sharedTypesSrcDir : P.sharedTypesDir;
  const file = path.join(baseDir, `${mod}.ts`);
  if (!exists(file)) {
    writeIfDiff(file, `// ${path.relative(ROOT, file)}
export type ${cap(mod)}DTO = {
  id?: string;
};
`);
    console.log(`✓ types created: ${path.relative(ROOT, file)}`);
  } else {
    console.log(`= types present: ${path.relative(ROOT, file)}`);
  }

  const indexCandidates = [
    path.join(P.sharedTypesSrcDir, 'index.ts'),
    path.join(P.sharedTypesDir, 'index.ts'),
  ];
  const indexPath = indexCandidates.find(exists) || indexCandidates[0];
  ensureLineInFile(indexPath, `export * from './${mod}'`, `export * from './${mod}'`);
  console.log(`✓ ensured export in ${path.relative(ROOT, indexPath)}`);
}

// ---- run all ---------------------------------------------------------------
(function main(){
  console.log('--- fix-phase3-all: start ---');

  // Ensure dirs
  mkdirp(P.apiRouterDir);
  mkdirp(P.webSpecsDir);
  mkdirp(P.webAppDir);
  mkdirp(P.sharedTypesDir);

  // Create routers + tests + pages + types
  MODULES.forEach(m => {
    ensureModuleRouter(m);
    ensureRouterUnitTest(m);
    ensureE2E(m);
    ensureWebPage(m);
    ensureSharedTypes(m);
  });

  // Register all routers in root
  ensureRootRegistration(MODULES);

  console.log('--- fix-phase3-all: done ---');
})();
