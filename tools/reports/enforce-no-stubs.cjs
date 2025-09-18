#!/usr/bin/env node
/**
 * Fails if we find stub markers in *production* code.
 * Ignores tests, storybook, generated code, and node_modules.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const INCLUDE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORE_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', '.turbo', '.nx',
  '.git', 'coverage', '.cache', '.storybook', '.idea',
  // test-ish dirs
  '__tests__', '__mocks__', '__fixtures__', 'specs', 'e2e',
]);
const IGNORE_FILE_PATTERNS = [
  /\.spec\.(t|j)sx?$/i,
  /\.test\.(t|j)sx?$/i,
  /setup-tests\.(t|j)s$/i,
];

const MARKERS = [
  { type: 'TODO', re: /\bTODO\b/i },
  { type: 'FIXME', re: /\bFIXME\b/i },
  { type: 'HACK', re: /\bHACK\b/i },
  { type: 'STUB', re: /\bSTUB\b/i },
  { type: 'PLACEHOLDER', re: /\bPLACEHOLDER\b/i },
  { type: 'NOT_IMPLEMENTED', re: /throw\s+new\s+Error\(['"`]\s*(not\s+implemented|unimplemented)\s*['"`]\)/i },
  { type: 'TS_BANDAID', re: /@ts-(ignore|expect-error)/ },
  // if you *do* want to block casts in prod code, keep CAST_ANY enabled:
  { type: 'CAST_ANY', re: /\bas\s+any\b/ },
  { type: 'DOUBLE_CAST', re: /as\s+unknown\s+as\b/ },
];

function shouldIgnoreFile(rel) {
  if (!INCLUDE_EXT.has(path.extname(rel))) return true;
  if (IGNORE_FILE_PATTERNS.some(rx => rx.test(rel))) return true;
  const parts = rel.split(/[\\/]+/);
  return parts.some(p => IGNORE_DIRS.has(p));
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) yield* walk(p);
      continue;
    }
    const rel = path.relative(ROOT, p);
    if (shouldIgnoreFile(rel)) continue;
    yield rel;
  }
}

const findings = [];
for (const rel of walk(ROOT)) {
  let src = '';
  try { src = fs.readFileSync(rel, 'utf8'); } catch { continue; }
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of MARKERS) {
      if (m.re.test(line)) {
        findings.push({ file: rel, line: i + 1, type: m.type, text: line.trim().slice(0, 200) });
      }
    }
  });
}

if (findings.length) {
  console.error('❌ Stub markers found in production code:');
  for (const f of findings.slice(0, 200)) {
    console.error(`- ${f.file}:${f.line} — ${f.type} — ${f.text}`);
  }
  if (findings.length > 200) console.error(`…and ${findings.length - 200} more`);
  process.exit(1);
}

console.log('✅ No stub markers in production code.');
