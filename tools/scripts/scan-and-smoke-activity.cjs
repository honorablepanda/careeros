#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ARG_JSON = process.argv.includes('--json');
const ARG_PORT = (() => {
  const pIdx = process.argv.findIndex(x => x === '--port');
  if (pIdx !== -1 && process.argv[pIdx + 1]) return Number(process.argv[pIdx + 1]);
  return 3000;
})();

function log(msg) { if (!ARG_JSON) console.log(msg); }
function ok(msg){ if (!ARG_JSON) console.log('✓ ' + msg);}
function warn(msg){ if (!ARG_JSON) console.warn('! ' + msg);}
function err(msg){ if (!ARG_JSON) console.error('✗ ' + msg);}

const result = {
  webPath: null,
  sourceRoot: null,
  rootsFound: [],
  chosenRoot: null,
  checks: [],
  manifest: { built: false, appPaths: null, routesMatching: [] },
  smoke: { tried: false, port: ARG_PORT, dynamicStatus: null, queryStatus: null, urlDynamic: null, urlQuery: null },
  suggestions: [],
};

// --- helpers
const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const hasDefaultExport = (code='') => /\bexport\s+default\b/.test(code);

function readJson(p){
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return null; }
}

function listFilesRecursive(root){
  const out=[];
  (function walk(dir){
    let ents=[];
    try { ents = fs.readdirSync(dir,{withFileTypes:true}); } catch { return; }
    for (const e of ents){
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else out.push(p);
    }
  })(root);
  return out;
}

// --- detect web path & sourceRoot
const WEB_PATH = exists('apps/web') ? path.resolve('apps/web') : null;
if (!WEB_PATH){
  err('Could not find apps/web. Adjust script for your project path.');
  process.exit(1);
}
result.webPath = WEB_PATH;
ok(`Detected web project path: ${path.relative(process.cwd(), WEB_PATH)}`);

const projectJson = readJson(path.join(WEB_PATH, 'project.json')) || {};
const sourceRoot = projectJson.sourceRoot || (exists(path.join(WEB_PATH,'src')) ? path.join('apps/web','src') : 'apps/web');
result.sourceRoot = sourceRoot.replace(/\\/g,'/');
ok(`Detected sourceRoot: ${result.sourceRoot}`);

// --- choose active app root
const roots = [
  path.join(WEB_PATH,'src','app'),
  path.join(WEB_PATH,'app'),
].filter(exists);
result.rootsFound = roots.map(r => r.replace(/\\/g,'/'));
for (const r of result.rootsFound) log(`• Found app root: ${r}`);

let chosenRoot = exists(path.join(WEB_PATH,'src')) ? path.join(WEB_PATH,'src','app') : path.join(WEB_PATH,'app');
if (!exists(chosenRoot) && roots.length) chosenRoot = roots[0];
result.chosenRoot = chosenRoot.replace(/\\/g,'/');
ok(`Active app root (heuristic): ${result.chosenRoot}`);

if (result.rootsFound.length > 1) {
  warn('Multiple app roots exist — ensure ONLY one (prefer src/app if sourceRoot uses src).');
  result.suggestions.push('Remove or back up duplicate app roots so only one remains (prefer apps/web/src/app).');
}

// --- required files
const must = {
  layout: path.join(chosenRoot,'layout.tsx'),
  providers: path.join(chosenRoot,'providers.tsx'),
  home: path.join(chosenRoot,'page.tsx'),
  activityQuery: path.join(chosenRoot,'tracker','activity','page.tsx'),
  activityDynamic: path.join(chosenRoot,'tracker','[id]','activity','page.tsx'),
};

function checkFile(p, label, requireDefaultExport=false){
  const rel = p.replace(/\\/g,'/');
  if (!exists(p)){
    result.checks.push({ ok:false, message:`Missing ${label}: ${rel}` });
    err(`Missing ${label}: ${rel}`);
    return false;
  }
  ok(`Found ${label}: ${rel}`);
  const code = read(p) || '';
  if (requireDefaultExport){
    if (hasDefaultExport(code)) {
      ok(`"export default" present in ${rel}`);
      result.checks.push({ ok:true, message:`"export default" present in ${rel}` });
    } else {
      err(`No "export default" React component in ${rel}`);
      result.checks.push({ ok:false, message:`No "export default" React component in ${rel}` });
    }
  } else {
    result.checks.push({ ok:true, message:`Found ${label}: ${rel}` });
  }
  return true;
}

checkFile(must.layout, 'root layout');
const layoutCode = read(must.layout) || '';
if (!hasDefaultExport(layoutCode)){
  err(`No "export default" in ${must.layout.replace(/\\/g,'/')}`);
  result.checks.push({ ok:false, message:`"export default" missing in layout.tsx` });
} else {
  result.checks.push({ ok:true, message:`"export default" present in ${must.layout.replace(/\\/g,'/')}` });
}

