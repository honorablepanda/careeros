/**
 * cleanup-summary-duplicates.cjs
 * - Ensures there's exactly ONE "source counts" block in apps/api/src/router/summary.ts
 * - Keeps the safe status-based aggregation block
 */
const fs = require('fs');
const path = require('path');

const repo = process.cwd();
const file = path.join(repo, 'apps/api/src/router/summary.ts');

if (!fs.existsSync(file)) {
  console.log('• apps/api/src/router/summary.ts not found, skipping');
  process.exit(0);
}

let src = fs.readFileSync(file, 'utf8');

// Canonical safe block (status-based)
const SAFE_BLOCK = `// 2) "Source" counts (fallback via status, since \`source\` is not in the model).
const appsForSources = await prisma.application.findMany({
  where: { userId },
  select: { status: true },
});

const sourceCountMap = appsForSources.reduce<Record<string, number>>(
  (acc, { status }) => {
    const key = status ?? 'UNKNOWN';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  },
  {}
);

// Keep the same shape your UI expects: [{ source, _count: { _all } }]
const sourceGrp = Object.entries(sourceCountMap).map(([source, count]) => ({
  source,
  _count: { _all: count },
}));`;

// 1) Remove any OLD "2) Source counts" section (pre-safe), if present.
src = src.replace(
  // From a "// 2) Source counts" style comment up to the end of the block that defines sourceGrp
  /\/\/\s*2\)\s*Source\s*counts[\s\S]*?const\s+sourceGrp\s*=\s*Object\.entries\([\s\S]*?\)\s*;\s*/gm,
  ''
);

// 2) Find ALL safe blocks (in case we inserted twice) and collapse to ONE.
const safeBlockRegex =
  /\/\/\s*2\)\s*"Source"\s*counts[\s\S]*?const\s+sourceGrp\s*=\s*Object\.entries\([\s\S]*?\)\s*;\s*/gm;

const matches = [...src.matchAll(safeBlockRegex)].map((m) => ({
  start: m.index,
  end: m.index + m[0].length,
}));

if (matches.length > 1) {
  // Keep the LAST safe block; remove all prior occurrences.
  for (let i = matches.length - 2; i >= 0; i--) {
    const { start, end } = matches[i];
    src = src.slice(0, start) + src.slice(end);
  }
  console.log(`• Removed ${matches.length - 1} duplicate safe block(s)`);
}

// 3) Ensure at least one safe block exists. If none, insert one after the first "where: { userId }"
if (src.search(safeBlockRegex) === -1) {
  const anchor = src.indexOf('where: { userId }');
  if (anchor !== -1) {
    // Insert after the line containing the anchor
    const lineEnd = src.indexOf('\n', anchor);
    const insertAt = lineEnd === -1 ? src.length : lineEnd + 1;
    src =
      src.slice(0, insertAt) + '\n' + SAFE_BLOCK + '\n' + src.slice(insertAt);
    console.log('• Inserted safe block after "where: { userId }"');
  } else {
    // Fallback: append at end (still valid inside the procedure if top-level used)
    src = src.trimEnd() + '\n\n' + SAFE_BLOCK + '\n';
    console.log('• Inserted safe block at end of file (fallback)');
  }
}

// 4) Small hardening: if the file still declares the variables twice (edge cases),
// remove any *earlier* standalone declarations of appsForSources/sourceCountMap.
function removeEarlierDecl(name) {
  const decl = new RegExp(`const\\s+${name}\\b[\\s\\S]*?;\\s*`, 'gm');
  const occurrences = [...src.matchAll(decl)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  if (occurrences.length > 1) {
    // keep the last, remove previous
    for (let i = occurrences.length - 2; i >= 0; i--) {
      const { start, end } = occurrences[i];
      src = src.slice(0, start) + src.slice(end);
    }
    console.log(
      `• Deduped variable "${name}" (${
        occurrences.length - 1
      } earlier declaration(s) removed)`
    );
  }
}
removeEarlierDecl('appsForSources');
removeEarlierDecl('sourceCountMap');

fs.writeFileSync(file, src, 'utf8');
console.log('✓ Cleaned up apps/api/src/router/summary.ts');
