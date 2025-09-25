#!/usr/bin/env node
/* Trace where "@/trpc/react" resolves from and who exports the client. */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const webDir = path.join(root, 'web');

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

const tsconfigPath = path.join(webDir, 'tsconfig.json');
let alias = {};
if (exists(tsconfigPath)) {
  try {
    const ts = JSON.parse(read(tsconfigPath));
    alias = (ts.compilerOptions && ts.compilerOptions.paths) || {};
  } catch {}
}

const candidates = [
  path.join(webDir, 'src/trpc/react.ts'),
  path.join(webDir, 'src/trpc/react.tsx'),
  path.join(webDir, 'norm/trpc/react.ts'),
  path.join(webDir, 'norm/trpc/react.tsx'),
].filter(exists);

function grepTrpcImports() {
  const hits = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(m?[jt]sx?)$/.test(entry.name)) {
        const txt = read(full);
        if (txt.includes('@/trpc/react') || /from\s+['"].*trpc\/react['"]/.test(txt)) {
          const line = (txt.split('\n').find(
            l => l.includes('@/trpc/react') || /from\s+['"].*trpc\/react['"]/.test(l)
          ) || '').trim();
          hits.push({ file: path.relative(root, full), line });
        }
      }
    }
  }
  if (exists(webDir)) walk(webDir);
  return hits;
}

function infoFor(file) {
  const txt = read(file);
  return {
    path: path.relative(root, file),
    size: txt.length,
    hasCreateTRPCReact: /createTRPCReact/.test(txt),
    importsTrpcReactPkg: /from\s+['"]@trpc\/react-query['"]/.test(txt),
    exportsTrpcConst: /export\s+const\s+trpc/.test(txt),
    exportsDefaultTrpc: /export\s+default\s+trpc/.test(txt),
  };
}

const report = {
  root,
  webDir: exists(webDir) ? path.relative(root, webDir) : null,
  tsconfigAlias: alias,
  imports: grepTrpcImports(),
  candidates: candidates.map(infoFor),
  hint: 'If "@/trpc/react" imports exist but your stub is not at web/src/trpc/react.ts, add a Vitest alias mapping "@/trpc/react" to your stub file.',
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('▶ trace-trpc-import');
  console.log('webDir:', report.webDir);
  console.log('alias from web/tsconfig.json:', Object.keys(report.tsconfigAlias).length ? report.tsconfigAlias : '(none)');
  console.log('\nImports of trpc/react in web/:');
  for (const i of report.imports) console.log('  →', i.file, '\n     ', i.line);
  console.log('\nCandidate trpc/react files:');
  for (const c of report.candidates) {
    console.log(
      `  - ${c.path}\n` +
      `      size=${c.size}  createTRPCReact=${c.hasCreateTRPCReact}  imports @trpc/react-query=${c.importsTrpcReactPkg}\n` +
      `      exports trpc const=${c.exportsTrpcConst}  exports default trpc=${c.exportsDefaultTrpc}\n`
    );
  }
  console.log('Next step:', report.hint);
}
