// tools/scripts/refactor-safe.cjs
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function writeFileIfDiff(file, content) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.writeFileSync(file, content);
  return true;
}

function exists(p) { return fs.existsSync(p); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, s) { fs.writeFileSync(p, s); }

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.next') continue;
      walk(p, out);
    } else if (/\.(t|j)sx?$/.test(ent.name)) out.push(p);
  }
  return out;
}

/* 1) Real render-with-providers helper (idempotent) */
const RWP = `import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>, options);
}
`;
/* 2) TRPC adapter with stable shape */
const TRPC_INDEX = `// Canonical TRPC entry point: prefer named export
// Keep default for backwards-compatibility during migration.
export { trpc } from './client';
export default trpc as typeof trpc;
`;

/* 3) Central Next 15 helpers */
const NEXT_TYPES = `export type Params<T extends Record<string, string>> = { params: Promise<T> };
export type SearchParams = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
`;

/* 4) Domain types */
const DOMAIN = `export const APPLICATION_SOURCES = ["JOB_BOARD","REFERRAL","COMPANY_WEBSITE","RECRUITER","OTHER"] as const;
export type ApplicationSource = typeof APPLICATION_SOURCES[number];
`;

/* ---- run steps ---- */
let changed = 0;

// 1) renderWithProviders.tsx
if (writeFileIfDiff('web/src/test/renderWithProviders.tsx', RWP)) {
  console.log('Wrote web/src/test/renderWithProviders.tsx');
  changed++;
}

// 2) TRPC adapter
if (!exists('web/src/trpc/index.ts')) {
  if (writeFileIfDiff('web/src/trpc/index.ts', TRPC_INDEX)) {
    console.log('Wrote web/src/trpc/index.ts');
    changed++;
  }
} else {
  // Normalize to include both named + default (safe if already present)
  const cur = read('web/src/trpc/index.ts');
  let s = cur;
  if (!/export\s+\{\s*trpc\s*\}\s+from\s+['"].\/client['"]/.test(s)) {
    s = `export { trpc } from './client';\n` + s;
  }
  if (!/export\s+default\s+trpc/.test(s)) {
    s += `\nexport default trpc as typeof trpc;\n`;
  }
  if (s !== cur) {
    write('web/src/trpc/index.ts', s);
    console.log('Normalized web/src/trpc/index.ts');
    changed++;
  }
}

// 3) Next types
if (writeFileIfDiff('web/src/types/next.ts', NEXT_TYPES)) {
  console.log('Wrote web/src/types/next.ts');
  changed++;
}

// 4) Domain types
if (writeFileIfDiff('web/src/types/domain.ts', DOMAIN)) {
  console.log('Wrote web/src/types/domain.ts');
  changed++;
}

// 5) Normalize TRPC imports across source (prefer named import)
const roots = ['web/src', 'web/app'].filter(exists);
const files = roots.flatMap((r) => walk(r));
for (const f of files) {
  let s = read(f), b = s;

  // Replace default-only TRPC import to named
  s = s.replace(
    /import\s+trpc\s+from\s+['"]@\/trpc['"]\s*;?/g,
    "import trpcDefault from '@/trpc';\nconst trpc = trpcDefault as any;\n"
  );
  // Replace mixed default+named to clean named (or keep if test helper needs both)
  s = s.replace(
    /import\s+trpcDefault,\s*\{\s*trpc\s+as\s+trpcNamed\s*\}\s+from\s+['"]@\/trpc['"]\s*;?/g,
    "import { trpc } from '@/trpc';"
  );
  // Upgrade namespace form from earlier workaround
  s = s.replace(
    /import\s*\*\s*as\s*trpcPkg\s+from\s+['"]@\/trpc['"]\s*;?\s*const\s+trpc\s*=\s*\(trpcPkg\s+as\s+any\)\.trpc[^\n]*\n/g,
    "import { trpc } from '@/trpc';\n"
  );

  if (s !== b) {
    write(f, s);
    console.log('Normalized TRPC import:', f);
    changed++;
  }
}

// 6) Verify “status filter” locations (report-only, do not mutate)
function reportStatusFilter(file) {
  const s = read(file);
  const hasLabel = /<label[^>]*>\s*Filter status:\s*<\/label>/.test(s);
  const hasSelect = /<select[^>]*>/.test(s);
  if (hasLabel && hasSelect && !/LabeledSelect/.test(s)) {
    console.log('[info] Consider migrating to <LabeledSelect /> in:', file);
  }
}
['web/src/app/applications/page.tsx', 'web/src/app/goals/page.tsx']
  .filter(exists).forEach(reportStatusFilter);

console.log(changed ? `Done. Files changed: ${changed}` : 'No changes needed (idempotent).');
