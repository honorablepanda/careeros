#!/usr/bin/env node
/* tools/scripts/diagnose-activity-404.cjs */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const cp = require('child_process');

const args = new Set(process.argv.slice(2));
const isJSON = args.has('--json');
const doBuild = args.has('--build');

const out = [];
const add = (ok, message) => out.push({ ok, message });

const log = (msg) => console.log(msg);
const ok = (m) => log(`✓ ${m}`);
const warn = (m) => log(`! ${m}`);
const bad = (m) => log(`✗ ${m}`);

const ROOT = process.cwd();
const WEB_DEFAULT = path.join(ROOT, 'apps', 'web');

function readJSONSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

function hasDefaultExport(src) {
  // Simple but reliable for TSX pages
  return /\bexport\s+default\b/.test(src);
}

async function main() {
  const report = {
    webPath: null,
    sourceRoot: null,
    rootsFound: [],
    chosenRoot: null,
    checks: [],
    manifest: {
      built: false,
      appPaths: null,
      routesMatching: []
    },
    suggestions: []
  };

  // 1) Find web project folder
  let webPath = WEB_DEFAULT;
  if (!exists(webPath)) {
    // try monorepo variants
    const candidates = [
      'apps/web',
      'web',
      'packages/web',
      'apps/site',
      'site',
    ].map(p => path.join(ROOT, p));
    webPath = candidates.find(exists);
  }
  if (!webPath || !exists(webPath)) {
    bad('Could not locate your web project folder (expected apps/web).');
    add(false, 'Web project not found.');
    finish(report);
    return;
  }
  report.webPath = webPath;
  ok(`Detected web project path: ${path.relative(ROOT, webPath)}`);
  add(true, `Detected web project path: ${path.relative(ROOT, webPath)}`);

  // 2) Read Nx project.json to get sourceRoot
  const pj = readJSONSafe(path.join(webPath, 'project.json'));
  let sourceRoot = pj?.sourceRoot || null;
  if (!sourceRoot) {
    // fallback
    const guess = path.join(path.relative(ROOT, webPath), 'src').replace(/\\/g, '/');
    sourceRoot = guess;
  }
  const absSourceRoot = path.join(ROOT, sourceRoot);
  report.sourceRoot = sourceRoot;
  ok(`Detected sourceRoot: ${sourceRoot}`);
  add(true, `Detected sourceRoot: ${sourceRoot}`);

  // 3) Find possible app roots
  const rootCandidates = [
    path.join(absSourceRoot, 'app'),
    path.join(webPath, 'src', 'app'),
    path.join(webPath, 'app'),
  ].filter((p, i, arr) => arr.indexOf(p) === i); // uniq

  const foundRoots = rootCandidates.filter(exists);
  report.rootsFound = foundRoots.map(p => path.relative(ROOT, p));

  foundRoots.forEach(p => ok(`Found app root: ${path.relative(ROOT, p)}`));
  if (foundRoots.length === 0) {
    bad('No app directory found (looked for src/app and app).');
    add(false, 'No app root folder exists.');
    report.suggestions.push('Create your app root at {sourceRoot}/app (e.g. apps/web/src/app).');
    return finish(report);
  }

  if (foundRoots.length > 1) {
    warn(`Multiple app roots exist (${report.rootsFound.join(', ')}). Only ONE will be active.`);
    add(false, `Multiple app roots: ${report.rootsFound.join(', ')}`);
    report.suggestions.push(
      `Keep only one app root. Based on sourceRoot, the active one should be: ${path.join(sourceRoot, 'app')}`
    );
  }

  // Heuristic: prefer the one under sourceRoot
  const preferred = path.join(absSourceRoot, 'app');
  const chosenRoot = exists(preferred) ? preferred : foundRoots[0];
  report.chosenRoot = path.relative(ROOT, chosenRoot);
  ok(`Active app root (heuristic): ${report.chosenRoot}`);
  add(true, `Active app root (heuristic): ${report.chosenRoot}`);

  // 4) Check critical files for the /tracker/[id]/activity route
  const filesToCheck = [
    { label: 'root layout', file: path.join(chosenRoot, 'layout.tsx'), requireDefault: true },
    { label: 'providers (optional)', file: path.join(chosenRoot, 'providers.tsx'), requireDefault: false },
    { label: 'home page', file: path.join(chosenRoot, 'page.tsx'), requireDefault: true },
    { label: 'querystring activity page', file: path.join(chosenRoot, 'tracker', 'activity', 'page.tsx'), requireDefault: true },
    { label: 'dynamic activity page', file: path.join(chosenRoot, 'tracker', '[id]', 'activity', 'page.tsx'), requireDefault: true },
  ];

  for (const f of filesToCheck) {
    const rel = path.relative(ROOT, f.file);
    if (!exists(f.file)) {
      bad(`Missing ${f.label}: ${rel}`);
      report.checks.push({ ok: false, message: `Missing ${f.label}: ${rel}` });
      if (/dynamic activity page/.test(f.label)) {
        report.suggestions.push(`Create ${path.join(report.chosenRoot, 'tracker/[id]/activity/page.tsx')}`);
      }
      continue;
    }
    ok(`Found ${f.label}: ${rel}`);
    report.checks.push({ ok: true, message: `Found ${f.label}: ${rel}` });

    if (f.requireDefault) {
      const src = readFileSafe(f.file);
      if (!hasDefaultExport(src)) {
        bad(`No "export default" in ${rel}`);
        report.checks.push({ ok: false, message: `No "export default" in ${rel}` });
        report.suggestions.push(`Add a default export in ${rel}`);
      } else {
        ok(`"export default" present in ${rel}`);
        report.checks.push({ ok: true, message: `"export default" present in ${rel}` });
      }
    }
  }

  // 5) Optional: build & inspect manifest to see if route is registered
  const nextDir = path.join(webPath, '.next');
  if (doBuild) {
    log('');
    log('• Building web app to inspect route manifest...');
    try {
      // Restrict to the web project to keep it quick.
      cp.execSync('pnpm -w exec nx run web:build', { stdio: 'inherit' });
      report.manifest.built = true;
    } catch (e) {
      bad('Build failed. Skipping manifest checks.');
    }
  }

  const manifestPath = path.join(nextDir, 'server', 'app-paths-manifest.json');
  if (exists(manifestPath)) {
    const manifest = readJSONSafe(manifestPath) || {};
    report.manifest.appPaths = Object.keys(manifest);
    const matches = Object.keys(manifest).filter(k =>
      /\/tracker(\/\[id\])?\/activity(\/page)?$/i.test(k)
    );
    report.manifest.routesMatching = matches;

    if (matches.length > 0) {
      ok(`Route(s) present in manifest: ${matches.join(', ')}`);
      add(true, `Route(s) present in manifest: ${matches.join(', ')}`);
    } else {
      bad('No /tracker/[id]/activity route found in app-paths-manifest.json');
      add(false, 'Route missing from Next app-paths manifest.');
      report.suggestions.push('Ensure the dynamic page exists and has a default export under the ACTIVE app root.');
    }
  } else {
    warn('Manifest not found (dev/Turbopack may not emit it). Run with --build to generate manifests.');
    add(false, 'No manifest file to confirm route presence.');
  }

  // 6) Final hints
  report.suggestions.push(
    `Open: http://localhost:3000/tracker/<AN_ID>/activity  (replace <AN_ID> with a real Application id)`
  );
  report.suggestions.push(
    `If 404 persists but files look correct, restart dev server and clear Next cache: delete ${path.relative(ROOT, nextDir)}`
  );

  finish(report);
}

function finish(report) {
  if (isJSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\n=== Summary ===');
    for (const c of out) {
      (c.ok ? ok : bad)(c.message);
    }
    if (report.suggestions?.length) {
      console.log('\nNext steps:');
      for (const s of report.suggestions) console.log('• ' + s);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
