#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const ROOT = process.cwd();

function logOK(m) {
  console.log(`✓ ${m}`);
}
function logI(m) {
  console.log(`• ${m}`);
}
function logW(m) {
  console.log(`! ${m}`);
}
function logX(m) {
  console.log(`✗ ${m}`);
}
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

async function chooseWebRoot() {
  const a = path.join(ROOT, 'web');
  const b = path.join(ROOT, 'apps', 'web');
  if (fs.existsSync(a)) return a;
  if (fs.existsSync(b)) return b;
  throw new Error(
    'Could not locate "web" project (looked for ./web and ./apps/web).'
  );
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

function importPathToLib(fromFile, webRoot) {
  const to = path.join(webRoot, 'lib', 'prisma.ts');
  const rp = path
    .relative(path.dirname(fromFile), to)
    .replace(/\\/g, '/')
    .replace(/\.ts$/, '');
  return rp.startsWith('.') ? rp : `./${rp}`;
}

function pageDynamic(importLib) {
  return `import React from 'react';
import { prisma } from '${importLib}';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export default async function ActivityByIdPage({ params }: Params) {
  const { id } = await params;

  const [app, activity] = await Promise.all([
    prisma.application.findUnique({
      where: { id },
      select: { id: true, company: true, title: true, status: true  },
    }),
    prisma.applicationActivity.findMany({ where: { applicationId: id }, orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, payload: true, createdAt: true  },
    }),
  ]);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Tracker Activity</h1>
      <p style={{ marginBottom: 20, color: '#666' }}>Dynamic id: <code>{id}</code></p>

      {!app ? (
        <p style={{ color: '#b00' }}>No application found for this id.</p>
      ) : (
        <section>
          <div style={{ marginBottom: 16 }}>
            <div><strong>Company:</strong> {app.company}</div>
            <div><strong>Role:</strong> {app.role}</div>
            <div><strong>Status:</strong> {app.status}</div>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Activity</h2>
          {activity.length === 0 ? (
            <p>— No activity yet —</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {activity.map((a) => (
                <li key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                  <div>
                    <strong>{a.type}</strong>{' '}
                    <time suppressHydrationWarning dateTime={new Date(a.createdAt).toISOString()}>
                      {new Date(a.createdAt).toLocaleString()}
                    </time>
                  </div>
                  {a.payload && (
                    <pre style={{ margin: '6px 0 0', background: '#fafafa', padding: 8, border: '1px solid #eee', borderRadius: 6, overflowX: 'auto' }}>
                      {JSON.stringify(a.payload, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
`;
}

function pageQuery(importLib) {
  return `import React from 'react';
import Link from 'next/link';
import { prisma } from '${importLib}';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ id?: string | string[] }> };

export default async function ActivityByQueryPage({ searchParams }: Props) {
  const sp = await searchParams;
  const idRaw = sp?.id;
  const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
  const idTrim = id?.toString().trim();

  if (!idTrim) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Tracker Activity</h1>
        <p style={{ marginBottom: 12 }}>Provide an <code>?id=...</code> in the URL.</p>
        <p>Example: <code>/tracker/activity?id=YOUR_APP_ID</code></p>
      </main>
    );
  }

  const [app, activity] = await Promise.all([
    prisma.application.findUnique({
      where: { id: idTrim },
      select: { id: true, company: true, title: true, status: true  },
    }),
    prisma.applicationActivity.findMany({ where: { applicationId: idTrim }, orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, payload: true, createdAt: true  },
    }),
  ]);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Tracker Activity</h1>
      <p style={{ marginBottom: 20, color: '#666' }}>Querystring id: <code>{idTrim}</code></p>

      <p style={{ marginBottom: 16 }}>
        Also try the dynamic route:{' '}
        <Link href={\`/tracker/\${idTrim}/activity\`} style={{ color: '#06f' }}>
          /tracker/{'{'}id{'}'}/activity
        </Link>
      </p>

      {!app ? (
        <p style={{ color: '#b00' }}>No application found for this id.</p>
      ) : (
        <section>
          <div style={{ marginBottom: 16 }}>
            <div><strong>Company:</strong> {app.company}</div>
            <div><strong>Role:</strong> {app.role}</div>
            <div><strong>Status:</strong> {app.status}</div>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Activity</h2>
          {activity.length === 0 ? (
            <p>— No activity yet —</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {activity.map((a) => (
                <li key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                  <div>
                    <strong>{a.type}</strong>{' '}
                    <time suppressHydrationWarning dateTime={new Date(a.createdAt).toISOString()}>
                      {new Date(a.createdAt).toLocaleString()}
                    </time>
                  </div>
                  {a.payload && (
                    <pre style={{ margin: '6px 0 0', background: '#fafafa', padding: 8, border: '1px solid #eee', borderRadius: 6, overflowX: 'auto' }}>
                      {JSON.stringify(a.payload, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
`;
}

async function addHydrationSuppressToLayout(layoutPath) {
  if (!fs.existsSync(layoutPath))
    return { changed: false, reason: 'layout.tsx not found' };
  let src = await fsp.readFile(layoutPath, 'utf8');
  // Add suppressHydrationWarning to <body> (or to <html> if you prefer)
  if (/\<body([^>]*)\>/.test(src) && !/suppressHydrationWarning/.test(src)) {
    src = src.replace(/\<body([^>]*)\>/, '<body$1 suppressHydrationWarning>');
    await fsp.writeFile(layoutPath, src, 'utf8');
    return { changed: true };
  }
  return { changed: false, reason: 'already present or body tag missing' };
}

async function writeFileWithBackup(filePath, contents) {
  await ensureDir(path.dirname(filePath));
  if (fs.existsSync(filePath)) {
    const bak = `${filePath}.bak.${Date.now()}`;
    await fsp.copyFile(filePath, bak);
    logI(`Backed up ${rel(filePath)} → ${rel(bak)}`);
  }
  await fsp.writeFile(filePath, contents, 'utf8');
  logOK(`wrote ${rel(filePath)}`);
}

async function seedOrFindAppId() {
  try {
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    const found = await p.application
      .findFirst({ select: { id: true }, orderBy: { updatedAt: 'desc' } })
      .catch(() => null);
    if (found?.id) {
      await p.$disconnect();
      return found.id;
    }
    const created = await p.application
      .create({
        data: {
          userId: 'dev-user',
          company: 'Acme Inc',
          role: 'Engineer',
          status: 'APPLIED',
        },
        select: { id: true },
      })
      .catch(() => null);
    if (created?.id) {
      // best-effort activity
      await p.applicationActivity
        ?.create?.({
          data: {
            applicationId: created.id,
            type: 'CREATE',
            payload: {
              data: {
                userId: 'dev-user',
                company: 'Acme Inc',
                role: 'Engineer',
                status: 'APPLIED',
              },
            },
          },
        })
        .catch(() => {});
    }
    await p.$disconnect();
    return created?.id ?? null;
  } catch {
    return null;
  }
}

async function fetchIfUp(url, timeoutMs = 2500) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return { status: res.status, url };
  } catch {
    return { status: 0, url };
  }
}