if (exists(must.providers)) ok(`Found providers (optional): ${must.providers.replace(/\\/g,'/')}`);
else warn('providers.tsx not found (that is fine)');

checkFile(must.home, 'home page', true);
checkFile(must.activityQuery, 'querystring activity page', true);
checkFile(must.activityDynamic, 'dynamic activity page', true);

// --- manifests (only after build)
const nextDir = path.join(WEB_PATH,'.next');
const appPathsManifest = path.join(nextDir, 'server', 'app-paths-manifest.json');
const routesManifest = path.join(nextDir, 'routes-manifest.json');

if (exists(appPathsManifest) || exists(routesManifest)){
  result.manifest.built = true;
  const apJson = readJson(appPathsManifest);
  const rmJson = readJson(routesManifest);
  result.manifest.appPaths = apJson || null;

  if (apJson) {
    const routes = Object.keys(apJson);
    const wants = [
      '/tracker/[id]/activity/page',
      '/tracker/activity/page',
    ];
    for (const want of wants){
      if (routes.includes(want)) {
        ok(`Manifest has route: ${want}`);
        result.manifest.routesMatching.push(want);
      } else {
        err(`Manifest does NOT contain: ${want}`);
      }
    }
  }
} else {
  warn('Manifest not found (dev/Turbopack may not emit it). Run a full build to generate manifests.');
  result.suggestions.push('Run: pnpm -w exec nx run web:build --filter ./apps/web');
  result.suggestions.push('Then re-run this script to verify manifest contains /tracker routes.');
}

// --- try to discover an Application id (optional)
let appId = process.env.APP_ID || '';
try {
  // Use minimal Prisma inline script but don’t crash if prisma not configured
  const { execSync } = require('child_process');
  const cmd = [
    'node',
    '-e',
    `"const { PrismaClient } = require('@prisma/client');`,
    ` (async () => {`,
    `   const p = new PrismaClient();`,
    `   const r = await p.application?.findFirst?.({ select: { id: true } }).catch(()=>null);`,
    `   console.log(r?.id || '');`,
    `   await p.$disconnect();`,
    ` })().catch(()=>console.log(''));"`
  ].join(' ');
  const out = execSync(cmd, { stdio: ['ignore','pipe','ignore'], shell: true }).toString().trim();
  if (out) appId = out;
} catch (_) {
  // ignore
}

// --- optional smoke HTTP GET if server is up
function httpGet(url){
  return new Promise(resolve=>{
    const req = http.get(url, res=>{
      res.resume();
      res.on('end', ()=> resolve(res.statusCode || 0));
    });
    req.on('error', ()=> resolve(0));
  });
}

(async () => {
  // dynamic route smoke test
  if (appId){
    const url = `http://localhost:${ARG_PORT}/tracker/${appId}/activity`;
    result.smoke.tried = true;
    result.smoke.urlDynamic = url;
    const s = await httpGet(url);
    result.smoke.dynamicStatus = s;
    (s===200?ok:warn)(`HTTP ${s} → ${url}`);
  } else {
    warn('No Application id available for dynamic route smoke test.');
    result.suggestions.push('Seed or create an Application and re-run with APP_ID=<id> or --seed script.');
  }

  // querystring route smoke test
  if (appId){
    const url = `http://localhost:${ARG_PORT}/tracker/activity?id=${encodeURIComponent(appId)}`;
    result.smoke.urlQuery = url;
    const s = await httpGet(url);
    result.smoke.queryStatus = s;
    (s===200?ok:warn)(`HTTP ${s} → ${url}`);
  }

  // Summary + suggestions
  if (ARG_JSON) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    log('\n=== Summary ===');
    ok(`Active app root: ${result.chosenRoot}`);
    const bad = result.checks.filter(c=>!c.ok);
    if (bad.length){
      err('Some required files/exports are missing.');
      bad.forEach(b=>err(' - ' + b.message));
    } else {
      ok('All required files and default exports look good.');
    }
    if (!result.manifest.built) warn('No build manifest — can’t confirm routes from build.');
    if (result.smoke.tried){
      if (result.smoke.dynamicStatus !== 200 || result.smoke.queryStatus !== 200){
        warn('One or more routes did not return 200. If server is running, try clearing Next cache:');
        log('  rimraf apps/web/.next .nx/cache && pnpm -w exec nx run web:serve --filter ./apps/web');
      }
    }
    if (result.suggestions.length){
      log('\nNext steps:');
      result.suggestions.forEach(s=>log('• ' + s));
    }
  }
})();
