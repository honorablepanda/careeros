// tools/scripts/fix-prisma-enums.cjs
const fs = require('fs');
const path = require('path');

function patchFile(p) {
  if (!fs.existsSync(p)) { console.log(`(skip) ${p} not found`); return; }
  let s = fs.readFileSync(p, 'utf8');

  // 1) Ensure $Enums is a runtime import (NOT "import type")
  s = s.replace(
    /import\s+type\s+{\s*([^}]*)\s*}\s+from\s+'@prisma\/client';/g,
    (m, g1) => `import { ${g1} } from '@prisma/client';`
  );

  if (!/from '@prisma\/client'/.test(s)) {
    s = `import { Prisma, $Enums } from '@prisma/client';\n` + s;
  } else if (!/\$Enums/.test(s)) {
    s = s.replace(
      /import\s+{([^}]*)}\s+from\s+'@prisma\/client';/,
      (m, g1) => {
        const names = g1.split(',').map(v => v.trim()).filter(Boolean);
        if (!names.includes('Prisma')) names.push('Prisma');
        if (!names.includes('$Enums')) names.push('$Enums');
        return `import { ${Array.from(new Set(names)).join(', ')} } from '@prisma/client';`;
      }
    );
  }

  // 2) Swap Prisma enum refs → $Enums
  s = s.replace(/Prisma\.ApplicationStatus/g, '$Enums.ApplicationStatus');
  s = s.replace(/Prisma\.ApplicationSource/g, '$Enums.ApplicationSource');

  // 3) Normalize legacy literal "INTERVIEWING" → proper enum
  s = s.replace(
    /return\s+status\s*===\s*['"]INTERVIEWING['"]\s*\?[^:]+:\s*status\s*;/,
    'return status === "INTERVIEWING" ? $Enums.ApplicationStatus.INTERVIEW : status;'
  );

  fs.writeFileSync(p, s, 'utf8');
  console.log(`✓ Patched ${p}`);
}

const target = path.join('apps', 'api', 'src', 'trpc', 'routers', 'tracker.router.ts');
patchFile(target);
