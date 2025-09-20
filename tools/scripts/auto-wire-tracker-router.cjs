#!/usr/bin/env node
/* Auto-wire trackerRouter into appRouter
 * Usage:
 *   node tools/scripts/auto-wire-tracker-router.cjs --dry   // preview
 *   node tools/scripts/auto-wire-tracker-router.cjs         // write changes
 */
const fs = require('fs');
const path = require('path');

const argv = new Set(process.argv.slice(2));
const DRY = argv.has('--dry') || argv.has('-n');

// --- small glob helper (no deps) ---
function walk(dir, exts = ['.ts', '.tsx']) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p, exts));
    else if (exts.includes(path.extname(entry.name))) out.push(p);
  }
  return out;
}

function tryRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function writeFileSafe(p, s) {
  if (DRY) {
    console.log(`--dry: would write ${p}\n`);
    return;
  }
  fs.writeFileSync(p + '.bak', fs.readFileSync(p)); // backup
  fs.writeFileSync(p, s);
  console.log(`wrote ${p} (backup: ${p}.bak)`);
}

// Find candidate root TRPC files
const repoRoot = process.cwd();
const candidates = walk(repoRoot).filter(p => /\/trpc\/.*\.(ts|tsx)$/.test(p.replace(/\\/g, '/')));
const roots = [];
const createAppRouterRe = /export\s+const\s+appRouter\s*=\s*createTRPCRouter\s*\(\s*\{\s*[\s\S]*?\}\s*\)/m;

for (const file of candidates) {
  const src = tryRead(file);
  if (!src) continue;
  if (createAppRouterRe.test(src)) roots.push(file);
}

// Prefer the shortest path if multiple (usually apps/api/src/trpc/root.ts)
roots.sort((a, b) => a.length - b.length);

if (roots.length === 0) {
  console.error('Could not find a file that exports "appRouter = createTRPCRouter({...})".');
  process.exit(1);
}

const rootFile = roots[0];
let src = fs.readFileSync(rootFile, 'utf8');
const dir = path.dirname(rootFile);

// Find tracker.router.ts somewhere in the repo (prefer sibling trpc/routers)
function findTrackerRouterPath() {
  const local = path.join(dir, 'routers', 'tracker.router.ts');
  const localTsx = path.join(dir, 'routers', 'tracker.router.tsx');
  if (fs.existsSync(local)) return local;
  if (fs.existsSync(localTsx)) return localTsx;

  // fallback: search the repo for tracker.router.ts
  const all = walk(repoRoot).filter(p => /tracker\.router\.(ts|tsx)$/.test(p));
  if (all.length) return all[0];
  return null;
}

const trackerAbs = findTrackerRouterPath();
if (!trackerAbs) {
  console.error('Could not locate tracker.router.ts in the repo. Aborting.');
  process.exit(2);
}
const trackerRel = './' + path.relative(dir, trackerAbs).replace(/\\/g, '/').replace(/\.tsx?$/, '');

const hasImport = new RegExp(`import\\s*{\\s*trackerRouter\\s*}\\s*from\\s*['"]${trackerRel}['"]`).test(src)
  || /import\s*{\s*trackerRouter\s*}\s*from\s*['"].*tracker\.router['"]/.test(src);

if (!hasImport) {
  // insert after last import
  const lastImportIdx = [...src.matchAll(/^\s*import[\s\S]*?;$/gm)].pop()?.index ?? 0;
  const insertPos = lastImportIdx >= 0 ? lastImportIdx + src.match(/^\s*import[\s\S]*?;$/gm)?.[src.match(/^\s*import[\s\S]*?;$/gm).length-1].length : 0;
  const importLine = `\nimport { trackerRouter } from '${trackerRel}';\n`;
  src = src.slice(0, insertPos) + importLine + src.slice(insertPos);
  console.log(`+ added import { trackerRouter } from '${trackerRel}'`);
} else {
  console.log('✓ trackerRouter import already present');
}

// ensure tracker: trackerRouter in createTRPCRouter({...})
const routerObjRe = /(export\s+const\s+appRouter\s*=\s*createTRPCRouter\s*\(\s*\{\s*)([\s\S]*?)(\}\s*\))/m;
const m = src.match(routerObjRe);
if (!m) {
  console.error('Could not parse appRouter createTRPCRouter block. Aborting.');
  process.exit(3);
}
const before = m[1], objBody = m[2], after = m[3];

// check if key already exists
let newObjBody = objBody;
if (!/\btracker\s*:\s*trackerRouter\b/.test(objBody)) {
  // insert before closing, with a trailing comma if needed
  const needsComma = objBody.trim().length > 0 && !objBody.trim().endsWith(',');
  const comma = needsComma ? ',' : '';
  newObjBody = objBody + `${comma}\n  tracker: trackerRouter,`;
  console.log('+ added tracker: trackerRouter to appRouter');
} else {
  console.log('✓ tracker: trackerRouter already present');
}

src = src.replace(routerObjRe, `${before}${newObjBody}${after}`);

// ensure export type AppRouter
if (!/export\s+type\s+AppRouter\s*=\s*typeof\s+appRouter\s*;/.test(src)) {
  src = src + `\n\nexport type AppRouter = typeof appRouter;\n`;
  console.log('+ added "export type AppRouter = typeof appRouter;"');
} else {
  console.log('✓ AppRouter type export already present');
}

if (DRY) {
  console.log('\n--dry run complete. No files were changed.');
  console.log(`Target file: ${path.relative(repoRoot, rootFile)}`);
} else {
  writeFileSafe(rootFile, src);
}
