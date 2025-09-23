#!/usr/bin/env node
/**
 * find-stubs.cjs
 * Scan the repo for stubs/placeholders and emit JSON (+ CSV/Markdown).
 *
 * Heuristics scanned per file:
 *  - MARKER:       TODO|FIXME|HACK|STUB|PLACEHOLDER|WIP|TEMP
 *  - NOT_IMPLEMENTED: throw new Error('not implemented'|unimplemented)
 *  - TS_BANDAID:   @ts-ignore | @ts-expect-error
 *  - CAST_ANY:     `as any`
 *  - DOUBLE_CAST:  `as unknown as`
 *  - SPEC_STUB:    .spec/.test files with ≤1 `expect`, or filename matches
 *                  sanity|health|placeholder|stub|smoke
 *
 * Outputs (default to tools/reports/ with a timestamped prefix):
 *  - JSON (always): stub-scan-<stamp>.json
 *  - CSV  (opt-in): --csv
 *  - MD   (opt-in): --md
 *
 * Flags:
 *  --out-prefix PATH     Base path for outputs (no extension)
 *  --csv                 Also write CSV
 *  --md                  Also write Markdown
 *  --suggest-deletes     Print chunked `git rm` suggestions for obvious stub specs
 *  --only TYPES          Comma list of types to include (e.g. MARKER,TS_BANDAID)
 *  --ignore PATTERNS     Comma patterns to ignore (minimatch-like * and **)
 *  --since REF           Only scan files changed since a git ref (e.g. origin/main)
 *  --fail-on-find        Exit 2 if any findings found (use in CI)
 *  --threshold N         Exit 2 if findings > N
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, 'tools', 'reports');
fs.mkdirSync(REPORT_DIR, { recursive: true });

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const val = (key, def = null) => {
  const a = args.find((a) => a.startsWith(`${key}=`));
  return a ? a.split('=').slice(1).join('=').trim() : def;
};

const OUT_PREFIX =
  val('--out-prefix') ||
  path.join(
    REPORT_DIR,
    `stub-scan-${new Date().toISOString().replace(/[:.]/g, '-')}`
  );

const WANT_CSV = has('--csv');
const WANT_MD = has('--md');
const SUGGEST_DELETES = has('--suggest-deletes');
const ONLY = (val('--only', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .reduce((a, t) => ((a[t] = true), a), {});
const EXTRA_IGNORES = (val('--ignore', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SINCE = val('--since', null);
const FAIL_ON_FIND = has('--fail-on-find');
const THRESHOLD = parseInt(val('--threshold', 'NaN'), 10);
const LIMIT = Number.isFinite(THRESHOLD) ? THRESHOLD : null;

// Default ignore dirs & files (Windows-safe)
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.nx',
  '.next',
  '.turbo',
  '.cache',
  'dist',
  'build',
  'coverage',
  // archived/backups we created earlier
  'apps/web._archived_2025-09-15T18-56-10-787Z',
  '.app_backup', // fallthrough
]);
const IGNORE_BASENAMES = new Set([
  // output folders
  'reports',
  'scans',
]);

// File extensions we care about
const EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yml',
  '.yaml',
  '.md',
  '.sql',
]);

// Patterns (minimatch-lite: only * and ** supported)
const mm = (pat) => {
  // very small glob: ** -> [\\s\\S]*, * -> [^/]*, escape others
  const esc = (s) => s.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
  const re =
    '^' +
    pat
      .split('**')
      .map((p) => esc(p).replace(/\\\*/g, '[^/]*'))
      .join('[\\s\\S]*') +
    '$';
  return new RegExp(re);
};
const EXTRA_IGNORE_RES = EXTRA_IGNORES.map(mm);

