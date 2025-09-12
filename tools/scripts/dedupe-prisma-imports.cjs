const fs = require('fs');
const path = require('path');

const p = path.join(process.cwd(), 'apps/api/src/trpc/routers/tracker.router.ts');
if (!fs.existsSync(p)) { console.error('File not found:', p); process.exit(1); }

let s = fs.readFileSync(p, 'utf8');
const backup = p + '.imports.bak';
try { if (!fs.existsSync(backup)) fs.copyFileSync(p, backup); } catch {}

// collect all named specifiers imported from @prisma/client (type or value)
const importRe = /^import\s+(type\s+)?\{\s*([^}]+)\s*\}\s+from\s+'@prisma\/client';\s*$/gm;
let m, names = new Set();
while ((m = importRe.exec(s)) !== null) {
  m[2].split(',').forEach(x => {
    const t = x.trim().replace(/^type\s+/, '').replace(/\s+as\s+.*/,'');
    if (t) names.add(t);
  });
}
// always ensure these are present
names.add('$Enums');
names.add('Prisma');

// remove all existing @prisma/client import lines
s = s.replace(importRe, '');

// insert a single combined value import after any "use client" or top comments
const lines = s.split('\n');
// find insertion index (after shebang / "use client" / comments block)
let idx = 0;
while (idx < lines.length && (/^\s*(\/\/|\/\*|\*|\*\/|['"]use client['"];|['"]use server['"];)?\s*$/.test(lines[idx]) || lines[idx].trim()==='')) {
  idx++;
}
lines.splice(idx, 0, `import { ${Array.from(names).sort().join(', ')} } from '@prisma/client';`);
s = lines.join('\n');

// also guard against accidental duplicates produced elsewhere
s = s.replace(/\n{3,}/g, '\n\n');

fs.writeFileSync(p, s, 'utf8');
console.log('✓ Deduped @prisma/client imports → single line with { Prisma, $Enums }');
