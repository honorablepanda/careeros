#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');

const TSCONFIG = 'tsconfig.base.json';
const paths = (JSON.parse(fs.readFileSync(TSCONFIG, 'utf8')).compilerOptions || {}).paths || {};
const configured = Object.keys(paths);

// capture all imports that look like alias packages (e.g. @careeros/*)
let imported = new Set();
try {
  const out = execSync(
    `git grep -h -nE "from ['\\"](@[^'\\"]+)" -- apps web | sed -E "s/.*from ['\\"]([^'\\"]+)['\\"].*/\\1/"`,
    { encoding: 'utf8' }
  );
  out.split('\n').filter(Boolean).forEach(m => imported.add(m));
} catch {
  // no matches is fine
}

// helper: does an import have a mapping (exact or wildcard)?
const isMapped = mod =>
  configured.some(key => {
    if (key.endsWith('/*')) return mod.startsWith(key.slice(0, -1));
    return mod === key;
  });

// only fail for imports that are actually used but unmapped
const missing = [...imported].filter(m => m.startsWith('@') && !isMapped(m));

if (missing.length) {
  console.error('Alias check failed:\n' + missing.map(m => ` - ${m} → (missing mapping)`).join('\n'));
  process.exit(1);
} else {
  console.log('Alias check passed.');
}
