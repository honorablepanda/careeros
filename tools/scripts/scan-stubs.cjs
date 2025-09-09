#!/usr/bin/env node
/**
 * scan-stubs.cjs
 * Reports which files are still Phase 3 stubs vs. real code.
 * Outputs JSON + Markdown in /scans.
 *
 * Usage:
 *   node tools/scripts/scan-stubs.cjs
 *   node tools/scripts/scan-stubs.cjs --fail
 *   node tools/scripts/scan-stubs.cjs --fail-after=2025-10-01
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const FAIL = args.includes('--fail');
const FAIL_AFTER = (args.find(a => a.startsWith('--fail-after=')) || '').split('=')[1] || null;

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
  scansDir: path.join(ROOT, 'scans'),
};

function exists(p){ try { return fs.existsSync(p); } catch { return false; } }
function read(p){ try { return fs.readFileSync(p,'utf8'); } catch { return null; } }
function detectStub(src){
  if (!src) return { stub:false, reason:'' };
  if (src.startsWith('/** STUB:PHASE3')) return { stub:true, reason:'STUB:PHASE3 header' };
  if (/Minimal placeholder router|export const\s+\w+Router\s*=\s*\{\}\s*as any;/.test(src))
    return { stub:true, reason:'placeholder router' };
  if (/expect\(true\)\.toBe\(true\)/.test(src) || /placeholder/.test(src))
    return { stub:true, reason:'placeholder test' };
  if (/export type\s+[A-Z][A-Za-z0-9]*DTO/.test(src) && src.split('\n').length < 60)
    return { stub:true, reason:'minimal DTO type' };
  if (src.split('\n').length < 20 && /<h1>/.test(src))
    return { stub:true, reason:'minimal page stub' };
  return { stub:false, reason:'' };
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function firstExisting(paths){ return paths.find(exists) || null; }

function entry(mod, kind, p){
  const src = read(p);
  const { stub, reason } = detectStub(src);
  return { module: mod, kind, path: p ? path.relative(ROOT, p) : '', status: stub ? 'STUB' : 'REAL', reason };
}

function scanModule(m){
  const rows = [];
  const router = path.join(P.apiRouterDir, `${m}.ts`);
  if (exists(router)) rows.push(entry(m,'router',router));

  const rtest = path.join(P.apiRouterTests, `${m}.spec.ts`);
  if (exists(rtest)) rows.push(entry(m,'router-test',rtest));

  const e2e = path.join(P.webSpecsDir, `${m}.e2e.spec.ts`);
  if (exists(e2e)) rows.push(entry(m,'e2e',e2e));

  const page = path.join(P.webAppDir, m, 'page.tsx');
  if (exists(page)) rows.push(entry(m,'page',page));

  const typesFile = firstExisting([
    path.join(P.sharedTypesSrcDir, `${m}.ts`),
    path.join(P.sharedTypesDir, `${m}.ts`)
  ]);
  if (typesFile) rows.push(entry(m,'types',typesFile));

  return rows;
}

(function main(){
  if (!exists(P.scansDir)) fs.mkdirSync(P.scansDir, { recursive: true });
  const when = new Date().toISOString().replace(/[:.]/g,'-');
  const jsonOut = path.join(P.scansDir, `stub-report-${when}.json`);
  const mdOut   = path.join(P.scansDir, `stub-report-${when}.md`);

  const rows = MODS.flatMap(scanModule);
  const summary = {
    total: rows.length,
    stubs: rows.filter(r => r.status === 'STUB').length,
    real: rows.filter(r => r.status === 'REAL').length,
  };

  const report = { when: new Date().toISOString(), summary, rows, failAfter: FAIL_AFTER };
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');

  let md = `# Stub Report\n\nGenerated: ${report.when}\n\n`;
  md += `**Total files:** ${summary.total}  •  **STUBs:** ${summary.stubs}  •  **REAL:** ${summary.real}\n\n`;
  md += `| Module | Kind | Status | Reason | Path |\n|---|---|---|---|---|\n`;
  for (const r of rows) {
    md += `| ${r.module} | ${r.kind} | ${r.status} | ${r.reason || ''} | ${r.path} |\n`;
  }
  fs.writeFileSync(mdOut, md, 'utf8');

  console.log('✓ Stub scan complete');
  console.log('  JSON:', path.relative(process.cwd(), jsonOut));
  console.log('  MD  :', path.relative(process.cwd(), mdOut));

  // Optional fail conditions
  if (FAIL || FAIL_AFTER) {
    const cutoff = FAIL_AFTER ? new Date(FAIL_AFTER) : null;
    const shouldFail = summary.stubs > 0 && (!cutoff || new Date() >= cutoff);
    if (shouldFail) {
      console.error(`✗ Stubs present${cutoff ? ` (past ${FAIL_AFTER})` : ''}: ${summary.stubs}`);
      process.exitCode = 2;
    }
  }
})();
