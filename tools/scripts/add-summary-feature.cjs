#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const PATCH_SMOKE = process.argv.includes('--patch-smoke');
const root = process.cwd();

const filesTouched = [];

// Helpers
const rel = (...p) => path.join(root, ...p);
function read(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null; }
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  filesTouched.push(file);
}
function addLineOnce(file, line) {
  const cur = read(file) ?? '';
  if (!cur.includes(line)) {
    const next = (cur.endsWith('\n') || cur.length === 0) ? cur + line + '\n' : cur + '\n' + line + '\n';
    if (APPLY) write(file, next); else preview(file, next, cur);
    return true;
  }
  return false;
}
function preview(file, next, cur = null) {
  if (!cur) cur = read(file) ?? '';
  if (cur === next) return;
  console.log(`\n— ${file} (preview) —`);
  console.log(next);
}
function ensureFile(file, content) {
  const cur = read(file);
  if (cur === null) {
    if (APPLY) write(file, content); else preview(file, content, '');
    return true;
  }
  // already exists; keep it (idempotent)
  console.log(`= exists: ${path.relative(root, file)}`);
  return false;
}

// 1) Shared types
const sharedTypesDir = rel('shared', 'types', 'src');
const summaryTypesFile = rel('shared', 'types', 'src', 'summary.ts');
const summaryTypesSrc = `import { z } from 'zod';

export const StatusCountSchema = z.object({
  status: z.string(),
  count: z.number().int().nonnegative(),
});
export type StatusCount = z.infer<typeof StatusCountSchema>;

export const SourceCountSchema = z.object({
  source: z.string(),
  count: z.number().int().nonnegative(),
});
export type SourceCount = z.infer<typeof SourceCountSchema>;

export const TrendPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\\d{2}-\\d{2}$/), // YYYY-MM-DD
  count: z.number().int().nonnegative(),
});
export type TrendPoint = z.infer<typeof TrendPointSchema>;

export const LatestAppSchema = z.object({
  id: z.string(),
  company: z.string(),
  role: z.string(),
  status: z.string(),
  createdAt: z.date(),
});
export type LatestApp = z.infer<typeof LatestAppSchema>;

export const SummaryOverviewSchema = z.object({
  statusCounts: z.array(StatusCountSchema),
  sourceCounts: z.array(SourceCountSchema),
  recentTrend: z.array(TrendPointSchema),
  latest: z.array(LatestAppSchema),
});
export type SummaryOverview = z.infer<typeof SummaryOverviewSchema>;
`;

if (!fs.existsSync(sharedTypesDir)) {
  console.warn(`! Expected ${path.relative(root, sharedTypesDir)} to exist. Create the project if needed.`);
}
ensureFile(summaryTypesFile, summaryTypesSrc);

// barrel export
const sharedIndex = rel('shared', 'types', 'src', 'index.ts');
if (fs.existsSync(sharedIndex)) {
  addLineOnce(sharedIndex, `export * from './summary';`);
} else {
  console.warn(`! Missing shared/types/src/index.ts; skipping barrel export (types still usable by path).`);
}

// 2) API router: infer imports from tracker router
const routerDir = rel('apps', 'api', 'src', 'router');
const trackerRouter = rel('apps', 'api', 'src', 'router', 'tracker.ts');
if (!fs.existsSync(routerDir)) {
  console.warn(`! Expected ${path.relative(root, routerDir)} to exist. Adjust paths in this script if your layout differs.`);
}
const trackerSrc = read(trackerRouter) || '';
const trpcImportMatch =
  trackerSrc.match(/import\s*{\s*[^}]*publicProcedure[^}]*}\s*from\s*['"]([^'"]+)['"]/)
  || trackerSrc.match(/import\s*{\s*[^}]*t[^}]*}\s*from\s*['"]([^'"]+)['"]/);
const trpcImportPath = trpcImportMatch ? trpcImportMatch[1] : '../trpc/trpc';

