#!/usr/bin/env node
/* Stabilize Vitest for web: force pool + bump Node heap.
   Usage:
     node tools/scripts/stabilize-web-tests.cjs
     node tools/scripts/stabilize-web-tests.cjs --run-tests
     node tools/scripts/stabilize-web-tests.cjs --heapMB=4096 --run-tests
     node tools/scripts/stabilize-web-tests.cjs --pool=forks --run-tests
*/
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const webDir = path.join(root, 'web');
const vitestConfigPath = path.join(webDir, 'vitest.config.ts');
const pkgPath = path.join(root, 'package.json');

const args = process.argv.slice(2);
const RUN_TESTS = args.includes('--run-tests');
const HEAP_MB = (() => {
  const a = args.find(a => a.startsWith('--heapMB='));
  return a ? Number(a.split('=')[1]) : 6144;
})();
const POOL = (() => {
  const a = args.find(a => a.startsWith('--pool='));
  return a ? a.split('=')[1] : 'threads'; // default
})();

const log = (msg) => console.log(`▶ ${msg}`);

async function readJson(p) { return JSON.parse(await fsp.readFile(p, 'utf8')); }
async function writeJson(p, obj) { await fsp.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8'); }
function ensureLineEnd(s) { return s.endsWith('\n') ? s : s + '\n'; }

async function ensureCrossEnvInstalled(pkg) {
  const has = (pkg.devDependencies && pkg.devDependencies['cross-env']) ||
              (pkg.dependencies && pkg.dependencies['cross-env']);
  if (!has) {
    log('installing cross-env…');
    cp.execSync('pnpm -w add -D cross-env', { stdio: 'inherit', cwd: root });
  } else {
    log('cross-env already present');
  }
}

async function updatePackageJson() {
  const pkg = await readJson(pkgPath);
  if (!pkg.scripts) pkg.scripts = {};

  const baseCmd = 'vitest run --config web/vitest.config.ts';
  const cliPool = POOL === 'forks' ? ' --pool forks' : '';
  const desired = `cross-env NODE_OPTIONS=--max-old-space-size=${HEAP_MB} ${baseCmd}${cliPool}`;

  const prev = pkg.scripts['test:web'];
  if (!prev) {
    pkg.scripts['test:web'] = desired;
    log('added scripts.test:web');
  } else if (prev !== desired) {
    pkg.scripts['test:web'] = desired;
    log(`updated scripts.test:web (${POOL}, heap=${HEAP_MB}MB)`);
  } else {
    log('scripts.test:web already set');
  }

  await ensureCrossEnvInstalled(pkg);
  await writeJson(pkgPath, pkg);
}

async function updateVitestConfig() {
  let src = await fsp.readFile(vitestConfigPath, 'utf8');
  let updated = src;

  const testBlockRe = /test:\s*\{[\s\S]*?\}/m;
  const poolSnippet =
`test: {
    pool: '${POOL}',
    poolOptions: {
      threads: { maxThreads: 1, minThreads: 1 },
      forks: { singleFork: true },
    },
    sequence: { concurrent: false },
  }`;

  if (testBlockRe.test(updated)) {
    updated = updated.replace(testBlockRe, (block) => {
      let b = block
        .replace(/pool\s*:\s*['"`][^'"`]+['"`]\s*,?/g, '')
        .replace(/poolOptions\s*:\s*\{[\s\S]*?\}\s*,?/m, '')
        .replace(/sequence\s*:\s*\{[\s\S]*?\}\s*,?/m, '');
      b = b.replace(/test:\s*\{/, (m) => `${m}
    pool: '${POOL}',
    poolOptions: {
      threads: { maxThreads: 1, minThreads: 1 },
      forks: { singleFork: true },
    },
    sequence: { concurrent: false },`);
      return b;
    });
    log(`updated pool=${POOL} in web/vitest.config.ts`);
  } else {
    const defCfgRe = /export\s+default\s+defineConfig\(\s*\{/m;
    if (defCfgRe.test(updated)) {
      updated = updated.replace(defCfgRe, (m) => `${m}
  ${poolSnippet},`);
      log(`added test block (pool=${POOL}) to web/vitest.config.ts`);
    } else {
      updated =
`import { defineConfig } from 'vitest/config';
${ensureLineEnd(src)}
export default defineConfig({
  ${poolSnippet},
});
`;
      log(`wrapped config and added test block (pool=${POOL})`);
    }
  }

  if (updated !== src) await fsp.writeFile(vitestConfigPath, ensureLineEnd(updated), 'utf8');
}

async function main() {
  console.log('▶ Stabilizing Vitest for web…');
  await updatePackageJson();
  await updateVitestConfig();
  console.log('▶ ✅ Done. You can now run: pnpm -w test:web');
  if (RUN_TESTS) {
    console.log('▶ Running tests…');
    cp.execSync('pnpm -w test:web', { stdio: 'inherit', cwd: root });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
