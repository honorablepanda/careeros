#!/usr/bin/env node
// Minimal, idempotent bootstrap: writes 5 files with real code.
// - tools/scripts/patch-root-package-scripts.cjs
// - tools/scripts/guard-jest-config.cjs
// - tools/scripts/orchestrate-tracker-setup.cjs
// - .github/workflows/ci.yml
// - playwright.config.ts
const fs=require('fs'),path=require('path'),cp=require('child_process');
const DRY=new Set(process.argv.slice(2)).has('--dry');
const ROOT=(()=>{try{return cp.execSync('git rev-parse --show-toplevel',{stdio:['ignore','pipe','ignore']}).toString().trim()}catch{return process.cwd()}})();
const W=(p,c)=>{const a=path.join(ROOT,p);if(fs.existsSync(a)){const cur=fs.readFileSync(a,'utf8');if(cur===c){console.log('= up-to-date',p);return}const bak=a+'.backup.'+new Date().toISOString().replace(/[:.]/g,'-');if(!DRY)fs.writeFileSync(bak,cur,'utf8');console.log('~ backup  ',p+'.backup.*')}if(!DRY)fs.writeFileSync(a,c,'utf8');console.log('+ wrote   ',p)}
const M=(p)=>{if(!DRY)fs.mkdirSync(path.join(ROOT,p),{recursive:true});console.log('[mkdir]',p)}
/* -------------------------- File contents (exact) -------------------------- */
const PATCH=`#!/usr/bin/env node
const fs=require('fs'),path=require('path'),cp=require('child_process');
function root(){try{return cp.execSync('git rev-parse --show-toplevel',{stdio:['ignore','pipe','ignore']}).toString().trim()}catch{return process.cwd()}}
const pkgPath=path.join(root(),'package.json');if(!fs.existsSync(pkgPath)){console.error('package.json not found');process.exit(1)}
const j=JSON.parse(fs.readFileSync(pkgPath,'utf8'));j.scripts=j.scripts||{};
j.scripts.prepare=j.scripts.prepare||'husky';
j.scripts["test:api"]=j.scripts["test:api"]||'pnpm -w jest --clearCache --config apps/api/jest.config.ts && pnpm -w exec nx run api:test --verbose';
j.scripts["test:api:guarded"]=j.scripts["test:api:guarded"]||'node tools/scripts/guard-jest-config.cjs && pnpm run test:api';
j.scripts["test:e2e"]=j.scripts["test:e2e"]||'playwright test';
fs.writeFileSync(pkgPath,JSON.stringify(j,null,2)+'\\n');console.log('✓ patched root scripts');
`;
const GUARD=`#!/usr/bin/env node
const fs=require('fs'),path=require('path');const p=path.join(process.cwd(),'apps','api','jest.config.ts');
if(!fs.existsSync(p)){console.log('[guard-jest-config] apps/api/jest.config.ts not found — skipping.');process.exit(0)}
let s=fs.readFileSync(p,'utf8');
function ins(head,code){if(!head.test(s))s=s.replace(/(module\\.exports\\s*=\\s*\\{)/,m=>m+"\\n"+code)}
if(!/pathsToModuleNameMapper/.test(s)){s="const { pathsToModuleNameMapper } = require('ts-jest');\\nconst { compilerOptions } = require('../../tsconfig.base.json');\\n"+s}
ins(/moduleNameMapper\\s*:/,"  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths||{}, { prefix: '<rootDir>/../../' }),");
if(!/transformIgnorePatterns/.test(s)){s=s.replace(/(module\\.exports\\s*=\\s*\\{)/,m=>m+"\\n  transformIgnorePatterns: ['node_modules/(?!(?:@trpc|tslib)/)'],")}
else{s=s.replace(/transformIgnorePatterns\\s*:\\s*\\[[^\\]]*\\]/,"transformIgnorePatterns: ['node_modules/(?!(?:@trpc|tslib)/)']")}
fs.writeFileSync(p,s,'utf8');console.log('[guard-jest-config] OK');
`;
const ORCH=`#!/usr/bin/env node
const fs=require('fs'),path=require('path'),cp=require('child_process');const A=new Set(process.argv.slice(2)),DRY=A.has('--dry'),SKIP=A.has('--no-test');
const run=(cmd)=>{console.log('[exec]',cmd);if(!DRY)cp.execSync(cmd,{stdio:'inherit'})}
const repo=process.cwd(),schema=path.join(repo,'prisma','schema.prisma'),apiPkg=path.join(repo,'apps','api','package.json'),rootTs=path.join(repo,'apps','api','src','trpc','root.ts'),appTs=path.join(repo,'apps','api','src','trpc','routers','_app.ts');
if(!fs.existsSync(schema))throw new Error('Missing prisma/schema.prisma');if(!fs.existsSync(apiPkg))throw new Error('Missing apps/api/package.json');
const j=JSON.parse(fs.readFileSync(apiPkg,'utf8'));j.scripts=j.scripts||{};const want={"prisma":"prisma","prisma:migrate":"prisma migrate dev --schema ../../prisma/schema.prisma","prisma:generate":"prisma generate --schema ../../prisma/schema.prisma","prisma:format":"prisma format --schema ../../prisma/schema.prisma","prisma:validate":"prisma validate --schema ../../prisma/schema.prisma"};let ch=false;for(const[k,v]of Object.entries(want)){if(j.scripts[k]!==v){j.scripts[k]=v;ch=true;console.log('[patch] set',k)}}
if(ch)fs.writeFileSync(apiPkg,JSON.stringify(j,null,2)+'\\n');
const rootPkg=JSON.parse(fs.readFileSync(path.join(repo,'package.json'),'utf8'));
const has=(pkg,n)=> (pkg.dependencies&&pkg.dependencies[n])||(pkg.devDependencies&&pkg.devDependencies[n]);
if(!has(rootPkg,'prisma')) run('pnpm -w add -D prisma'); else console.log('[deps] prisma ok');
if(!has(j,'@prisma/client')) run('pnpm -F ./apps/api add @prisma/client'); else console.log('[deps] @prisma/client ok');
run('pnpm -F ./apps/api run prisma:format');run('pnpm -F ./apps/api run prisma:validate');run('pnpm -F ./apps/api run prisma:migrate -n tracker');run('pnpm -F ./apps/api run prisma:generate');
if(fs.existsSync(appTs)){console.log('[cleanup] remove trpc/routers/_app.ts');if(!DRY)fs.rmSync(appTs,{force:true})}
if(!fs.existsSync(rootTs))throw new Error('Missing apps/api/src/trpc/root.ts');let t=fs.readFileSync(rootTs,'utf8');
const imp=`import { trackerRouter } from './routers/tracker.router';`;if(!/from\\s+['"]\\.\\/routers\\/tracker(\\.router)?['"]/.test(t)){t=t.replace(/(^(?:import[^\\n]*\\n)+)/m,(m)=>m+imp+'\\n');console.log('[wire] import added')}
if(!/tracker:\\s*trackerRouter/.test(t)){t=t.replace(/export\\s+const\\s+appRouter\\s*=\\s*router\\s*\\(\\s*\\{\\s*/m,(m)=>m+'  tracker: trackerRouter,\\n');console.log('[wire] appRouter entry added')}
if(!DRY)fs.writeFileSync(rootTs,t,'utf8');if(!SKIP){run('pnpm -w tsc -b');run('npx nx run api:test')}else console.log('[skip] tests');
`;
const CI=`name: ci
on:
  push: { branches: [ "**" ] }
  pull_request: { branches: [ "**" ] }
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - name: Install dependencies
        run: pnpm -w install --frozen-lockfile
      - name: Type check
        run: pnpm -w tsc -b
      - name: Unit tests (API)
        run: pnpm run test:api:guarded
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      - name: E2E tests
        run: pnpm run test:e2e
        env: { NODE_ENV: test }
`;
const PW=`import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure', baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
`;
/* ---------------------------------- Write --------------------------------- */
M('tools/scripts'); M('.github/workflows');
W('tools/scripts/patch-root-package-scripts.cjs',PATCH);
W('tools/scripts/guard-jest-config.cjs',GUARD);
W('tools/scripts/orchestrate-tracker-setup.cjs',ORCH);
W('.github/workflows/ci.yml',CI);
W('playwright.config.ts',PW);
