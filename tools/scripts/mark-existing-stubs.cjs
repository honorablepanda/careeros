#!/usr/bin/env node
/**
 * mark-existing-stubs.cjs
 * Adds a standard header "STUB:PHASE3" to known scaffolded files (idempotent).
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const MODS = [
  'auth','onboarding','dashboard','tracker','resume','settings','profile','goals',
  'planner','calendar','roadmap','interviews','activity','notifications','summary',
  'skills','insights','metrics','achievements','networking',
];

const P = {
  apiRouterDir: path.join(ROOT, 'apps','api','src','router'),
  apiRouterTests: path.join(ROOT, 'apps','api','src','router','__tests__'),
  webSpecsDir: path.join(ROOT, 'web','specs'),
  webAppDir: path.join(ROOT, 'web','src','app'),
  sharedTypesDir: path.join(ROOT, 'shared','types'),
  sharedTypesSrcDir: path.join(ROOT, 'shared','types','src'),
};

const STUB_HDR = `/** STUB:PHASE3
 * This is a scaffold placeholder. Replace with a real implementation.
 * Remove this header when done.
 */\n`;

function exists(p){ try { return fs.existsSync(p); } catch { return false; } }
function read(p){ try { return fs.readFileSync(p,'utf8'); } catch { return null; } }
function write(p,s){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,s,'utf8'); }
function ensureHeaderIf(p, predicate){
  const src = read(p); if (!src) return false;
  if (src.startsWith('/** STUB:PHASE3')) return false;
  if (predicate(src)) { write(p, STUB_HDR + src); return true; }
  return false;
}

function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

let tagged = 0;

for (const m of MODS) {
  // Router files
  const r = path.join(P.apiRouterDir, `${m}.ts`);
  if (exists(r)) {
    tagged += ensureHeaderIf(r, s =>
      /Minimal placeholder router|export const\s+\w+Router\s*=\s*\{\}\s*as any;/.test(s)
      || !/router\(/.test(s) // very liberal: no real tRPC wiring
    ) ? 1 : 0;
  }

  // Router unit test stubs
  const rt = path.join(P.apiRouterTests, `${m}.spec.ts`);
  if (exists(rt)) {
    tagged += ensureHeaderIf(rt, s =>
      /exports .*Router|toBeDefined\(\)/.test(s) && s.split('\n').length < 40
    ) ? 1 : 0;
  }

  // E2E placeholders
  const e2e = path.join(P.webSpecsDir, `${m}.e2e.spec.ts`);
  if (exists(e2e)) {
    tagged += ensureHeaderIf(e2e, s =>
      /placeholder/.test(s) || /expect\(true\)\.toBe\(true\)/.test(s)
    ) ? 1 : 0;
  }

  // Page stubs
  const page = path.join(P.webAppDir, m, 'page.tsx');
  if (exists(page)) {
    const title = cap(m);
    tagged += ensureHeaderIf(page, s =>
      new RegExp(`<h1>${title}</h1>`).test(s) && s.split('\n').length < 40
    ) ? 1 : 0;
  }

  // Types stubs
  const typesDir = exists(P.sharedTypesSrcDir) ? P.sharedTypesSrcDir : P.sharedTypesDir;
  const tf = path.join(typesDir, `${m}.ts`);
  if (exists(tf)) {
    tagged += ensureHeaderIf(tf, s =>
      /export type\s+[A-Z][A-Za-z0-9]*DTO/.test(s) && s.split('\n').length < 60
    ) ? 1 : 0;
  }
}

console.log(tagged ? `✓ Tagged ${tagged} stub file(s) with STUB:PHASE3` : '= No new stubs tagged');
