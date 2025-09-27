#!/usr/bin/env node
// Verifies tsconfig.base.json path aliases point to real files/dirs.
const fs = require('fs'); const path = require('path');
const ROOT = process.cwd(); const P = p => path.join(ROOT, p);
const ts = JSON.parse(fs.readFileSync(P('tsconfig.base.json'), 'utf8'));
const paths = (ts.compilerOptions && ts.compilerOptions.paths) || {};
const required = [
  '@careeros/prisma',
  '@careeros/trpc',
  '@careeros/shared/prisma',
  '@careeros/shared/trpc',
  '@careeros/shared/trpc/*',
  '@careeros/routers/*'
];

function targetExists(t) {
  // Support "dir/*" and "file.ts"
  if (t.endsWith('/*')) return fs.existsSync(P(t.slice(0, -2)));
  return fs.existsSync(P(t));
}

let ok = true; const problems = [];
for (const key of required) {
  const arr = paths[key];
  if (!Array.isArray(arr) || arr.length === 0) {
    ok = false; problems.push({ key, reason: 'missing mapping' }); continue;
  }
  for (const t of arr) {
    const exists = targetExists(t);
    if (!exists) { ok = false; problems.push({ key, target: t, reason: 'target does not exist' }); }
  }
}

if (!ok) {
  console.error('Alias check failed:\n' + problems.map(p => ` - ${p.key} → ${p.target || ''} (${p.reason})`).join('\n'));
  process.exit(1);
}
console.log('Aliases look good.');
