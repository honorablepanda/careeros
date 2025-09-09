#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const scansDir = path.join(root, 'scans');
fs.mkdirSync(scansDir, { recursive: true });

const now = new Date().toISOString().replace(/[:.]/g,'-');
const healthJson = path.join(scansDir, `repo-health-${now}.json`);
const trpcJson   = path.join(scansDir, `trpc-scan-report-${now}.json`);

console.log('→ Running repo health scan…');
console.log('→ Running web tRPC scan…');

const webDir =
  fs.existsSync(path.join(root,'web')) ? path.join(root,'web') :
  fs.existsSync(path.join(root,'apps','web')) ? path.join(root,'apps','web') :
  null;

const missing = [];
function existsOne(relPaths) {
  if (!webDir) return false;
  return relPaths.some(rel => fs.existsSync(path.join(webDir, rel)));
}
function ensure(label, relPaths, code) {
  if (!existsOne(relPaths)) missing.push({ label, code, relPaths });
}

// Checks (look in web/ or apps/web/, accept .ts or .js where relevant)
ensure('web/jest.config.(ts|js)', ['jest.config.ts','jest.config.js'], 'WEB_JEST_CONFIG_MISSING');
ensure('web/tsconfig.spec.json', ['tsconfig.spec.json'], 'WEB_TS_SPEC_MISSING');
ensure('web/test/setupTests.(ts|js)', ['test/setupTests.ts','test/setupTests.js'], 'WEB_SETUP_TESTS');
ensure('web/test/trpc.mock.(ts|js)', ['test/trpc.mock.ts','test/trpc.mock.js'], 'WEB_TRPC_MOCK');
ensure('web/specs/tracker.spec.(tsx|ts)', ['specs/tracker.spec.tsx','specs/tracker.spec.ts'], 'WEB_TRACKER_SPEC_PRESENT');
ensure('web/specs/index.spec.(tsx|ts)', ['specs/index.spec.tsx','specs/index.spec.ts'], 'WEB_INDEX_SPEC_PRESENT');

// Write JSON outputs (keep format simple but useful)
fs.writeFileSync(healthJson, JSON.stringify({
  time: new Date().toISOString(),
  root,
  webDir,
  missing
}, null, 2));

fs.writeFileSync(trpcJson, JSON.stringify({
  time: new Date().toISOString(),
  webDir,
  checks: ['jest.config','tsconfig.spec','setupTests','trpc.mock','tracker.spec','index.spec'],
  missing
}, null, 2));

console.log('\n================ FINAL SCAN SUMMARY ================');
if (!webDir) {
  console.log('Missing / Blocking:');
  console.log('  • WEB_DIR_NOT_FOUND: neither "web/" nor "apps/web/" exists.');
  console.log(`\nhealth JSON: ${healthJson}`);
  console.log(`trpc   JSON: ${trpcJson}`);
  console.log('====================================================\n');
  process.exit(2);
}

if (missing.length === 0) {
  console.log('All good; no blocking issues.');
  console.log(`\nhealth JSON: ${healthJson}`);
  console.log(`trpc   JSON: ${trpcJson}`);
  console.log('====================================================\n');
  process.exit(0);
}

console.log('Missing / Blocking:');
for (const m of missing) {
  console.log(`  • ${m.label}`);
  console.log(`  • ${m.code}`);
}
console.log(`\nhealth JSON: ${healthJson}`);
console.log(`trpc   JSON: ${trpcJson}`);
console.log('====================================================\n');
process.exit(2);
