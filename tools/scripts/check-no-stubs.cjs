#!/usr/bin/env node
// Fails if obvious stub markers are present in app/src or routers.
const fs = require('fs'); const path = require('path');
const ROOT = process.cwd(); const SCAN_DIRS = ['web/src', 'apps/api/src'];
const PATTERNS = [/FIXME_STUB/i, /TODO:\s*STUB/i, /__STUB__/i, /PLACEHOLDER_IMPLEMENTATION/i];
let fails = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx|js|cjs|mts|cts)$/.test(e.name)) continue;
    const s = fs.readFileSync(p, 'utf8');
    if (PATTERNS.some(rx => rx.test(s))) fails.push(p);
  }
}
for (const d of SCAN_DIRS) if (fs.existsSync(d)) walk(d);
if (fails.length) {
  console.error('Stub content detected:\n' + fails.map(f => ' - ' + f).join('\n'));
  process.exit(1);
}
console.log('No stub markers detected.');
