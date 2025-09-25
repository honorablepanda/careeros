#!/usr/bin/env node
/* tools/scripts/scan-activity-page-behavior.cjs */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const WEB = path.join(ROOT, 'apps', 'web');
const project = require(path.join(WEB, 'project.json'));
const sourceRoot = project.sourceRoot || 'apps/web/src';
const appRoot = path.join(ROOT, sourceRoot, 'app');

const targets = [
  {
    label: 'dynamic activity page',
    file: path.join(appRoot, 'tracker', '[id]', 'activity', 'page.tsx'),
  },
  {
    label: 'querystring activity page',
    file: path.join(appRoot, 'tracker', 'activity', 'page.tsx'),
  },
];

function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function scan(src) {
  if (!src) return null;
  const usesNotFound = /\bnotFound\s*\(/.test(src);
  const importsNotFound =
    /from\s+['"]next\/navigation['"].*notFound/.test(src) ||
    /notFound.*from\s+['"]next\/navigation['"]/.test(src);
  const usesTRPC =
    /['"]@\/trpc\/react['"]|['"]@\/careeros\/api['"]|['"]@\/trpc['"]/.test(src);
  const fallbackNoAPI = /Activity API not available|No activity/i.test(src);
  const fetchIdUsage =
    /\bparams\s*:\s*{[^}]*id\b|\bparams\?\.\bid\b|\bsearchParams\b/.test(src);
  const returnsNull = /\breturn\s+null\b/.test(src);
  return {
    usesNotFound,
    importsNotFound,
    usesTRPC,
    fallbackNoAPI,
    fetchIdUsage,
    returnsNull,
  };
}

const report = [];

for (const t of targets) {
  const rel = path.relative(ROOT, t.file);
  const src = read(t.file);
  if (!src) {
    report.push({ file: rel, exists: false });
    console.log(`✗ Missing ${t.label}: ${rel}`);
    continue;
  }
  const info = scan(src);
  report.push({ file: rel, exists: true, ...info });
  console.log(`✓ Found ${t.label}: ${rel}`);
  Object.entries(info).forEach(([k, v]) => console.log(`  • ${k}: ${v}`));
}

console.log(
  '\nHint: If `usesNotFound: true` and the page can’t load an app/activity for that id, Next will render 404.'
);
