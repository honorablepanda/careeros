#!/usr/bin/env node
/* Scan web/ for common issues: bad a11y label wiring, new Date(unknown),
   explicit any, brittle test assertions, legacy trpc imports, etc.
   Prints file:line and a small snippet for each finding. No changes are made. */

'use strict';

const fs = require('fs');
const path = require('path');

const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.git']);
const EXTS = new Set(['.tsx', '.ts', '.jsx', '.js']);
const DEFAULT_ROOTS = ['web/src', 'web/app'];

// fields that often trigger "new Date(unknown)" errors
const DATE_FIELDS = ['dueDate','scheduledAt','lastContacted','awardedAt','appliedAt','createdAt','updatedAt'];

// CLI roots
const roots = process.argv.slice(2).filter(Boolean);
if (roots.length === 0) roots.push(...DEFAULT_ROOTS);

// helpers
function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (EXTS.has(path.extname(ent.name))) acc.push(p);
  }
  return acc;
}

function buildLineIndex(s) {
  const idx = [0];
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) idx.push(i + 1); // '\n'
  return idx;
}
function offsetToLineCol(idxArr, off) {
  // binary search for last line start <= off
  let lo = 0, hi = idxArr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (idxArr[mid] <= off) lo = mid + 1; else hi = mid - 1;
  }
  const lineStart = idxArr[Math.max(0, hi)];
  return { line: Math.max(1, hi + 1), col: (off - lineStart) + 1 };
}
function lineExcerpt(lines, line) {
  const L = Math.min(lines.length, Math.max(1, line));
  return lines[L - 1].trim();
}
function printFinding(kind, file, s, idxArr, matchIdx, msg) {
  const { line, col } = offsetToLineCol(idxArr, matchIdx);
  const excerpt = lineExcerpt(s.split(/\r?\n/), line);
  console.log(`[${kind}] ${file}:${line}:${col}  ${msg}\n  → ${excerpt}\n`);
}

const findings = {
  TS_ANY: 0,
  TS_GENERIC_ANY: 0,
  TS_AS_ANY: 0,
  DATE_UNKNOWN: 0,
  LABEL_MISSING_FOR: 0,
  CONTROL_MISSING_ID: 0,
  TRPC_LEGACY_IMPORT: 0,
  TEST_BRITTLE_TEXT: 0,
  TEST_BROKEN_EXPECT: 0,
};

function scanFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const idxArr = buildLineIndex(src);

  // 1) explicit any
  for (const m of src.matchAll(/:\s*any\b/g)) {
    findings.TS_ANY++; printFinding('TS_ANY', file, src, idxArr, m.index, 'Explicit ": any" type');
  }
  for (const m of src.matchAll(/<\s*any\s*>/g)) {
    findings.TS_GENERIC_ANY++; printFinding('TS_GENERIC_ANY', file, src, idxArr, m.index, 'Generic "<any>"');
  }
  for (const m of src.matchAll(/\bas\s+any\b/g)) {
    findings.TS_AS_ANY++; printFinding('TS_AS_ANY', file, src, idxArr, m.index, 'Cast "as any"');
  }

  // 2) new Date(<something>.<dateField> ...)
  const dateRe = new RegExp(
    String.raw`new\s+Date\s*\(\s*[^)]*?\.\s*(?:${DATE_FIELDS.join('|')})\b[^)]*\)`,
    'g'
  );
  for (const m of src.matchAll(dateRe)) {
    findings.DATE_UNKNOWN++;
    printFinding('DATE_UNKNOWN', file, src, idxArr, m.index, 'new Date(field) on possibly unknown field (consider safe cast or proper typing)');
  }

  // 3) legacy trpc import path
  for (const m of src.matchAll(/from\s+['"]@\/trpc\/react['"]/g)) {
    findings.TRPC_LEGACY_IMPORT++;
    printFinding('TRPC_LEGACY_IMPORT', file, src, idxArr, m.index, 'Importing "@/trpc/react" (prefer "@/trpc")');
  }

  // 4) label ↔ control wiring (accessible names)
  //    - label without htmlFor/for
  //    - and the nearby input/select missing id
  // Heuristic: check each <label>...</label>, warn if missing htmlFor/for.
  // Also peek forward ~400 chars for a select/input and whether it has id=
  for (const m of src.matchAll(/<label([^>]*)>([\s\S]*?)<\/label>/g)) {
    const labelAttrs = m[1] || '';
    const hasFor = /\b(htmlFor|for)\s*=/.test(labelAttrs);
    // crude innerText (strip tags)
    const inner = m[2].replace(/<[^>]*>/g, '').trim();
    if (!inner) continue;

    if (!hasFor) {
      findings.LABEL_MISSING_FOR++;
      printFinding('LABEL_MISSING_FOR', file, src, idxArr, m.index, `Label "${inner}" missing htmlFor/for`);
    }

    // peek ahead up to ~400 chars for first select/input after the label
    const lookAhead = src.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 400);
    const control = lookAhead.match(/<(select|input)([^>]*)>/i);
    if (control) {
      const controlAttrs = control[2] || '';
      const hasId = /\bid\s*=/.test(controlAttrs);
      if (!hasId) {
        findings.CONTROL_MISSING_ID++;
        printFinding('CONTROL_MISSING_ID', file, src, idxArr, (m.index ?? 0) + m[0].length + control.index, `First <${control[1].toLowerCase()}> after label "${inner}" missing id`);
      }
    }
  }

  // 5) brittle test assertions (only in tests)
  const isSpec = /\.spec\.(t|j)sx?$/.test(file);
  if (isSpec) {
    for (const m of src.matchAll(/getByText\(\s*['"](On|Off|dark|light)['"]\s*\)/g)) {
      findings.TEST_BRITTLE_TEXT++;
      printFinding('TEST_BRITTLE_TEXT', file, src, idxArr, m.index, `Brittle text assertion "${m[0]}" (prefer role/label/value-based checks)`);
    }
    for (const m of src.matchAll(/expect\(\(screen\.expect/g)) {
      findings.TEST_BROKEN_EXPECT++;
      printFinding('TEST_BROKEN_EXPECT', file, src, idxArr, m.index, `Suspicious "expect((screen.expect..." chain (likely a bad refactor)`);
    }
  }
}

const files = roots.flatMap(r => walk(r));
if (files.length === 0) {
  console.log(`No files found in: ${roots.join(', ')}`);
  process.exit(0);
}

console.log(`Scanning ${files.length} files...\n`);
for (const f of files) {
  try { scanFile(f); } catch (e) {
    console.error(`[ERROR] ${f}: ${e.message}`);
  }
}

const total =
  findings.TS_ANY +
  findings.TS_GENERIC_ANY +
  findings.TS_AS_ANY +
  findings.DATE_UNKNOWN +
  findings.LABEL_MISSING_FOR +
  findings.CONTROL_MISSING_ID +
  findings.TRPC_LEGACY_IMPORT +
  findings.TEST_BRITTLE_TEXT +
  findings.TEST_BROKEN_EXPECT;

console.log('─'.repeat(72));
console.log('Summary:');
for (const [k, v] of Object.entries(findings)) {
  console.log(`${k.padEnd(22)} ${String(v).padStart(4)}`);
}
console.log('─'.repeat(72));
console.log(total ? 'Findings detected. Address the logs above.' : 'No issues detected by this scanner.');
