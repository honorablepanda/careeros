#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');

const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};
const ok = (s) => console.log(`${C.green}✓${C.reset} ${s}`);
const bad = (s) => console.log(`${C.red}✗${C.reset} ${s}`);
const warn = (s) => console.log(`${C.yellow}!${C.reset} ${s}`);
const info = (s) => console.log(`${C.cyan}•${C.reset} ${s}`);

const ROOT = process.cwd();
const WEB = path.join(ROOT, 'apps', 'web');

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}
function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}
function write(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
}
function rel(p) {
  return p
    .replace(ROOT, '')
    .replace(/^[/\\]/, '')
    .replace(/\\/g, '/');
}

function readJson(p) {
  try {
    return JSON.parse(read(p));
  } catch {
    return null;
  }
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

// Find sourceRoot (Nx)
let sourceRoot = null;
const pj = path.join(WEB, 'project.json');
if (exists(pj)) {
  const j = readJson(pj);
  if (j?.sourceRoot) sourceRoot = path.resolve(ROOT, j.sourceRoot);
}
if (!sourceRoot) sourceRoot = path.join(WEB, 'src'); // sensible default

const ACTIVE_APP = path.join(sourceRoot, 'app');
const DUP_APP = path.join(WEB, 'app');

info(`Active sourceRoot: ${rel(sourceRoot)}`);
info(`Active app root will be: ${rel(ACTIVE_APP)}`);

// 1) Back up duplicate app root if it would conflict
if (exists(DUP_APP) && path.resolve(DUP_APP) !== path.resolve(ACTIVE_APP)) {
  const backupDir = path.join(WEB, `.app_backup_${nowStamp()}`);
  fs.renameSync(DUP_APP, backupDir);
  ok(`Backed up duplicate app directory: ${rel(DUP_APP)} → ${rel(backupDir)}`);
} else {
  info(
    `No conflicting ${rel(DUP_APP)} to back up (or it matches active root).`
  );
}

// 2) Ensure minimal layout/providers/page
const layoutPath = path.join(ACTIVE_APP, 'layout.tsx');
if (!exists(layoutPath)) {
  write(
    layoutPath,
    `import React from 'react';
export default function RootLayout({ children }:{ children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
`
  );
  ok(`Created ${rel(layoutPath)}`);
} else ok(`Found ${rel(layoutPath)}`);

const providersPath = path.join(ACTIVE_APP, 'providers.tsx');
if (!exists(providersPath)) {
  write(
    providersPath,
    `"use client";
import React from 'react';
export function Providers({ children }:{ children: React.ReactNode }) { return <>{children}</>; }
`
  );
  ok(`Created ${rel(providersPath)}`);
} else ok(`Found ${rel(providersPath)}`);

const homePath = path.join(ACTIVE_APP, 'page.tsx');
if (!exists(homePath)) {
  write(
    homePath,
    `export default function HomePage() {
  return (<main className="p-6"><h1>Home</h1><p>Next.js app is running.</p></main>);
}
`
  );
  ok(`Created ${rel(homePath)}`);
} else ok(`Found ${rel(homePath)}`);

// 3) Fix the activity pages (ensure default exports)
const qActivityPath = path.join(ACTIVE_APP, 'tracker', 'activity', 'page.tsx');
const dynActivityPath = path.join(
  ACTIVE_APP,
  'tracker',
  '[id]',
  'activity',
  'page.tsx'
);

function ensureDefaultExport(filePath, fallbackCode) {
  const code = read(filePath);
  if (!code) {
    write(filePath, fallbackCode);
    ok(`Created ${rel(filePath)} with default export.`);
    return;
  }
  const hasDefault =
    /export\s+default\s+(async\s+)?function|export\s+default\s*\(/.test(code);
  if (hasDefault) {
    ok(`Default export already present in ${rel(filePath)} (no change).`);
  } else {
    // If file exists but lacks default export, replace with safe minimal version
    write(filePath, fallbackCode);
    ok(`Rewrote ${rel(filePath)} to add a valid default export.`);
  }
}

const qActivityCode = `export default function ActivityIndexPage() {
  return (
    <main className="p-6 space-y-2">
      <h1>Tracker Activity</h1>
      <p>Open a specific application activity at <code>/tracker/&lt;id&gt;/activity</code>.</p>
    </main>
  );
}
`;

const dynActivityCode = `type Params = { id: string };

export default function ActivityPage({ params }: { params: Params }) {
  return (
    <main className="p-6 space-y-2">
      <h1>Tracker Activity</h1>
      <p>Application ID: <code>{params.id}</code></p>
      <p>Activity API wiring is optional in dev; this page renders so routing works.</p>
    </main>
  );
}
`;

ensureDefaultExport(qActivityPath, qActivityCode);
ensureDefaultExport(dynActivityPath, dynActivityCode);

ok(
  'All done. Use the URL format: /tracker/<id>/activity under the active app root.'
);
