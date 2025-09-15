#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function sh(cmd, opts = {}) {
  try {
    const out = execSync(cmd, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: opts.cwd || ROOT,
      env: { ...process.env, FORCE_COLOR: '1' },
      shell: process.platform === 'win32',
    });
    return out.toString('utf8').trim();
  } catch (e) {
    console.error(`✗ ${cmd}`);
    if (e.stdout?.length) console.log(e.stdout.toString());
    if (e.stderr?.length) console.error(e.stderr.toString());
    process.exitCode = 1;
    return null;
  }
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeIfMissing(file, content) {
  if (fs.existsSync(file)) {
    console.log(`• exists (ok) ${file}`);
    return;
  }
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
  console.log(`✓ wrote ${file}`);
}

function detectNxWebProject() {
  const raw = sh('pnpm -w exec nx show project web --json');
  if (!raw) {
    console.error('Could not read Nx project "web". Try: pnpm -w exec nx show projects');
    process.exit(1);
  }
  const json = JSON.parse(raw);
  // Nx may return relative paths like "web" or "apps/web"
  const projectPath = path.resolve(ROOT, json.root || 'web');
  const sourceRoot = json.sourceRoot ? path.resolve(ROOT, json.sourceRoot) : projectPath;
  return { projectPath, sourceRoot, json };
}

(function main() {
  console.log('• Detecting Nx project "web" …');
  const { projectPath, sourceRoot, json } = detectNxWebProject();
  console.log(`  - root:       ${json.root}`);
  console.log(`  - sourceRoot: ${json.sourceRoot || '(missing → using root)'}`);
  console.log(`  - resolved projectPath: ${projectPath}`);
  console.log(`  - resolved sourceRoot:  ${sourceRoot}`);

  // For Next App Router, pages live under <sourceRoot>/app (or <projectPath>/app if no sourceRoot)
  const base = sourceRoot;
  const appDir = path.join(base, 'app');

  // Minimal, safe scaffolds (no TRPC needed; just to confirm routing works)
  const layoutTsx = `import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

  const homeTsx = `export default function Home() {
  return (
    <main style={{padding: 24}}>
      <h1>Home</h1>
      <p>Try the Activity pages:</p>
      <ul>
        <li><a href="/tracker/activity?id=TEST_APP_ID">/tracker/activity?id=TEST_APP_ID</a></li>
        <li><a href="/tracker/TEST_APP_ID/activity">/tracker/TEST_APP_ID/activity</a></li>
      </ul>
    </main>
  );
}
`;

  const qstrActivity = `type SP = { id?: string };
export default function ActivityQuerystringPage(
  { searchParams }: { searchParams?: SP }
) {
  const id = searchParams?.id;
  return (
    <main style={{padding: 24}}>
      <h1>Tracker Activity</h1>
      <p><strong>Querystring id:</strong> {id ?? '—'}</p>
      <p>Activity API not available — No activity</p>
    </main>
  );
}
`;

  const dynActivity = `type Params = { id?: string };
export default function ActivityDynamicPage(
  { params }: { params?: Params }
) {
  const id = params?.id;
  return (
    <main style={{padding: 24}}>
      <h1>Tracker Activity</h1>
      <p><strong>Dynamic id:</strong> {id ?? '—'}</p>
      <p>Activity API not available — No activity</p>
    </main>
  );
}
`;

  // Paths
  const layoutPath = path.join(appDir, 'layout.tsx');
  const homePath = path.join(appDir, 'page.tsx');
  const qstrPath = path.join(appDir, 'tracker', 'activity', 'page.tsx');
  const dynPath = path.join(appDir, 'tracker', '[id]', 'activity', 'page.tsx');

  // Write files if missing (we don’t overwrite)
  writeIfMissing(layoutPath, layoutTsx);
  writeIfMissing(homePath, homeTsx);
  writeIfMissing(qstrPath, qstrActivity);
  writeIfMissing(dynPath, dynActivity);

  console.log('\nNext steps:');
  console.log('  1) Kill any server on port 3000 (or use another port). On Windows one-liners:');
  console.log('     npx kill-port 3000');
  console.log('  2) Clear Next/Nx cache:');
  console.log('     rimraf ' + path.join(projectPath, '.next') + ' .nx/cache');
  console.log('  3) Serve the Nx "web" project:');
  console.log('     pnpm -w exec nx run web:serve   # (add --port=3001 if 3000 in use)');
  console.log('  4) Try:');
  console.log('     http://localhost:3000/tracker/activity?id=YOUR_APP_ID');
  console.log('     http://localhost:3000/tracker/YOUR_APP_ID/activity');
})();
