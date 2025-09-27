#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = process.cwd();
const BASE_TSCONFIG = path.join(REPO_ROOT, 'tsconfig.base.json');

const readJSON = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
};

const getPaths = (tsconfigPath) => {
  const j = readJSON(tsconfigPath);
  const co = (j.compilerOptions || {});
  return co.paths || {};
};

const basePaths = getPaths(BASE_TSCONFIG);

const findNearestTsconfig = (filePath) => {
  let dir = path.dirname(path.resolve(filePath));
  while (true) {
    const candidate = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};

// normalize configured alias roots like:
//  - 'foo/*'  -> 'foo/'
//  - '@/*'    -> '@/'
//  - 'pkg'    -> 'pkg' (exact key)
const toAliasRoots = (pathsObj) => {
  return Object.keys(pathsObj).map((k) => k.endsWith('/*') ? k.slice(0, -1) : k);
};

const isMapped = (mod, pathsObj) => {
  return Object.keys(pathsObj).some((key) => {
    if (key.endsWith('/*')) return mod.startsWith(key.slice(0, -1));
    return mod === key;
  });
};

// Collect "file<TAB>module" pairs
let lines = '';
try {
  // keep file path so we can resolve the nearest tsconfig for each file
  lines = execSync(
    `git grep -nE "from ['\\"]([^'\\"]+)['\\"]" -- apps web || true`,
    { encoding: 'utf8' }
  );
} catch { /* no matches is fine */ }

const pairs = [];
for (const line of lines.split('\n')) {
  if (!line) continue;
  const m = line.match(/^([^:]+):\d+:(.*)$/);
  if (!m) continue;
  const file = m[1];
  const src = m[2];
  const im = src.match(/from\s+['"]([^'"]+)['"]/);
  if (!im) continue;
  const mod = im[1];

  // Ignore relative and bare non-scoped packages early
  if (mod.startsWith('.') || /^[a-zA-Z0-9_-]/.test(mod)) continue;

  pairs.push({ file, mod });
}

// Evaluate per-file using nearest tsconfig + base
const missing = [];
for (const { file, mod } of pairs) {
  const nearest = findNearestTsconfig(file);
  const nearPaths = nearest ? getPaths(nearest) : {};
  const combined = { ...basePaths, ...nearPaths };

  // Determine if this import *looks like* one of our aliases (vs external scoped pkg)
  const aliasRoots = toAliasRoots(combined);
  const isAliasLike = aliasRoots.some((root) => {
    // exact key (no '/*') must be exact match
    if (!root.endsWith('/')) return mod === root;
    // wildcard key: module path must start with the root (e.g. '@/' or '@careeros/')
    return mod.startsWith(root);
  });

  if (!isAliasLike) continue; // ignore external scoped npm packages (@prisma/client etc.)

  if (!isMapped(mod, combined)) {
    missing.push({ file, mod, nearest });
  }
}

if (missing.length) {
  console.error(
    'Alias check failed:\n' +
    missing
      .map(({ file, mod, nearest }) =>
        ` - ${mod} → (missing mapping) [in ${file}${nearest ? `; tsconfig: ${path.relative(REPO_ROOT, nearest)}` : ''}]`
      )
      .join('\n')
  );
  process.exit(1);
} else {
  console.log('Alias check passed.');
}
