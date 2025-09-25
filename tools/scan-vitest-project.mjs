// tools/scan-vitest-project.mjs
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const IGNORE = new Set([
  'node_modules','.git','.next','dist','build','coverage','.turbo','out',
  '.cache','.parcel-cache','tmp','vendor'
]);
const CODE = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs']);
const ALL  = new Set([...CODE, '.json', '.md']);

const findings = [];
const add = (type, file, line, message, snippet='') =>
  findings.push({ type, file: path.relative(ROOT, file), line, message, snippet });

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!IGNORE.has(e.name)) out.push(...walk(path.join(dir, e.name)));
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (ALL.has(ext)) out.push(path.join(dir, e.name));
    }
  }
  return out;
}

const files = walk(ROOT);

/* ── 1) Config checks ─────────────────────────────────────────────────────── */
const rootConfig = files.find(f => /(^|\/)vitest\.config\.(t|j)s$/.test(f));
if (rootConfig) {
  const s = fs.readFileSync(rootConfig, 'utf8');
  if (/\benvironmentMatchGlobs\b/.test(s))
    add('CONFIG', rootConfig, 1, 'Deprecated: environmentMatchGlobs — migrate to test.projects');
  if (!/\btest\s*:\s*{[^}]*projects\b/s.test(s))
    add('CONFIG', rootConfig, 1, 'No test.projects detected — web/api/shared split recommended');
  if (!/\bpool\s*:\s*['"]forks['"]/.test(s))
    add('CONFIG', rootConfig, 1, 'Consider test.pool = "forks" to avoid worker OOM on Windows');
}

/* ── 2) Vite + React plugin wiring ────────────────────────────────────────── */
const webVite = files.find(f => /(^|\/)web\/vite\.config\.(t|j)s$/.test(f));
if (webVite) {
  const s = fs.readFileSync(webVite, 'utf8');
  if (!/@vitejs\/plugin-react/.test(s) || !/\breact\(\)/.test(s))
    add('CONFIG', webVite, 1, 'Vite missing @vitejs/plugin-react or react() not applied');
  if (!/\besbuild\s*:\s*{[^}]*jsx\s*:\s*['"]automatic['"]/s.test(s))
    add('CONFIG', webVite, 1, 'esbuild.jsx not set to "automatic"');
}

/* ── 3) Setup file checks ─────────────────────────────────────────────────── */
const setupCandidates = files.filter(f => /(^|\/)vitest\.setup\.(t|j)s$/.test(f));
for (const f of setupCandidates) {
  const s = fs.readFileSync(f,'utf8');
  if (!/globalThis\.React\s*=/.test(s))
    add('SETUP', f, 1, 'Missing: globalThis.React = React (helps JSX in some paths)');
  if (!/@testing-library\/jest-dom/.test(s))
    add('SETUP', f, 1, 'Missing: import "@testing-library/jest-dom"');
  if (!/\bafterEach\s*\(\s*\(\)\s*=>\s*cleanup\(\)\s*\)/.test(s))
    add('SETUP', f, 1, 'Missing: afterEach(() => cleanup())');
  // MSW lifecycle
  if (/server\.listen\(/.test(s) && !/server\.close\(\)/.test(s))
    add('OPEN_HANDLE', f, 1, 'Found server.listen( without afterAll(() => server.close())');
  // Heavy global TRPC mock can blow memory; warn if present
  if (/vi\.mock\(['"]@\/trpc['"]/.test(s) && /Proxy\s*\(/.test(s))
    add('SETUP', f, 1, 'Global TRPC mock uses Proxy — move to per-test or simplify to plain object');
}

/* ── 4) Open-handle suspects & .only ──────────────────────────────────────── */
for (const f of files.filter(f => CODE.has(path.extname(f)))) {
  const s = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  let m;
  const reTimeout = /(setTimeout|setInterval)\s*\(/g;
  while ((m = reTimeout.exec(s))) add('OPEN_HANDLE', f, lineAt(s, m.index), `Found ${m[1]}(`);
  const reOnly = /\b(it|test|describe)\.only\b/g;
  while ((m = reOnly.exec(s))) add('FOOTGUN', f, lineAt(s, m.index), 'Found .only');
}

/* ── 5) TRPC usage without local test mock/provider ───────────────────────── */
const pages = files.filter(f => /(^|\/)web\/src\/app\/.+\/page\.tsx$/.test(f));
for (const p of pages) {
  const dir = path.dirname(p);
  const hasSpec = fs.existsSync(path.join(dir, 'page.spec.tsx'));
  if (!hasSpec) add('SPEC_SUGGEST', p, 1, 'No page.spec.tsx alongside route page');

  const s = fs.readFileSync(p,'utf8');
  if (/@\/trpc/.test(s) && /\.use(Query|Mutation)\b/.test(s)) {
    // if there is a colocated spec, we expect local mock; just nudge
    if (hasSpec) add('TRPC_TEST', p, 1, 'Uses trpc hooks — ensure local vi.mock("@/trpc") or provider wrapper');
  }
}

/* ── 6) Big files (can slow transform) ────────────────────────────────────── */
for (const f of files) {
  const bytes = fs.statSync(f).size;
  if (bytes > 500_000) add('PERF', f, 1, `Large file (${(bytes/1024/1024).toFixed(2)} MB)`);
}

/* ── Helpers & output ─────────────────────────────────────────────────────── */
function lineAt(s, idx) { return s.slice(0, idx).split(/\r?\n/).length; }

const summary = findings.reduce((m, f) => (m[f.type]=(m[f.type]||0)+1, m), {});
const outJson = path.join(ROOT, 'scan-results.json');
const outTxt  = path.join(ROOT, 'scan-results.txt');

fs.writeFileSync(outJson, JSON.stringify({ summary, findings }, null, 2));
const lines = [];
lines.push('—— Scan Summary ——');
Object.entries(summary).forEach(([k,v]) => lines.push(`${k.padEnd(13)}: ${v}`));
lines.push('\n—— Findings ('+findings.length+') ——\n');
for (const r of findings) {
  lines.push(`[${r.type}] ${r.file}:${r.line}\n  ${r.message}`);
  if (r.snippet) lines.push('---\n'+r.snippet+'\n---');
  lines.push('');
}
fs.writeFileSync(outTxt, lines.join('\n'));

console.log('Wrote scan-results.json and scan-results.txt');
