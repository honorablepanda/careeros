#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * Auto-wires Activity pages + Prisma singleton and verifies routes.
 *
 * What it does:
 * 1) Detects web project root (prefers "./web", falls back to "./apps/web").
 * 2) Writes:
 *    - <webRoot>/lib/prisma.ts
 *    - <webRoot>/app/tracker/[id]/activity/page.tsx
 *    - <webRoot>/app/tracker/activity/page.tsx
 *    (backs up any existing files with ".bak.<timestamp>")
 * 3) Seeds a minimal Application + CREATE activity (best-effort).
 * 4) If dev server is running on :3000, smoke-tests both URLs.
 *
 * Usage:
 *   node tools/scripts/auto-wire-activity.cjs
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { setTimeout: delay } = require('timers/promises');

const ROOT = process.cwd();

// --------------------------- helpers ---------------------------------

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function logOK(msg) {
  console.log(`✓ ${msg}`);
}
function logInfo(msg) {
  console.log(`• ${msg}`);
}
function logWarn(msg) {
  console.log(`! ${msg}`);
}
function logErr(msg) {
  console.log(`✗ ${msg}`);
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function writeFileWithBackup(targetPath, contents) {
  const exists = fs.existsSync(targetPath);
  if (exists) {
    const bak = `${targetPath}.bak.${stamp()}`;
    await fsp.copyFile(targetPath, bak);
    logInfo(`Backed up ${rel(targetPath)} → ${rel(bak)}`);
  }
  await ensureDir(path.dirname(targetPath));
  await fsp.writeFile(targetPath, contents, 'utf8');
  logOK(`wrote ${rel(targetPath)}`);
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

async function chooseWebRoot() {
  const webA = path.join(ROOT, 'web');
  const webB = path.join(ROOT, 'apps', 'web');
  if (fs.existsSync(webA)) return webA;
  if (fs.existsSync(webB)) return webB;
  throw new Error(
    'Could not find "web" project (looked for ./web and ./apps/web).'
  );
}

function routeImportToLib(fromFile, webRoot) {
  // We’ll import from "<webRoot>/lib/prisma" using a relative path.
  const fromDir = path.dirname(fromFile);
  const to = path.join(webRoot, 'lib', 'prisma.ts');
  const relPath = path.relative(fromDir, to).replace(/\\/g, '/');
  // remove .ts and ensure no leading './' weirdness
  return relPath.replace(/\.ts$/, '').replace(/^([^./])/, './$1');
}

async function trySeed(appIdHint) {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    // If caller passed a known id, use it; else, try to find an existing application or create one
    let app = null;

    if (appIdHint) {
      app = await prisma.application.findUnique({
        where: { id: appIdHint },
        select: { id: true },
      });
    }
    if (!app) {
      app = await prisma.application.findFirst({ select: { id: true } });
    }
    if (!app) {
      // Create with minimal likely fields; adjust if your schema requires different ones.
      app = await prisma.application.create({
        data: {
          userId: 'dev-user',
          company: 'Acme Inc',
          role: 'Engineer',
          status: 'APPLIED',
        },
        select: { id: true },
      });
      // Best-effort activity row (if model exists)
      try {
        await prisma.applicationActivity.create({
          data: {
            applicationId: app.id,
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
        });
      } catch (e) {
        logWarn(
          `Could not create ApplicationActivity (optional): ${e.message}`
        );
      }
    }

    await prisma.$disconnect();
    return app?.id ?? null;
  } catch (e) {
    logWarn(
      `Prisma seed skipped (client not available or schema mismatch): ${e.message}`
    );
    return null;
  }
}

async function fetchIfUp(url, timeoutMs = 2000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    // Node 18+ has global fetch
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return { ok: true, status: res.status, url };
  } catch (e) {
    return { ok: false, status: 0, url, error: e.message };
  }
}

// --------------------------- file contents ---------------------------

function prismaTs() {
  return `import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma =
  g.__prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  g.__prisma = prisma;
}
`;
}

function pageDynamicTsx(importPathToLib) {
  return `import React from 'react';
import { prisma } from '${importPathToLib}';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export default async function ActivityByIdPage({ params }: Params) {
  const id = params.id;

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
                  <div><strong>{a.type}</strong> <span style={{ color: '#888' }}>{new Date(a.createdAt).toLocaleString()}</span></div>
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

function pageQueryTsx(importPathToLib) {
  return `import React from 'react';
import Link from 'next/link';
import { prisma } from '${importPathToLib}';

export const dynamic = 'force-dynamic';

type Props = { searchParams?: { id?: string } };

export default async function ActivityByQueryPage({ searchParams }: Props) {
  const id = searchParams?.id?.trim();

  if (!id) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Tracker Activity</h1>
        <p style={{ marginBottom: 12 }}>Provide an <code>?id=...</code> in the URL.</p>
        <p>
          Example: <code>/tracker/activity?id=YOUR_APP_ID</code>
        </p>
      </main>
    );
  }

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
      <p style={{ marginBottom: 20, color: '#666' }}>Querystring id: <code>{id}</code></p>

      <p style={{ marginBottom: 16 }}>
        Also try the dynamic route:{' '}
        <Link href={\`/tracker/\${id}/activity\`} style={{ color: '#06f' }}>
          /tracker/{id}/activity
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
                  <div><strong>{a.type}</strong> <span style={{ color: '#888' }}>{new Date(a.createdAt).toLocaleString()}</span></div>
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

// --------------------------- main ------------------------------------

(async () => {
  try {
    // 1) Locate web root
    const webRoot = await chooseWebRoot();
    logOK(`Web root: ${rel(webRoot)}`);

    // 2) Decide app dir and lib path
    const appDir = path.join(webRoot, 'app');
    const libDir = path.join(webRoot, 'lib');
    await ensureDir(appDir);
    await ensureDir(libDir);

    // 3) Write prisma singleton
    const prismaPath = path.join(libDir, 'prisma.ts');
    await writeFileWithBackup(prismaPath, prismaTs());

    // 4) Wire activity pages
    const dynPage = path.join(
      appDir,
      'tracker',
      '[id]',
      'activity',
      'page.tsx'
    );
    const qryPage = path.join(appDir, 'tracker', 'activity', 'page.tsx');

    const importDyn = routeImportToLib(dynPage, webRoot); // likely ../../../../lib/prisma
    const importQry = routeImportToLib(qryPage, webRoot); // likely ../../../lib/prisma

    await writeFileWithBackup(dynPage, pageDynamicTsx(importDyn));
    await writeFileWithBackup(qryPage, pageQueryTsx(importQry));

    // 5) Seed (best-effort)
    const seededId = await trySeed();
    if (seededId) {
      logOK(`Seeded or found Application: ${seededId}`);
    } else {
      logWarn(
        'Could not seed/find an Application id. You can still test with an existing id.'
      );
    }

    // 6) Smoke test if dev server is up on :3000
    const testId = seededId ?? 'YOUR_APP_ID';
    const urlDynamic = `http://localhost:3000/tracker/${encodeURIComponent(
      testId
    )}/activity`;
    const urlQuery = `http://localhost:3000/tracker/activity?id=${encodeURIComponent(
      testId
    )}`;

    logInfo('Checking if dev server is up on http://localhost:3000 …');
    const ping = await fetchIfUp('http://localhost:3000/', 1500);
    if (!ping.ok && ping.status === 0) {
      logWarn(
        'Dev server not reachable. Start it:  pnpm -w exec nx run web:serve'
      );
    } else {
      logInfo('Dev server reachable, smoke-testing routes …');
      // Let it warm up slightly
      await delay(400);

      const [r1, r2] = await Promise.all([
        fetchIfUp(urlDynamic, 4000),
        fetchIfUp(urlQuery, 4000),
      ]);
      (r1.status === 200 ? logOK : logWarn)(`HTTP ${r1.status} → ${r1.url}`);
      (r2.status === 200 ? logOK : logWarn)(`HTTP ${r2.status} → ${r2.url}`);
    }

    console.log('\n=== Next steps ===');
    console.log(
      `• Start dev server (if not running): pnpm -w exec nx run web:serve`
    );
    console.log(`• Open: ${urlQuery}`);
    console.log(`• Open: ${urlDynamic}`);
    console.log(
      '• If you still see no activity, create/update an Application via your API to generate rows, then refresh.'
    );
  } catch (e) {
    logErr(e.stack || e.message);
    process.exit(1);
  }
})();
