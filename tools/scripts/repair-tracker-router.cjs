// Idempotently repair apps/api/src/trpc/routers/tracker.router.ts for $Enums usage
const fs = require('fs');
const path = require('path');

const p = path.join(
  process.cwd(),
  'apps/api/src/trpc/routers/tracker.router.ts'
);
if (!fs.existsSync(p)) {
  console.error('File not found:', p);
  process.exit(1);
}
let s = fs.readFileSync(p, 'utf8');

// Backup once per run
const backup = p + '.bak';
try {
  if (!fs.existsSync(backup)) fs.copyFileSync(p, backup);
} catch {}

const ensureValueImport = () => {
  // Convert any type-only import to value import
  s = s.replace(
    /import\s+type\s+\{\s*([^}]+)\s*\}\s+from\s+'@prisma\/client';/g,
    (_m, g1) => `import { ${g1.trim()} } from '@prisma/client';`
  );
  // Ensure { Prisma, $Enums } are present on any existing import
  if (/from '@prisma\/client'/.test(s)) {
    s = s.replace(
      /import\s+\{\s*([^}]+)\s*\}\s+from\s+'@prisma\/client';/g,
      (_m, g1) => {
        const names = new Set(
          g1
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        );
        names.add('Prisma');
        names.add('$Enums');
        return `import { ${Array.from(names).join(
          ', '
        )} } from '@prisma/client';`;
      }
    );
  } else {
    s = `import { Prisma, $Enums } from '@prisma/client';\n` + s;
  }
};

const swapEnumRefs = () => {
  s = s.replace(/Prisma\.ApplicationStatus/g, '$Enums.ApplicationStatus');
  s = s.replace(/Prisma\.ApplicationSource/g, '$Enums.ApplicationSource');
};

const fixStatusDefault = () => {
  // Fix any broken default like ".default(.ApplicationStatus.APPLIED)" or wrong value
  s = s.replace(
    /(\.union\(\[.*?z\.literal\(['"]INTERVIEWING['"]\)\]\)\))(\s*\.\s*default\([^)]*\))?/s,
    (_m, u, d) => `${u}.default($Enums.ApplicationStatus.APPLIED)`
  );
  // Last resort: stray ".default(.ApplicationStatus.APPLIED)" → correct
  s = s.replace(
    /\.default\(\s*\.ApplicationStatus\.APPLIED\s*\)/g,
    `.default($Enums.ApplicationStatus.APPLIED)`
  );
};

const mapInterviewingLiteral = () => {
  // Normalize any mapper returning the legacy literal
  s = s.replace(
    /return\s+status\s*===\s*['"]INTERVIEWING['"]\s*\?[^:]+:\s*status\s*;/g,
    `return status === "INTERVIEWING" ? $Enums.ApplicationStatus.INTERVIEW : status;`
  );
  s = s.replace(
    /return\s+status\s*===\s*(['"])INTERVIEWING\1\s*\?[\s\S]*?:\s*status\s*;/g,
    `return status === "INTERVIEWING" ? $Enums.ApplicationStatus.INTERVIEW : status;`
  );
};

ensureValueImport();
swapEnumRefs();
fixStatusDefault();
mapInterviewingLiteral();

fs.writeFileSync(p, s, 'utf8');
console.log(
  '✓ Repaired tracker.router.ts to use $Enums and a valid .default(...) for status.'
);
