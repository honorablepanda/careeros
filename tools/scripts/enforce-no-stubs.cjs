#!/usr/bin/env node
/**
 * Enforce-No-Stubs
 * - Scans changed files (relative to a git base) for "stub" markers.
 * - Exits 1 if any matches are found. Prints JSON with --json.
 *
 * Env / CLI:
 *   STUB_BASE=origin/main   or  --base origin/main
 *   STUB_PATTERNS="regex1,regex2"  (optional, JS-style, no slashes)
 *   STUB_IGNORE="path/one/**,docs/**" (optional, simple substring match)
 *   --all    scan all tracked files (not just changed)
 *   --json   output JSON only
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}
function trySh(cmd) {
  try { return sh(cmd); } catch { return null; }
}
function fileExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}
function parseArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

// --- config ---------------------------------------------------------------
const baseFromEnv = process.env.STUB_BASE || parseArg('--base') || 'origin/main';
const scanAll = hasFlag('--all');
const jsonOnly = hasFlag('--json');

// Allow overriding patterns via env (comma separated, JS regex bodies, no slashes)
const envPatterns = (process.env.STUB_PATTERNS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(p => {
    try { return new RegExp(p, 'i'); } catch { return null; }
  })
  .filter(Boolean);

// Defaults catch the usual suspects but avoid over-flagging normal TODOs
const defaultPatterns = [
  /\bSTUB\b/i,
  /\/\/\s*STUB\b/i,
  /\/\*\s*STUB[\s\S]*?\*\//i,
  /\bNot\s+implemented\b/i,
  /throw\s+new\s+Error\s*\(\s*['"`](?:Not\s+implemented|TODO|stub)['"`]\s*\)/i,
  /\bTODO\b.*\b(implement|wire|later|stub)\b/i
];

const patterns = envPatterns.length ? envPatterns : defaultPatterns;

// Very simple ignore: comma-separated substrings. (You can use globs in your CI if needed)
const ignoreParts = (process.env.STUB_IGNORE || 'node_modules,.next,.nx,dist,build,coverage,packages-lock.json,pnpm-lock.yaml,yarn.lock')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Extensions to scan
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.cjs', '.mjs']);

// --- git file set ---------------------------------------------------------
function resolveBase() {
  // verify base; fallback to main; otherwise null (scan all)
  if (trySh(`git rev-parse --verify ${baseFromEnv}`)) return baseFromEnv;
  if (trySh(`git rev-parse --verify main`)) return 'main';
  if (trySh(`git rev-parse --verify master`)) return 'master';
  return null;
}

function changedFiles(base) {
  if (!base || scanAll) return allTrackedFiles();
  const diff = trySh(`git diff --name-only ${base}...HEAD`) || '';
  const files = diff.split(/\r?\n/).filter(Boolean);
  return files.length ? files : allTrackedFiles();
}

function allTrackedFiles() {
  const out = trySh('git ls-files') || '';
  return out.split(/\r?\n/).filter(Boolean);
}

function shouldIgnore(file) {
  const f = file.replace(/\\/g, '/');
  if (!exts.has(path.extname(f))) return true;
  return ignoreParts.some(part => part && f.includes(part));
}

// --- scan ---------------------------------------------------------------
function scanFile(file) {
  const issues = [];
  let text;
  try {
    const stat = fs.statSync(file);
    if (stat.isDirectory()) return issues;
    if (stat.size > 2_000_000) return issues; // skip huge files
    text = fs.readFileSync(file, 'utf8');
  } catch { return issues; }

  const lines = text.split(/\r?\n/);
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    for (const rx of patterns) {
      const m = rx.exec(line);
      if (m) {
        issues.push({
          file: file.replace(/\\/g, '/'),
          line: ln + 1,
          column: (m.index || 0) + 1,
          match: line.trim().slice(0, 200),
          pattern: rx.toString()
        });
      }
    }
  }
  return issues;
}

function main() {
  // sanity: ensure git repo
  if (!fileExists(path.join(process.cwd(), '.git'))) {
    console.error('Not a git repository (no .git found).');
    process.exit(2);
  }

  const baseRef = resolveBase();
  const files = changedFiles(baseRef).filter(f => !shouldIgnore(f));

  const allIssues = [];
  for (const f of files) {
    const found = scanFile(f);
    if (found.length) allIssues.push(...found);
  }

  const report = {
    baseRef,
    scanAll,
    patterns: patterns.map(p => p.toString()),
    filesScanned: files.length,
    issues: allIssues
  };

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (!baseRef) {
      console.log(`• Scanning files (no base detected; using all tracked files)…`);
    } else if (scanAll) {
      console.log(`• Scanning all tracked files (base=${baseRef})…`);
    } else {
      console.log(`• Scanning changed files since ${baseRef}…`);
    }
    console.log(`• Files scanned: ${files.length}`);
    if (allIssues.length) {
      console.log(`\n✗ Found ${allIssues.length} stub-like occurrences:\n`);
      for (const i of allIssues.slice(0, 200)) {
        console.log(`- ${i.file}:${i.line}:${i.column} • ${i.match}`);
      }
      if (allIssues.length > 200) {
        console.log(`…and ${allIssues.length - 200} more`);
      }
    } else {
      console.log('✓ No stub markers found.');
    }
  }

  process.exit(allIssues.length ? 1 : 0);
}

main();
