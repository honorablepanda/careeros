#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');

const C = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};
const ok = (s) => console.log(`${C.green}✓${C.reset} ${s}`);
const bad = (s) => console.log(`${C.red}✗${C.reset} ${s}`);
const warn = (s) => console.log(`${C.yellow}!${C.reset} ${s}`);
const info = (s) => console.log(`${C.cyan}•${C.reset} ${s}`);

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
function readTextSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}
function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}
function rel(p) {
  return p
    .replace(process.cwd(), '')
    .replace(/^[/\\]/, '')
    .replace(/\\/g, '/');
}

const ROOT = process.cwd();
const WEB = path.join(ROOT, 'apps', 'web');

// ---------------------------------------------------------------------------
// 1) Figure out which source root Nx/Next is likely using
// ---------------------------------------------------------------------------
let sourceRoot = null;
const projectJson = path.join(WEB, 'project.json');
const workspaceJson = path.join(ROOT, 'workspace.json');
const nxJson = path.join(ROOT, 'nx.json');

if (exists(projectJson)) {
  const pj = readJsonSafe(projectJson);
  if (pj?.sourceRoot) sourceRoot = path.resolve(ROOT, pj.sourceRoot);
}
if (!sourceRoot && exists(workspaceJson)) {
  const w = readJsonSafe(workspaceJson);
  const webProj = Object.values(w?.projects || {}).find((p) =>
    (typeof p === 'object' ? p.root : p)
      ?.toString()
      .replace(/\\/g, '/')
      .endsWith('apps/web')
  );
  if (webProj && typeof webProj === 'object' && webProj.sourceRoot) {
    sourceRoot = path.resolve(ROOT, webProj.sourceRoot);
  }
}
// Fallback guesses
const guessSrc = path.join(WEB, 'src');
const guessRoot = WEB;
if (!sourceRoot) {
  if (exists(path.join(guessSrc, 'app'))) sourceRoot = guessSrc;
  else sourceRoot = guessRoot;
}

info(`Detected web project path: ${rel(WEB)}`);
info(`Detected sourceRoot: ${rel(sourceRoot)}`);

// Candidate app roots:
const appRoots = [
  path.join(sourceRoot, 'app'),
  path.join(WEB, 'app'),
  path.join(WEB, 'src', 'app'), // safety
];

// ---------------------------------------------------------------------------
// 2) Scan next.config.js for risky flags
// ---------------------------------------------------------------------------
const nextConfig = path.join(WEB, 'next.config.js');
let appDirDisabled = false;
let hasRewrites = false;
if (exists(nextConfig)) {
  const txt = readTextSafe(nextConfig) || '';
  // naive checks
  if (/appDir\s*:\s*false/.test(txt)) appDirDisabled = true;
  if (/rewrites\s*\:/.test(txt)) hasRewrites = true;
  info(`Found ${rel(nextConfig)}`);
} else {
  warn(`Missing ${rel(nextConfig)} (that's ok, Next will use defaults).`);
}
if (appDirDisabled) {
  bad(
    `experimental.appDir=false detected in next.config.js — App Router will be disabled (your "app/" routes won't work).`
  );
} else {
  ok(`App Router appears enabled (no "experimental.appDir=false").`);
}
if (hasRewrites) {
  warn(
    `Detected "rewrites" in next.config.js — verify nothing rewrites "/tracker/:id/activity" or "/tracker/activity".`
  );
}

