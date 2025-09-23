#!/usr/bin/env node
/**
 * Enforce "no stub code" rule on changed source files.
 *
 * Usage:
 *   STUB_BASE=origin/main node tools/scripts/enforce-no-stubs.cjs
 *   STUB_BASE=origin/main STUB_OUTPUT=json node tools/scripts/enforce-no-stubs.cjs > stub-lint.json
 *
 * Flags:
 *   --json            -> JSON output (same as STUB_OUTPUT=json)
 *   --all             -> ignore git diff; scan all tracked files (filtered)
 *   --base=<ref>      -> override base ref (same as STUB_BASE)
 *
 * Environment:
 *   STUB_BASE         -> base ref to diff against (default: origin/main)
 *   STUB_OUTPUT       -> 'json' | 'text' (default: text)
 *   STUB_INCLUDE      -> extra substrings (comma-separated) a path MUST include to be scanned
 *   STUB_IGNORE       -> extra substrings (comma-separated) a path MUST NOT include
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
const arg = (name) => {
  const p = argv.find((a) => a === name || a.startsWith(name + '='));
  if (!p) return null;
  if (p.includes('=')) return p.split('=').slice(1).join('=');
  return true;
};

const OUTPUT =
  arg('--json') || (process.env.STUB_OUTPUT || '').toLowerCase() === 'json'
    ? 'json'
    : 'text';
let BASE = arg('--base') || process.env.STUB_BASE || 'origin/main';
const SCAN_ALL = Boolean(arg('--all')) || process.env.STUB_ALL === 'true';

const EXTRA_INCLUDE = (process.env.STUB_INCLUDE || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const EXTRA_IGNORE = (process.env.STUB_IGNORE || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Normalize to forward slashes
const norm = (p) => p.replace(/\\/g, '/');

// Source-only filter:
//   - extensions: .ts/.tsx/.js/.jsx
//   - must live somewhere under /src/ or /app/
//   - ignore common junk, reports, backups, archived copies
const SRC_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const DEFAULT_IGNORE_SUBSTR = [
  'node_modules/',
  '.next/',
  '.nx/',
  'dist/',
  'build/',
  'coverage/',
  'scans/',
  'tools/reports/',
  '/reports/',
  '/report/',
  '/__generated__/',
  '/generated/',
  '/__mocks__/',
  '/.app_backup_',
  '.bak.',
  '.backup.',
  '.tmp',
  '.log',
  '.csv',
  '.md',
  '.json', // we’re linting source files; JSON reports contain “STUB”
  // archived/old apps
  'apps/web._archived_',
  'web._archived_',
];

function isSourceFile(fp) {
  const n = norm(fp);
  const ext = path.extname(n).toLowerCase();
  if (!SRC_EXTS.has(ext)) return false;

  // Must be in a code area
  const inCodeArea = n.includes('/src/') || n.includes('/app/');
  if (!inCodeArea) return false;

  // Default ignores
  for (const bad of DEFAULT_IGNORE_SUBSTR) {
    if (n.includes(bad)) return false;
  }
  // User ignores
  for (const bad of EXTRA_IGNORE) {
    if (bad && n.includes(bad)) return false;
  }
  // If user specified required substrings, enforce them
  if (EXTRA_INCLUDE.length > 0) {
    let ok = false;
    for (const must of EXTRA_INCLUDE) {
      if (must && n.includes(must)) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }

  return true;
}

// Try to resolve the base ref; if it doesn’t exist, fall back sensibly
function resolveBase(ref) {
  try {
    execSync(`git rev-parse --verify --quiet ${ref}`, { stdio: 'ignore' });
    return ref;
  } catch {
    // common fallbacks
    const tries = [
      'origin/main',
      'main',
      'origin/master',
      'master',
      'HEAD~100',
    ];
    for (const t of tries) {
      try {
        execSync(`git rev-parse --verify --quiet ${t}`, { stdio: 'ignore' });
        return t;
      } catch {}
    }
    return 'HEAD';
  }
}

BASE = resolveBase(BASE);

function getFiles() {
  try {
    if (SCAN_ALL) {
      const out = execSync('git ls-files', { encoding: 'utf8' });
      return out.split(/\r?\n/).filter(Boolean);
    }
    const out = execSync(`git diff --name-only ${BASE}...HEAD`, {
      encoding: 'utf8',
    });
    const files = out.split(/\r?\n/).filter(Boolean);
    if (files.length === 0) {
      // Nothing changed; still allow running on staged files (pre-commit) or all tracked as fallback
      const staged = execSync('git diff --cached --name-only', {
        encoding: 'utf8',
      })
        .split(/\r?\n/)
        .filter(Boolean);
      if (staged.length > 0) return staged;
      const all = execSync('git ls-files', { encoding: 'utf8' })
        .split(/\r?\n/)
        .filter(Boolean);
      return all;
    }
    return files;
  } catch (e) {
    const all = execSync('git ls-files', { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean);
    return all;
  }
}

// Patterns to flag as “stub-like”
const RULES = [
  { id: 'MARKER', rx: /STUB:PHASE\d+/i, weight: 10 },
  { id: 'ANY', rx: /\bSTUB\b/i, weight: 5 },
  { id: 'TODO', rx: /TODO:.*\bstub\b/i, weight: 3 },
  { id: 'PLACEHOLDER', rx: /\bplaceholder test\b/i, weight: 2 },
  { id: 'TRPC_LOCAL', rx: /Local-only TRPC stub/i, weight: 2 },
];

function scanFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, i) => {
    RULES.forEach((rule) => {
      const m = line.match(rule.rx);
      if (m) {
        const col = (m.index || 0) + 1;
        hits.push({
          rule: rule.id,
          line: i + 1,
          column: col,
          snippet: line.trim().slice(0, 200),
          weight: rule.weight,
        });
      }
    });
  });
  if (hits.length === 0) return null;
  return {
    file,
    hits,
    count: hits.length,
    score: hits.reduce((a, b) => a + (b.weight || 1), 0),
  };
}

function main() {
  const changed = getFiles();
  const scanList = changed.filter(isSourceFile);

  if (OUTPUT === 'text') {
    console.log(`• Scanning changed files since ${BASE}…`);
    console.log(`• Files scanned: ${scanList.length}`);
  }

  const findings = [];
  for (const f of scanList) {
    const res = scanFile(f);
    if (res) findings.push(res);
  }

  // Flatten for summary
  const flat = [];
  for (const f of findings) {
    for (const h of f.hits) {
      flat.push({ file: f.file, ...h });
    }
  }

  // Sort by score/weight, then file/line
  flat.sort((a, b) => {
    if ((b.weight || 0) !== (a.weight || 0))
      return (b.weight || 0) - (a.weight || 0);
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });

  if (OUTPUT === 'json') {
    const out = {
      base: BASE,
      scannedFiles: scanList.length,
      findings: flat,
      totals: {
        filesWithFindings: findings.length,
        occurrences: flat.length,
      },
      ignores: {
        default: DEFAULT_IGNORE_SUBSTR,
        extra: EXTRA_IGNORE,
      },
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(flat.length > 0 ? 1 : 0);
  }

  if (flat.length === 0) {
    console.log(
      '\n✓ No stub-like occurrences found in changed source files.\n'
    );
    process.exit(0);
  }

  console.log(`\n✗ Found ${flat.length} stub-like occurrences:\n`);
  const MAX = 200; // don’t spam the console
  flat.slice(0, MAX).forEach((hit) => {
    const loc = `${hit.file}:${hit.line}:${hit.column}`;
    console.log(`- ${loc} • ${hit.snippet}`);
  });
  if (flat.length > MAX) {
    console.log(`…and ${flat.length - MAX} more`);
  }
  process.exit(1);
}

main();