const prismaNamedImport = trackerSrc.match(/import\s*{\s*prisma\s*}\s*from\s*['"]([^'"]+)['"]/);
const prismaClientImport = trackerSrc.match(/import\s*{\s*PrismaClient\s*}\s*from\s*['"]@prisma\/client['"]/);

let prismaImportBlock = `import { prisma } from '../prisma';`;
let prismaPreamble = '';
if (prismaNamedImport) {
  prismaImportBlock = `import { prisma } from '${prismaNamedImport[1]}';`;
} else if (prismaClientImport) {
  prismaImportBlock = `import { PrismaClient } from '@prisma/client';`;
  prismaPreamble = `const prisma = new PrismaClient();\n`;
}

const summaryRouterFile = rel('apps', 'api', 'src', 'router', 'summary.ts');
const summaryRouterSrc = `import { z } from 'zod';
${prismaImportBlock}
import { t, publicProcedure } from '${trpcImportPath}';
import { SummaryOverviewSchema } from '@careeros/types';

${prismaPreamble}const InputSchema = z.object({
  userId: z.string().min(1),
});

export const summaryRouter = t.router({
  overview: publicProcedure
    .input(InputSchema)
    .output(SummaryOverviewSchema)
    .query(async ({ input }) => {
      const { userId } = input;

      const statusGrp = await prisma.application.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      });
      const statusCounts = statusGrp.map((g) => ({
        status: g.status as unknown as string,
        count: g._count._all,
      }));

      const sourceGrp = await prisma.application.groupBy({
        by: ['source'],
        where: { userId },
        _count: { _all: true },
      });
      const sourceCounts = sourceGrp.map((g) => ({
        source: g.source as unknown as string,
        count: g._count._all,
      }));

      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recent = await prisma.application.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { createdAt: true },
      });
      const trendMap = new Map<string, number>();
      for (const r of recent) {
        const d = r.createdAt.toISOString().slice(0, 10);
        trendMap.set(d, (trendMap.get(d) ?? 0) + 1);
      }
      const days: string[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        days.push(d);
      }
      const recentTrend = days.map((d) => ({ date: d, count: trendMap.get(d) ?? 0 }));

      const latestRaw = await prisma.application.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, company: true, role: true, status: true, createdAt: true },
      });
      const latest = latestRaw.map((a) => ({ ...a, status: a.status as unknown as string }));

      return { statusCounts, sourceCounts, recentTrend, latest };
    }),
});
`;

ensureFile(summaryRouterFile, summaryRouterSrc);

// 2b) Wire into appRouter (find file exporting appRouter = t.router({ ... }))
const candidateAppRouters = [
  rel('apps', 'api', 'src', 'trpc.ts'),
  rel('apps', 'api', 'src', 'router', 'index.ts'),
  rel('apps', 'api', 'src', 'index.ts'),
];
let appRouterPath = null;
let appRouterSrc = null;
for (const f of candidateAppRouters) {
  const s = read(f);
  if (s && /export\s+const\s+appRouter\s*=\s*t\.router\(\s*{/.test(s)) {
    appRouterPath = f; appRouterSrc = s; break;
  }
}
if (!appRouterPath) {
  console.warn('! Could not find appRouter file (looked in apps/api/src/trpc.ts and router/index.ts). Skipping wiring.');
} else {
  let src = appRouterSrc;
  // Insert import
  const importLine = src.includes(`from './router/summary'`)
    ? null
    : `import { summaryRouter } from '${path.relative(path.dirname(appRouterPath), summaryRouterFile).replace(/\\/g,'/').replace(/\.ts$/,'')}';`;
  if (importLine) {
    src = importLine + '\n' + src;
  }
  // Add property if missing
  if (!/summary\s*:\s*summaryRouter/.test(src)) {
    src = src.replace(/(export\s+const\s+appRouter\s*=\s*t\.router\(\s*{\s*)/,
      `$1\n  summary: summaryRouter,\n`);
  }
  if (APPLY) write(appRouterPath, src); else preview(appRouterPath, src, appRouterSrc);
}

// 3) Web page
const webPageFile = rel('web', 'src', 'app', 'summary', 'page.tsx');
const webPageSrc = `'use client';

import { useState } from 'react';
import { trpc } from '@/src/trpc';
import { format } from 'date-fns';

export default function SummaryPage() {
  const [userId] = useState('demo-user');
  const { data, isLoading, error } = trpc.summary.overview.useQuery({ userId });

  if (isLoading) return <div className="p-6">Loading summary…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error.message}</div>;
  if (!data) return <div className="p-6">No data.</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Summary</h1>

      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {data.statusCounts.map((s) => (
          <div key={s.status} className="rounded-2xl border p-4 shadow-sm">
            <div className="text-sm text-gray-500">{s.status}</div>
            <div className="text-2xl font-bold">{s.count}</div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Latest applications</h2>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.latest.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-3 py-2">{a.company}</td>
                  <td className="px-3 py-2">{a.role}</td>
                  <td className="px-3 py-2">{a.status}</td>
                  <td className="px-3 py-2">{format(a.createdAt, 'yyyy-MM-dd')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Last 30 days</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-sm">
          {data.recentTrend.slice(-12).map((d) => (
            <div key={d.date} className="rounded-xl border p-2 flex items-center justify-between">
              <span className="text-gray-600">{d.date.slice(5)}</span>
              <span className="font-semibold">{d.count}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
`;
ensureFile(webPageFile, webPageSrc);

// 4) Optionally patch smoke/ping scripts
if (PATCH_SMOKE) {
  const smoke = rel('tools', 'scripts', 'trpc-smoke.cjs');
  const ping = rel('tools', 'scripts', 'ping-trpc.cjs');
  const s1 = read(smoke);
  if (s1 && !/summary\.overview/.test(s1)) {
    const injected = s1.replace(/(\}\);\s*\n?\}\)\(\);?\s*$)/s,
`  console.log('→ QUERY summary.overview');
  const sum = await client.summary.overview.query({ userId: 'demo-user' });
  console.log(JSON.stringify(sum, null, 2));
$1`);
    if (APPLY) write(smoke, injected); else preview(smoke, injected, s1);
  }
  const s2 = read(ping);
  if (s2 && !/summary\.overview/.test(s2)) {
    const injected = s2.replace(/(\}\n?\)\(\);?\s*$)/s,
`\n  console.log('→ QUERY summary.overview (GET)');
  console.log(await queryGET('summary.overview', { userId: 'demo-user' }));\n$1`);
    if (APPLY) write(ping, injected); else preview(ping, injected, s2);
  }
}

// Done
console.log(`\n${APPLY ? '✓ Applied' : 'ⓘ Dry-run only'}${PATCH_SMOKE ? ' (with smoke patches)' : ''}.`);
if (filesTouched.length) {
  console.log('Touched files:');
  for (const f of filesTouched) console.log(' -', path.relative(root, f));
} else {
  console.log('No changes were needed.');
}
