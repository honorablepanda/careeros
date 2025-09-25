#!/usr/bin/env node
/* v3 – wires trackerRouter even when appRouter is aliased or re-exported */
const fs = require('fs');
const path = require('path');

const flags = new Set(process.argv.slice(2));
const DO_FIX = flags.has('--fix');
const DRY = flags.has('--dry');
const FIX_ALL = flags.has('--all');
const DEBUG = flags.has('--debug');
const ROOT = process.cwd();

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

function log(...a) {
  if (DEBUG) console.log('[debug]', ...a);
}
function read(p) {
  return fs.readFileSync(p, 'utf8');
}
function writeWithBackup(p, s) {
  if (DRY) return console.log(`--dry: would write ${rel(p)}`);
  fs.writeFileSync(p + '.bak', fs.readFileSync(p));
  fs.writeFileSync(p, s);
  console.log(`wrote ${rel(p)} (backup: ${rel(p + '.bak')})`);
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      [
        'node_modules',
        '.git',
        '.next',
        'dist',
        'build',
        'coverage',
        'out',
      ].includes(ent.name)
    )
      continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(t|j)sx?$/.test(ent.name)) out.push(p);
  }
  return out;
}

function toImport(fromDir, toFile) {
  return (
    './' +
    path
      .relative(fromDir, toFile)
      .replace(/\\/g, '/')
      .replace(/\.(t|j)sx?$/, '')
  );
}

const files = walk(ROOT);

// find tracker.router.*
const trackerFile = files.find((p) =>
  /[/\\]tracker\.router\.(t|j)sx?$/i.test(p)
);
if (!trackerFile) {
  console.error('No tracker.router.* file found. Aborting.');
  process.exit(1);
}

// identify “AppRouter = typeof <var>”
const APP_TYPE_RE =
  /export\s+type\s+AppRouter\s*=\s*typeof\s+([A-Za-z0-9_]+)\s*;/m;

