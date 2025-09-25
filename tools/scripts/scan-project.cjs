#!/usr/bin/env node
/* Project scanner — safe, portable, no heredoc/backtick pitfalls */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const IGNORE_DIRS = new Set([
  'node_modules','.git','dist','build','.next','coverage','.turbo','out',
  '.cache','.parcel-cache','tmp','vendor'
]);

const CODE_EXTS = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs']);
const ALL_EXTS  = new Set([...CODE_EXTS, '.json', '.md']);

const args = new Set(process.argv.slice(2));
const SINCE = (() => {
  const i = process.argv.indexOf('--since');
  return i > -1 ? (process.argv[i+1] || '') : '';
})();

function changedSince(ref) {
  try {
    const out = cp.execSync(`git diff --name-only ${ref}`, { cwd: ROOT, stdio: ['ignore','pipe','ignore'] })
      .toString().trim().split(/\r?\n/).filter(Boolean);
    return new Set(out.map(p => path.resolve(ROOT, p)));
  } catch {
    return null;
  }
}

const LIMIT_TO = SINCE ? changedSince(SINCE) : null;

const results = [];
const add = (type, file, line, message, snippet) =>
  results.push({ type, file: path.relative(ROOT, file), line, message, snippet });

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      out.push(...walk(path.join(dir, e.name)));
    } else if (e.isFile()) {
      const abs = path.join(dir, e.name);
      if (LIMIT_TO && !LIMIT_TO.has(abs)) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (ALL_EXTS.has(ext)) out.push(abs);
    }
  }
  return out;
}

function isSpecFile(f) {
  return /(\.|[\\/])(spec|test)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f);
}
function hasColocatedSpec(f) {
  const ext = path.extname(f);
  const base = path.basename(f, ext);
  const dir = path.dirname(f);
  const candidates = [
    path.join(dir, `${base}.spec${ext}`),
    path.join(dir, `${base}.test${ext}`),
  ];
  if (base === 'page' && ext === '.tsx') {
    candidates.push(path.join(dir, `page.spec.tsx`));
    candidates.push(path.join(dir, `page.test.tsx`));
  }
  return candidates.some(c => fs.existsSync(c));
}

function scanFile(file) {
  const ext = path.extname(file).toLowerCase();
  const isCode = CODE_EXTS.has(ext);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  // 1) Open handles outside tests
  if (isCode && !isSpecFile(file)) {
    const re = /(setTimeout|setInterval)\s*\(/g;
    let m; while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      add('OPEN_HANDLE', file, line, `Found ${m[1]}(`, lines[line-1]?.trim());
    }
  }

  // 2) .only usage
  if (isCode) {
    const re = /\b(describe|it|test)\.only\s*\(/g;
    let m; while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      add('FOOTGUN', file, line, `.${m[1]}.only() present`, lines[line-1]?.trim());
    }
  }

  // 3) Duplicate unmount assignment
  if (isCode) {
    const re = /const\s*\{\s*unmount\s*\}\s*=\s*const\s*\{\s*unmount\s*\}\s*=\s*render\(/g;
    let m; while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      add('SMELL', file, line, 'Duplicate const assignment for unmount/render', lines[line-1]?.trim());
    }
  }

  // 4) Suspicious CLI/heredoc junk in source files (skip README.md)
  if (isCode) {
    const re = /(^|\n)\s*(pnpm|npm|yarn)\s|<<'NODE'|cat\s+<<'EOF'/m;
    if (re.test(text)) {
      const line = text.slice(0, text.search(re)).split('\n').length;
      add('SUSPECT_CLI', file, line, 'CLI/heredoc command embedded in source', lines[line-1]?.trim());
    }
  }

  // 5) Large file quick flag
  try {
    const sz = fs.statSync(file).size;
    if (sz > 500 * 1024) add('PERF', file, 1, `Large file (${(sz/1024/1024).toFixed(2)} MB)`, '');
  } catch {}

  // 6) trpc usage without colocated spec for components/pages
  if (isCode && !isSpecFile(file)) {
    if (/\btrpc\./.test(text)) {
      if (!hasColocatedSpec(file)) {
        add('TRPC_TEST', file, 1, 'Uses trpc hooks but no colocated spec found', '');
      }
    }
  }

  // 7) Proxies inside tests can cause runaway memory if recursive
  if (isSpecFile(file)) {
    if (/\bnew\s+Proxy\s*\(/.test(text)) {
      const idx = text.indexOf('new Proxy');
      const line = text.slice(0, idx).split('\n').length;
      add('OOM_RISK', file, line, 'new Proxy used in test — ensure it is NOT recursive', lines[line-1]?.trim());
    }
  }
}

function checkVitestSetup() {
  const p = path.join(ROOT, 'web', 'vitest.setup.ts');
  if (!fs.existsSync(p)) return;
  const s = fs.readFileSync(p, 'utf8');
  if (!/globalThis\.React\s*=\s*React/.test(s)) {
    add('SETUP', p, 1, 'Missing: globalThis.React = React (helps JSX in some paths)', '');
  }
  if (!/@testing-library\/jest-dom/.test(s)) {
    add('SETUP', p, 1, "Missing: import '@testing-library/jest-dom'", '');
  }
  if (!/cleanup/.test(s) || !/afterEach\s*\(\s*\(\)\s*=>\s*cleanup\(\)\s*\)/.test(s)) {
    add('SETUP', p, 1, 'Missing: afterEach(() => cleanup())', '');
  }
  if (/vi\.mock\(['"]@\/trpc['"]/.test(s)) {
    add('OOM_RISK', p, 1, "Global vi.mock('@/trpc') in setup — prefer per-test mocks; globals can leak memory", '');
  }
}

function checkViteReactPlugin() {
  const p = path.join(ROOT, 'web', 'vite.config.ts');
  if (!fs.existsSync(p)) return;
  const s = fs.readFileSync(p, 'utf8');
  if (!/@vitejs\/plugin-react/.test(s)) {
    add('SETUP', p, 1, 'Vite config missing @vitejs/plugin-react in plugins[]', '');
  }
}

function run() {
  const files = walk(ROOT);
  files.forEach(scanFile);
  checkVitestSetup();
  checkViteReactPlugin();

  const byType = results.reduce((acc, r) => {
    (acc[r.type] ||= 0); acc[r.type]++; return acc;
  }, {});
  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const outDir = path.join('tools', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `scan-${ts}.json`);
  const txtPath  = path.join(outDir, `scan-${ts}.txt`);

  fs.writeFileSync(jsonPath, JSON.stringify({ summary: byType, results }, null, 2), 'utf8');

  let txt = '—— Scan Summary ——\n';
  const keys = Object.keys(byType).sort();
  for (const k of keys) txt += `${k.padEnd(12)}: ${byType[k]}\n`;
  txt += `\n—— Findings (${results.length}) ——\n\n`;
  for (const r of results) {
    txt += `[${r.type}] ${r.file}${r.line ? ':'+r.line : ''}\n  ${r.message}\n`;
    if (r.snippet) txt += `---\n${r.snippet}\n---\n`;
    txt += '\n';
  }
  fs.writeFileSync(txtPath, txt, 'utf8');

  console.log(txt);
  console.log(`Wrote ${jsonPath} and ${txtPath}`);
}

run();
