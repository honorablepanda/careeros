#!/usr/bin/env node
/* Prisma enum fixer (idempotent). Use --dry, --backup, --glob
   - Patches files to use $Enums instead of Prisma.* for enums
   - Ensures runtime import of { Prisma, $Enums } from '@prisma/client'
   - Normalizes legacy "INTERVIEWING" → $Enums.ApplicationStatus.INTERVIEW
*/
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const BACKUP = args.includes('--backup');

function getArg(flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')
    ? args[i + 1]
    : fallback;
}
const GLOB = getArg('--glob', null);

function listFiles(start) {
  const out = [];
  function walk(p) {
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(p)) {
        if (['node_modules', '.git', 'dist', 'coverage'].includes(f)) continue;
        walk(path.join(p, f));
      }
    } else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
      out.push(p);
    }
  }
  walk(start);
  return out;
}

function resolveTargets() {
  if (GLOB) {
    // crude glob: supports ** and *
    const root = GLOB.split('**')[0] || '.';
    const all = listFiles(root).map((f) => f.replace(/\\/g, '/'));
    const re = new RegExp(
      '^' +
        GLOB.replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*') +
        '$'
    );
    return all.filter((f) => re.test(f)).map((f) => f.replace(/\//g, path.sep));
  }
  return [
    path.join('apps', 'api', 'src', 'trpc', 'routers', 'tracker.router.ts'),
  ];
}

function patchContent(s) {
  let changed = false;

  // 1) Convert type-only import to runtime import
  s = s.replace(
    /import\s+type\s+{\s*([^}]*)\s*}\s+from\s+'@prisma\/client';/g,
    (m, g1) => {
      changed = true;
      return `import { ${g1} } from '@prisma/client';`;
    }
  );

  // 2) Ensure runtime import has Prisma and $Enums
  if (!/from '@prisma\/client'/.test(s)) {
    s = `import { Prisma, $Enums } from '@prisma/client';\n` + s;
    changed = true;
  } else if (!/\$Enums/.test(s) || !/Prisma/.test(s)) {
    s = s.replace(/import\s+{([^}]*)}\s+from\s+'@prisma\/client';/, (m, g1) => {
      let names = g1
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      if (!names.includes('Prisma')) names.push('Prisma');
      if (!names.includes('$Enums')) names.push('$Enums');
      names = Array.from(new Set(names));
      changed = true;
      return `import { ${names.join(', ')} } from '@prisma/client';`;
    });
  }

  // 3) Prisma enum refs → $Enums
  const before3 = s;
  s = s.replace(/Prisma\.ApplicationStatus/g, '$Enums.ApplicationStatus');
  s = s.replace(/Prisma\.ApplicationSource/g, '$Enums.ApplicationSource');
  if (s !== before3) changed = true;

  // 4) Normalize legacy literal
  const before4 = s;
  s = s.replace(
    /return\s+status\s*===\s*['"]INTERVIEWING['"]\s*\?[^:]+:\s*status\s*;/,
    'return status === "INTERVIEWING" ? $Enums.ApplicationStatus.INTERVIEW : status;'
  );
  if (s !== before4) changed = true;

  return { s, changed };
}

function patchFile(p) {
  if (!fs.existsSync(p)) {
    console.log(`(skip) ${p} not found`);
    return 0;
  }
  const orig = fs.readFileSync(p, 'utf8');
  const { s, changed } = patchContent(orig);
  if (!changed) {
    console.log(`= No changes: ${p}`);
    return 0;
  }

  if (BACKUP) {
    const bak = `${p}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
    if (!DRY) fs.writeFileSync(bak, orig, 'utf8');
    console.log(`• Backup: ${bak}`);
  }
  if (!DRY) fs.writeFileSync(p, s, 'utf8');
  console.log(`✓ Patched ${p}`);
  return 1;
}

const targets = resolveTargets();
let modified = 0;
targets.forEach((f) => {
  modified += patchFile(f);
});
console.log(DRY ? '⚐ DRY RUN complete' : '✔ All done');
