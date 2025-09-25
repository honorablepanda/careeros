#!/usr/bin/env node
const fs = require('fs'),
  path = require('path');
const file = path.join('apps', 'api', 'src', 'router', 'root.ts');
const s = fs.readFileSync(file, 'utf8');

// track existing named imports from local './xxx'
const importRe = /^import\s+{([^}]*)}\s+from\s+['"]\.\/([^'"]+)['"];?/gm;
const imported = new Set();
for (const m of s.matchAll(importRe)) {
  m[1]
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((id) => imported.add(id));
}

// find appRouter block
const start = s.indexOf('export const appRouter = router({');
if (start < 0) {
  console.error('[router-imports] appRouter not found');
  process.exit(1);
}
const end = s.indexOf('});', start);
const block = s.slice(start, end < 0 ? s.length : end);

// capture values like "name: SomeRouter"
const used = new Set();
for (const m of block.matchAll(/[\w$]+\s*:\s*([A-Za-z_$][\w$]*)/g))
  used.add(m[1]);

// anything ending with Router and not imported is missing
const missing = [...used].filter(
  (id) => id.endsWith('Router') && !imported.has(id)
);

if (missing.length) {
  console.error('[router-imports] Missing imports for:', missing.join(', '));
  process.exit(1);
} else {
  console.log('[router-imports] OK');
}