(async () => {
  try {
    const webRoot = await chooseWebRoot();
    logOK(`Web root: ${rel(webRoot)}`);

    const appDir = path.join(webRoot, 'app');
    const layoutPath = path.join(appDir, 'layout.tsx');
    const dynPath = path.join(
      appDir,
      'tracker',
      '[id]',
      'activity',
      'page.tsx'
    );
    const qryPath = path.join(appDir, 'tracker', 'activity', 'page.tsx');

    // Patch pages to Next 15 async params/searchParams & hydration-safe dates
    const importDyn = importPathToLib(dynPath, webRoot);
    const importQry = importPathToLib(qryPath, webRoot);

    await writeFileWithBackup(dynPath, pageDynamic(importDyn));
    await writeFileWithBackup(qryPath, pageQuery(importQry));

    // Suppress hydration mismatches from extensions on <body>
    const res = await addHydrationSuppressToLayout(layoutPath);
    if (res.changed)
      logOK(`added suppressHydrationWarning to ${rel(layoutPath)}`);
    else logI(`layout.tsx hydration suppression: ${res.reason}`);

    const id = await seedOrFindAppId();
    if (id) logOK(`Using Application id: ${id}`);
    else
      logW(
        'No Application id found/seeded (Prisma optional). You can still open the pages with an existing id.'
      );

    // Smoke check
    const dynUrl = `http://localhost:3000/tracker/${encodeURIComponent(
      id ?? 'YOUR_APP_ID'
    )}/activity`;
    const qryUrl = `http://localhost:3000/tracker/activity?id=${encodeURIComponent(
      id ?? 'YOUR_APP_ID'
    )}`;

    logI('Checking dev server on :3000 …');
    const ping = await fetchIfUp('http://localhost:3000/');
    if (ping.status === 0) {
      logW(
        'Dev server not reachable. Start it with: pnpm -w exec nx run web:serve'
      );
    } else {
      const [r1, r2] = await Promise.all([
        fetchIfUp(dynUrl),
        fetchIfUp(qryUrl),
      ]);
      (r1.status === 200 ? logOK : logW)(`HTTP ${r1.status} → ${r1.url}`);
      (r2.status === 200 ? logOK : logW)(`HTTP ${r2.status} → ${r2.url}`);
    }

    console.log('\nNext steps:');
    console.log(
      '  • Restart the dev server if it was running (so files are picked up).'
    );
    console.log('    pnpm -w exec nx run web:serve');
    console.log(`  • Open: ${qryUrl}`);
    console.log(`  • Open: ${dynUrl}`);
  } catch (e) {
    logX(e.stack || e.message);
    process.exit(1);
  }
})();
