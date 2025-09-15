#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const ROOT = process.cwd();
const WEB_DIR = path.join(ROOT, 'apps', 'web');

// ---- tiny helpers ----------------------------------------------------------
const ok = (m) => console.log(`• ${m}`);
const wrote = (m) => console.log(`✓ ${m}`);
const warn = (m) => console.log(`\x1b[33m! ${m}\x1b[0m`);
function ensureFile(file, content, display) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim() === content.trim()) {
    ok(`${display} already present (ok)`);
    return;
  }
  fs.writeFileSync(file, content);
  wrote(`wrote ${display}`);
}
function openUrl(url) {
  const cmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

// ---- content ---------------------------------------------------------------
const PROVIDERS_TSX = `/* eslint-disable react-refresh/only-export-components */
'use client';
import React from 'react';
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
`;

const LAYOUT_TSX = `import React from 'react';
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
`;

const HOME_PAGE_TSX = `export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>CareerOS</h1>
      <p>Try: <code>/tracker/activity?id=&lt;application-id&gt;</code> or <code>/tracker/[id]/activity</code>.</p>
    </main>
  );
}
`;

const TRPC_STUB_INDEX = `export * from './react';\n`;
const TRPC_STUB_REACT = `// Local-only TRPC stub to satisfy "@/trpc/react" imports.
export const api = {
  tracker: {
    getApplicationActivity: async (_: { id: string }) => {
      return [] as Array<{ id?: string; type: string; payload?: any; createdAt?: string }>;
    },
  },
};
`;

const PAGE_ACTIVITY_BY_ID = `import React from 'react';

export default async function TrackerActivityByIdPage({ params }: { params: { id: string } }) {
  return (
    <main style={{ padding: 24 }}>
      <h1>Tracker Activity</h1>
      <p>Activity API not available — <strong>No activity</strong></p>
      <p style={{ marginTop: 12, opacity: 0.7 }}>Application ID: <code>{params.id}</code></p>
    </main>
  );
}
`;

const PAGE_ACTIVITY_QS = `import React from 'react';

export default async function TrackerActivityPage({ searchParams }: { searchParams: { id?: string } }) {
  const id = searchParams?.id;
  return (
    <main style={{ padding: 24 }}>
      <h1>Tracker Activity</h1>
      <p>Activity API not available — <strong>No activity</strong></p>
      {!id ? (
        <p style={{ marginTop: 12, opacity: 0.7 }}>
          Provide <code>?id=&lt;application-id&gt;</code> or use <code>/tracker/[id]/activity</code>.
        </p>
      ) : (
        <p style={{ marginTop: 12, opacity: 0.7 }}>Application ID: <code>{id}</code></p>
      )}
    </main>
  );
}
`;

// write the same files into both app roots
const APP_ROOTS = [
  path.join(WEB_DIR, 'src', 'app'),
  path.join(WEB_DIR, 'app'),
];

function scaffoldAllAppRoots() {
  for (const root of APP_ROOTS) {
    ensureFile(path.join(root, 'providers.tsx'), PROVIDERS_TSX, relDisp(root, 'providers.tsx'));
    ensureFile(path.join(root, 'layout.tsx'), LAYOUT_TSX, relDisp(root, 'layout.tsx'));
    ensureFile(path.join(root, 'page.tsx'), HOME_PAGE_TSX, relDisp(root, 'page.tsx'));
    ensureFile(path.join(root, 'tracker', '[id]', 'activity', 'page.tsx'), PAGE_ACTIVITY_BY_ID, relDisp(root, 'tracker/[id]/activity/page.tsx'));
    ensureFile(path.join(root, 'tracker', 'activity', 'page.tsx'), PAGE_ACTIVITY_QS, relDisp(root, 'tracker/activity/page.tsx'));
  }
}

function relDisp(root, tail) {
  return path.relative(WEB_DIR, path.join(root, tail)).replace(/\\/g, '/');
}

// ---- prisma seeding --------------------------------------------------------
async function seed() {
  let PrismaClient;
  try {
    ({ PrismaClient } = require('@prisma/client'));
  } catch {
    warn('@prisma/client not ready. If this fails, run `pnpm -w build` once.');
    return { id: '' };
  }
  const p = new PrismaClient();
  try {
    const existing = await p.application.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);

    let id = existing?.id;
    if (!id) {
      try {
        const created = await p.application.create({ data: {}, select: { id: true } });
        id = created.id;
      } catch {
        const created = await p.application.create({
          data: { notes: 'Seeded via dev-activity script' },
          select: { id: true },
        });
        id = created.id;
      }
    }

    const cnt = await p.applicationActivity.count({ where: { applicationId: id } }).catch(() => 0);
    if (cnt === 0) {
      await p.applicationActivity.create({
        data: { applicationId: id, type: 'CREATE', payload: { data: { status: 'APPLIED' } } },
      }).catch(() => {});
      await p.applicationActivity.create({
        data: { applicationId: id, type: 'STATUS_CHANGE', payload: { to: 'INTERVIEW' } },
      }).catch(() => {});
    }

    wrote(`seeded Application: ${id}`);
    return { id };
  } finally {
    await p.$disconnect();
  }
}

// ---- TRPC stub -------------------------------------------------------------
function ensureTrpcStub() {
  const trpcDir = path.join(WEB_DIR, 'src', 'trpc');
  ensureFile(path.join(trpcDir, 'react.ts'), TRPC_STUB_REACT, 'apps/web/src/trpc/react.ts');
  ensureFile(path.join(trpcDir, 'index.ts'), TRPC_STUB_INDEX, 'apps/web/src/trpc/index.ts');
}

// ---- main ------------------------------------------------------------------
(async () => {
  ensureTrpcStub();
  scaffoldAllAppRoots();
  const { id } = await seed();

  const url = id
    ? `http://localhost:3000/tracker/${id}/activity`
    : `http://localhost:3000/tracker/activity?id=<an-existing-application-id>`;

  console.log('\n> nx run web:serve --filter ./apps/web\n');
  const child = spawn('pnpm', ['-w', 'exec', 'nx', 'run', 'web:serve', '--filter', './apps/web'], {
    stdio: 'inherit',
    shell: true,
  });

  console.log(`→ Opening Activity: ${url}`);
  setTimeout(() => openUrl(url), 3500);

  child.on('close', (code) => process.exit(code ?? 0));
})();