// Matchers
const MATCHERS = [
  { type: 'MARKER', re: /\b(TODO|FIXME|HACK|STUB|PLACEHOLDER|WIP|TEMP)\b/i },
  {
    type: 'NOT_IMPLEMENTED',
    re: /throw\s+new\s+Error\(\s*['"`]\s*(not\s+implemented|unimplemented)\s*['"`]\s*\)/i,
  },
  { type: 'TS_BANDAID', re: /@ts-(ignore|expect-error)/ },
  { type: 'CAST_ANY', re: /\bas\s+any\b/ },
  { type: 'DOUBLE_CAST', re: /\bas\s+unknown\s+as\b/ },
];
const STUB_SPEC_NAME = /(sanity|health|placeholder|stub|smoke)/i;

function isBinary(buf) {
  // quick binary sniff: contains null byte
  return buf.includes(0);
}

function listCandidates() {
  if (!SINCE) return null;
  try {
    const out = cp
      .execSync(`git diff --name-only ${SINCE} --`, {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      .toString('utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((s) => s.replace(/\\/g, '/'));
    return new Set(out);
  } catch {
    return null;
  }
}

const sinceSet = listCandidates();

function shouldIgnore(rel) {
  const parts = rel.split('/');
  // ignore by dir segments
  for (const seg of parts) {
    if (IGNORE_DIRS.has(seg)) return true;
  }
  // ignore common output roots
  if (parts.includes('tools') && parts.includes('reports')) return true;
  if (parts.includes('scans')) return true;

  // backups/archives
  if (rel.includes('/.app_backup_')) return true;
  if (rel.includes('/._archived_')) return true;

  // user-supplied patterns
  for (const re of EXTRA_IGNORE_RES) {
    if (re.test(rel)) return true;
  }
  return false;
}

function walk(dir, acc) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = abs
      .replace(ROOT, '')
      .replace(/^[\\/]/, '')
      .replace(/\\/g, '/');
    if (ent.isDirectory()) {
      if (shouldIgnore(rel)) continue;
      walk(abs, acc);
    } else if (ent.isFile()) {
      if (shouldIgnore(rel)) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!EXTS.has(ext)) continue;
      if (sinceSet && !sinceSet.has(rel)) continue;
      acc.push(abs);
    }
  }
}

function scanFile(abs) {
  let buf;
  try {
    buf = fs.readFileSync(abs);
  } catch {
    return null;
  }
  if (isBinary(buf)) return null;

  const text = buf.toString('utf8');
  const rel = abs
    .replace(ROOT, '')
    .replace(/^[\\/]/, '')
    .replace(/\\/g, '/');

  // gather matches
  const hits = [];
  const lines = text.split(/\r?\n/);
  const pushHit = (type, lineNo, lineText) => {
    if (ONLY && !ONLY[type]) return;
    hits.push({ type, line: lineNo, text: lineText.trim() });
  };

  // regex line passes per matcher (first 3 per type)
  for (const m of MATCHERS) {
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (m.re.test(lines[i])) {
        pushHit(m.type, i + 1, lines[i]);
        if (++count >= 3) break;
      }
    }
  }

  // spec stub detection
  const isSpec = /\.(spec|test)\.(t|j)sx?$/.test(rel);
  if (isSpec) {
    const expectCount = (text.match(/\bexpect\s*\(/g) || []).length;
    if (expectCount <= 1 || STUB_SPEC_NAME.test(path.basename(rel))) {
      // mark SPEC_STUB at first line that contains 'describe' or 'it' (if any)
      const idx = lines.findIndex((l) => /\b(describe|it|test)\b/.test(l));
      pushHit('SPEC_STUB', idx >= 0 ? idx + 1 : 1, lines[Math.max(0, idx)]);
    }
  }

  if (!hits.length) return null;

  // classify group for convenience
  const type = /apps\/api\/src\/trpc\/routers\/.+\.router\.ts$/.test(rel)
    ? 'api-router'
    : /apps\/api\/src\//.test(rel)
    ? 'api'
    : /^web\/src\//.test(rel) || /apps\/web\/src\//.test(rel)
    ? 'web'
    : /^web\//.test(rel)
    ? 'web'
    : /libs\//.test(rel)
    ? 'lib'
    : 'other';

  // extract simple snippet (first matching lines)
  const snippet = hits
    .slice(0, 3)
    .map((h) => `L${h.line}: ${h.text.slice(0, 160)}`)
    .join(' | ');

  return { file: rel, group: type, hits, snippet, isSpec };
}

// ---------------- run ----------------
const files = [];
walk(ROOT, files);
files.sort();

const findings = [];
const stubSpecs = [];
for (const f of files) {
  const r = scanFile(f);
  if (!r) continue;
  findings.push(
    ...r.hits.map((h) => ({
      file: r.file,
      group: r.group,
      type: h.type,
      line: h.line,
      text: h.text,
    }))
  );
  if (r.isSpec && r.hits.some((h) => h.type === 'SPEC_STUB')) {
    stubSpecs.push(r.file);
  }
}

// sort for readability
findings.sort(
  (a, b) =>
    a.group.localeCompare(b.group) ||
    a.file.localeCompare(b.file) ||
    a.type.localeCompare(b.type) ||
    a.line - b.line
);

// write JSON (always)
const report = {
  when: new Date().toISOString(),
  root: ROOT.replace(/\\/g, '/'),
  scanned: files.length,
  findingsCount: findings.length,
  byType: findings.reduce(
    (m, f) => ((m[f.type] = (m[f.type] || 0) + 1), m),
    {}
  ),
  byGroup: findings.reduce(
    (m, f) => ((m[f.group] = (m[f.group] || 0) + 1), m),
    {}
  ),
  findings,
  stubSpecs,
  since: SINCE,
};
const jsonPath = `${OUT_PREFIX}.json`;
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

// optional CSV
if (WANT_CSV) {
  const rows = ['file,line,group,type,snippet'];
  for (const f of findings) {
    const sn = (f.text || '').replace(/"/g, '""');
    rows.push(
      `"${f.file.replace(/"/g, '""')}",${f.line},"${f.group}","${
        f.type
      }","${sn}"`
    );
  }
  fs.writeFileSync(`${OUT_PREFIX}.csv`, rows.join('\n'), 'utf8');
}

// optional Markdown
if (WANT_MD) {
  const stamp = path.basename(OUT_PREFIX).replace(/^stub-scan-/, '');
  let md = `# Stub Scan Report (${stamp})\n\n`;
  md += `**Total findings:** ${findings.length}\n\n`;
  const bt =
    Object.entries(report.byType)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ') || 'none';
  const bg =
    Object.entries(report.byGroup)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ') || 'none';
  md += `**By type:** ${bt}\n\n**By group:** ${bg}\n\n`;
  if (stubSpecs.length) {
    md += `## Obvious stub specs (${stubSpecs.length})\n`;
    md += stubSpecs.map((s) => `- ${s}`).join('\n') + '\n\n';
  }
  md += `## Findings\n`;
  for (const f of findings.slice(0, 1000)) {
    md += `- ${f.file}:${f.line} — **${f.type}** — \`${f.text}\`\n`;
  }
  if (findings.length > 1000) md += `\n…and ${findings.length - 1000} more.\n`;
  fs.writeFileSync(`${OUT_PREFIX}.md`, md, 'utf8');
}

// console summary
const outs = [`✓ Wrote ${path.relative(ROOT, jsonPath).replace(/\\/g, '/')}`];
if (WANT_CSV)
  outs.push(path.relative(ROOT, `${OUT_PREFIX}.csv`).replace(/\\/g, '/'));
if (WANT_MD)
  outs.push(path.relative(ROOT, `${OUT_PREFIX}.md`).replace(/\\/g, '/'));
console.log(outs.join('\n  - '));

// suggest deletes
if (SUGGEST_DELETES && stubSpecs.length) {
  const chunk = (arr, n) =>
    arr.length ? [arr.slice(0, n), ...chunk(arr.slice(n), n)] : [];
  console.log(
    '\n# Suggested commands to remove obvious stub tests (review before running):'
  );
  for (const group of chunk(stubSpecs, 10)) {
    console.log(
      'git rm ' + group.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(' ')
    );
  }
}

// CI gating
const total = findings.length;
if ((FAIL_ON_FIND && total > 0) || (LIMIT !== null && total > LIMIT)) {
  console.error(
    `✗ Stub scan threshold exceeded (found=${total}${
      LIMIT !== null ? `, limit=${LIMIT}` : ''
    })`
  );
  process.exit(2);
}