const candidates = files
  .map((f) => ({ file: f, src: read(f) }))
  .filter(
    ({ src, file }) =>
      APP_TYPE_RE.test(src) ||
      /(createTRPCRouter|t\.router|mergeRouters|t\.mergeRouters)\s*\(/.test(src)
  )
  .map(({ file, src }) => {
    const m = src.match(APP_TYPE_RE);
    const varName = m ? m[1] : null;
    let score = 0;
    if (/[/]trpc[/]/i.test(file)) score += 30;
    if (/[/](root|router)\.(t|j)sx?$/i.test(file)) score += 20;
    if (varName) score += 30;
    if (/export\s+(const|let|var)\s+appRouter\s*=/.test(src)) score += 20;
    return { file, src, varName, score };
  })
  .sort((a, b) => b.score - a.score);

function ensureImport(src, importName, importPath) {
  const already =
    new RegExp(
      `import\\s*{[^}]*\\b${importName}\\b[^}]*}\\s*from\\s*['"][^'"]*tracker\\.router`,
      'm'
    ).test(src) ||
    new RegExp(
      `import\\s*{[^}]*\\b${importName}\\b[^}]*}\\s*from\\s*['"]${importPath.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      )}['"]`,
      'm'
    ).test(src);
  if (already) return { src, added: false };
  const allImports = [...src.matchAll(/^\s*import[\s\S]*?;$/gm)];
  const insertAt = allImports.length
    ? allImports[allImports.length - 1].index +
      allImports[allImports.length - 1][0].length
    : 0;
  const line = `\nimport { trackerRouter } from '${importPath}';\n`;
  return {
    src: src.slice(0, insertAt) + line + src.slice(insertAt),
    added: true,
  };
}

const EXPORT_ASSIGN_RE =
  /export\s+(?:const|let|var)\s+appRouter\s*=\s*([\s\S]*?);/m;
const REEXPORT_RE =
  /export\s*{\s*appRouter\s*(?:as\s+[A-Za-z0-9_]+)?\s*}\s*from\s*['"]([^'"]+)['"];?/m;

function findExportAssignment(filePath, seen = new Set()) {
  if (seen.has(filePath)) return null;
  seen.add(filePath);
  const src = read(filePath);

  const m = src.match(EXPORT_ASSIGN_RE);
  if (m) {
    return { filePath, src, rhs: m[1], full: m[0], index: m.index };
  }

  // follow re-export: export { appRouter } from './something'
  const r = src.match(REEXPORT_RE);
  if (r) {
    const target = r[1];
    const abs = path.resolve(
      path.dirname(filePath),
      target.replace(/\.(t|j)sx?$/, '')
    );
    const withExt = ['.ts', '.tsx', '.js', '.jsx']
      .map((ext) => abs + ext)
      .find((p) => fs.existsSync(p));
    if (withExt) return findExportAssignment(withExt, seen);
  }
  return null;
}

function alreadyHasTracker(rhsOrSrc) {
  return (
    /tracker\s*:\s*trackerRouter/.test(rhsOrSrc) ||
    /\.merge\s*\(\s*['"]tracker\.\s*['"]\s*,\s*trackerRouter\s*\)/.test(
      rhsOrSrc
    ) ||
    (/\btrackerRouter\b/.test(rhsOrSrc) && /\.merge\s*\(/.test(rhsOrSrc))
  );
}

function patchAssignmentBlock(src, assign) {
  if (alreadyHasTracker(assign.full))
    return { src, changed: false, method: 'already-wired' };
  const before = src.slice(0, assign.index);
  const after = src.slice(assign.index + assign.full.length);

  // safest universal patch: wrap RHS in parentheses and append merge
  const rhsNoSemi = assign.rhs.replace(/;\s*$/, '').trim();
  const newAssign = `export const appRouter = (${rhsNoSemi}).merge('tracker.', trackerRouter);`;
  const newSrc = before + newAssign + after;
  return { src: newSrc, changed: true, method: 'append-merge' };
}

function processOne(absPath) {
  let src = read(absPath);
  const dir = path.dirname(absPath);
  const importPath = toImport(dir, trackerFile);

  const assign = findExportAssignment(absPath);
  if (!assign)
    return {
      error:
        'Could not locate `export const appRouter = ...;` (directly or via re-export).',
    };

  // ensure import first (against the file where assignment lives)
  let imp = ensureImport(assign.src, 'trackerRouter', importPath);
  let patchedSrc = imp.src;

  // re-scan assignment in the (possibly) modified source
  const reAssign = (() => {
    const m = patchedSrc.match(EXPORT_ASSIGN_RE);
    if (!m) return null;
    return { rhs: m[1], full: m[0], index: m.index };
  })();
  if (!reAssign)
    return {
      error: 'Lost appRouter assignment after import insertion (parser issue).',
    };

  // apply patch
  const patched = patchAssignmentBlock(patchedSrc, reAssign);
  patchedSrc = patched.src;

  // write back to the file that actually had the assignment
  if (imp.added || patched.changed) {
    writeWithBackup(absPath, patchedSrc);
  }
  return {
    importAdded: imp.added,
    changed: patched.changed,
    method: patched.method,
  };
}

// -------- run
if (candidates.length === 0) {
  console.log(
    'No tRPC roots found.\nTip: look for `export type AppRouter = typeof appRouter` or `createTRPCRouter(...)`.'
  );
  process.exit(0);
}

console.log('tRPC root candidates (highest confidence first):\n');
for (const c of candidates.slice(0, 10)) {
  console.log(
    `→ ${rel(c.file)}  ${c.varName ? `(AppRouter → ${c.varName})` : ''}`
  );
  console.log(`   score=${c.score}  hasType=${!!c.varName}`);
  console.log(`   tracker.router.ts → ${rel(trackerFile)}`);
}

if (!DO_FIX) {
  console.log('\nDone (check only). Use --fix to apply changes.');
  process.exit(0);
}

const targets = FIX_ALL ? candidates : [candidates[0]];
console.log(
  FIX_ALL
    ? `\nApplying fixes to ${targets.length} candidate(s)...`
    : '\nApplying fixes to the top candidate...'
);
if (DRY) console.log('(dry run: no files will be written)');

for (const t of targets) {
  // we want to patch the file that owns the export assignment; follow re-exports from here
  const owner = findExportAssignment(t.file);
  if (!owner) {
    console.log(
      `${rel(
        t.file
      )}  ERROR: Could not locate \`export const appRouter = ...\` (directly or via re-export).`
    );
    continue;
  }
  const res = processOne(owner.filePath);
  if (res.error) console.log(`${rel(owner.filePath)}  ERROR: ${res.error}`);
  else
    console.log(
      `${rel(owner.filePath)}  changes:${res.importAdded ? ' +import' : ''}${
        res.changed ? ' +wire' : ''
      } [method=${res.method}]`
    );
}

console.log('\nAll done.');