// ---------------------------------------------------------------------------
// 3) Check app roots + required files
// ---------------------------------------------------------------------------
const checks = [];
function fileCheck(filePath, description, mustExportDefault = false) {
  if (!exists(filePath)) {
    checks.push({
      ok: false,
      message: `Missing ${rel(filePath)} (${description}).`,
    });
    return;
  }
  checks.push({
    ok: true,
    message: `Found ${rel(filePath)} (${description}).`,
  });

  if (mustExportDefault) {
    const code = readTextSafe(filePath) || '';
    const hasDefault = /export\s+default\s+function|export\s+default\s*\(/.test(
      code
    );
    if (!hasDefault) {
      checks.push({
        ok: false,
        message: `No "export default" React component in ${rel(filePath)}.`,
      });
    } else {
      checks.push({
        ok: true,
        message: `"export default" present in ${rel(filePath)}.`,
      });
    }
  }
}

const rootsFound = [];
for (const root of appRoots) {
  if (!exists(root)) continue;
  rootsFound.push(root);

  info(`Scanning app root: ${rel(root)}`);

  // Required shell files
  fileCheck(path.join(root, 'layout.tsx'), 'root layout');
  fileCheck(path.join(root, 'providers.tsx'), 'providers (client wrapper)');

  // Home page (optional but nice sanity)
  fileCheck(path.join(root, 'page.tsx'), 'home page', true);

  // Activity routes
  fileCheck(
    path.join(root, 'tracker', 'activity', 'page.tsx'),
    'querystring activity page',
    true
  );
  fileCheck(
    path.join(root, 'tracker', '[id]', 'activity', 'page.tsx'),
    'dynamic activity page',
    true
  );
}

if (rootsFound.length === 0) {
  bad(
    `No app roots found. Checked:\n  - ${rel(appRoots[0])}\n  - ${rel(
      appRoots[1]
    )}\n  - ${rel(appRoots[2])}`
  );
} else if (rootsFound.length > 1) {
  warn(
    `Multiple app roots exist (${rootsFound
      .map((r) => rel(r))
      .join(', ')}).\n` +
      `Depending on Nx/Next wiring, only ONE may be active. Based on sourceRoot, Next likely uses: ${rel(
        path.join(sourceRoot, 'app')
      )}`
  );
} else {
  ok(`Single app root detected: ${rel(rootsFound[0])}`);
}

// Print file check results
for (const r of checks) (r.ok ? ok : bad)(r.message);

// ---------------------------------------------------------------------------
// 4) TRPC stub + alias check
// ---------------------------------------------------------------------------
const trpcReact = path.join(WEB, 'src', 'trpc', 'react.ts');
if (exists(trpcReact)) ok(`TRPC stub present: ${rel(trpcReact)}`);
else
  warn(
    `Missing TRPC stub: ${rel(
      trpcReact
    )} (UI may fail if "@/trpc/react" is imported).`
  );

// ---------------------------------------------------------------------------
// 5) Package scripts sanity
// ---------------------------------------------------------------------------
const pkgFile = path.join(ROOT, 'package.json');
const pkg = readJsonSafe(pkgFile);
if (!pkg) {
  warn(`Could not read ${rel(pkgFile)}.`);
} else {
  const scripts = pkg.scripts || {};
  const hasDevActivity = !!scripts['dev:activity'];
  const hasDevWeb =
    !!scripts['dev:web'] || /web:serve/.test(JSON.stringify(scripts));
  hasDevActivity
    ? ok(`package.json script "dev:activity" exists.`)
    : warn(`Missing "dev:activity" script.`);
  hasDevWeb
    ? ok(`package.json dev web script present.`)
    : warn(`Missing dev web script ("dev:web" or Nx web:serve).`);
}

// ---------------------------------------------------------------------------
// 6) Likely causes summary
// ---------------------------------------------------------------------------
console.log('');
console.log(`${C.cyan}=== Likely 404 Causes & Next Steps ===${C.reset}`);

if (appDirDisabled) {
  bad(
    `App Router disabled in next.config.js. Remove "experimental.appDir=false" or move routes to "pages/".`
  );
}

if (rootsFound.length === 0) {
  bad(
    `No "app/" directory found under the active source root: ${rel(
      sourceRoot
    )}.`
  );
  console.log(
    `Create: ${rel(path.join(sourceRoot, 'app', 'layout.tsx'))} and ${rel(
      path.join(sourceRoot, 'app', 'tracker', '[id]', 'activity', 'page.tsx')
    )}`
  );
}

if (rootsFound.length > 1) {
  warn(
    `Multiple app roots — ensure the one under the **active** sourceRoot (${rel(
      sourceRoot
    )}) contains the Activity pages.`
  );
}

const missingCritical = checks.some(
  (c) =>
    !c.ok &&
    (/layout\.tsx/.test(c.message) ||
      /tracker\/\[id]\/activity\/page\.tsx/.test(c.message) ||
      /tracker\/activity\/page\.tsx/.test(c.message))
);
if (missingCritical) {
  bad(
    `At least one critical route file is missing or lacks "export default". Fix those and retry.`
  );
} else {
  ok(
    `All required route files appear present with default exports (at least in one app root).`
  );
  console.log(
    `If you still get 404:\n` +
      `  1) Verify Nx "sourceRoot" points to the app root you edited: ${rel(
        sourceRoot
      )}\n` +
      `  2) Ensure dev server is restarted after file changes\n` +
      `  3) Check rewrites in next.config.js aren't intercepting /tracker/*`
  );
}

// ---------------------------------------------------------------------------
// 7) Optional JSON output
// ---------------------------------------------------------------------------
if (process.argv.includes('--json')) {
  const out = {
    webPath: rel(WEB),
    sourceRoot: rel(sourceRoot),
    nextConfig: exists(nextConfig) ? rel(nextConfig) : null,
    appDirDisabled,
    rootsFound: rootsFound.map(rel),
    checks,
    trpcStub: exists(trpcReact),
    pkgScripts: {
      hasDevActivity: !!(pkg?.scripts || {})['dev:activity'],
      hasDevWeb: !!(pkg?.scripts || {})['dev:web'],
    },
  };
  console.log('\n' + JSON.stringify(out, null, 2));
}
