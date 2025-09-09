#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const webDir = fs.existsSync(path.join(root,'web'))
  ? path.join(root,'web')
  : (fs.existsSync(path.join(root,'apps','web')) ? path.join(root,'apps','web') : null);

console.log('Root:', root);
console.log('webDir guess:', webDir || '(not found)');

function show(label, relCandidates) {
  const cands = relCandidates.map(r => path.join(webDir || '', r));
  const rows = cands.map(p => ({
    candidate: p,
    exists: !!p && fs.existsSync(p),
    abs: p ? path.resolve(p) : '(no webDir)',
  }));
  const ok = rows.some(r => r.exists);
  console.log(`\n[${label}] -> ${ok ? 'FOUND' : 'MISSING'}`);
  rows.forEach(r => console.log(` - ${r.exists ? '✓' : '✗'} ${r.abs}`));
}

if (!webDir) {
  console.error('\nNo web directory found (neither "web/" nor "apps/web/").');
  process.exit(2);
}

show('Jest config', ['jest.config.ts','jest.config.js']);
show('tsconfig.spec.json', ['tsconfig.spec.json']);
show('setupTests', ['test/setupTests.ts','test/setupTests.js']);
show('trpc.mock', ['test/trpc.mock.ts','test/trpc.mock.js']);
show('tracker spec', ['specs/tracker.spec.tsx','specs/tracker.spec.ts']);
show('index spec', ['specs/index.spec.tsx','specs/index.spec.ts']);
