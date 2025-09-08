#!/usr/bin/env node
const fs=require('fs'),path=require('path'),cp=require('child_process');
const args=new Set(process.argv.slice(2));const DRY=args.has('--dry');const SKIP=args.has('--no-test');
const run=(cmd)=>{console.log('[exec]',cmd);if(!DRY)cp.execSync(cmd,{stdio:'inherit'})}
const repo=process.cwd(),schema=path.join(repo,'prisma','schema.prisma'),apiPkg=path.join(repo,'apps','api','package.json'),rootTs=path.join(repo,'apps','api','src','trpc','root.ts'),appTs=path.join(repo,'apps','api','src','trpc','routers','_app.ts');
if(!fs.existsSync(schema))throw new Error('Missing prisma/schema.prisma');if(!fs.existsSync(apiPkg))throw new Error('Missing apps/api/package.json');
console.log('[start] Tracker setup orchestrator (guarded & idempotent)');
const j=JSON.parse(fs.readFileSync(apiPkg,'utf8'));j.scripts=j.scripts||{};
const want={"prisma":"prisma","prisma:migrate":"prisma migrate dev --schema ../../prisma/schema.prisma","prisma:generate":"prisma generate --schema ../../prisma/schema.prisma","prisma:format":"prisma format --schema ../../prisma/schema.prisma","prisma:validate":"prisma validate --schema ../../prisma/schema.prisma"};let ch=false;
for(const[k,v] of Object.entries(want)){if(j.scripts[k]!==v){j.scripts[k]=v;ch=true;console.log('[patch] set',k)}}
if(ch)fs.writeFileSync(apiPkg,JSON.stringify(j,null,2)+'\n');
const rootPkg=JSON.parse(fs.readFileSync(path.join(repo,'package.json'),'utf8'));
const has=(pkg,n)=> (pkg.dependencies&&pkg.dependencies[n])||(pkg.devDependencies&&pkg.devDependencies[n]);
if(!has(rootPkg,'prisma')) run('pnpm -w add -D prisma'); else console.log('[deps] prisma ok');
if(!has(j,'@prisma/client')) run('pnpm -F ./apps/api add @prisma/client'); else console.log('[deps] @prisma/client ok');
run('pnpm -F ./apps/api run prisma:format');run('pnpm -F ./apps/api run prisma:validate');run('pnpm -F ./apps/api run prisma:migrate -n tracker');run('pnpm -F ./apps/api run prisma:generate');
if(fs.existsSync(appTs)){console.log('[cleanup] remove trpc/routers/_app.ts');if(!DRY)fs.rmSync(appTs,{force:true})}
if(!fs.existsSync(rootTs))throw new Error('Missing apps/api/src/trpc/root.ts');
let t=fs.readFileSync(rootTs,'utf8');
const imp="import { trackerRouter } from './routers/tracker.router';";
if(!/from\s+['"]\.\/routers\/tracker(\.router)?['"]/.test(t)){t=t.replace(/(^(?:import[^\n]*\n)+)/m,(m)=>m+imp+'\n');console.log('[wire] import added')}
if(!/tracker:\s*trackerRouter/.test(t)){t=t.replace(/export\s+const\s+appRouter\s*=\s*router\s*\(\s*\{\s*/m,(m)=>m+'  tracker: trackerRouter,\n');console.log('[wire] appRouter entry added')}
if(!DRY)fs.writeFileSync(rootTs,t,'utf8');
if(!SKIP){run('pnpm -w tsc -b');run('npx nx run api:test')}else console.log('[skip] tests');
console.log('[done] Orchestration complete ✅');
