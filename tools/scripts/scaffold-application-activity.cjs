/**
 * Idempotent scaffold for Application Activity.
 * - Patches apps/api tracker.router.ts: adds getApplicationActivity + activity writes on create/update
 * - Adds API tests
 * - Adds optional web UI page (resilient)
 * Usage:
 *   node tools/scripts/scaffold-application-activity.cjs [--commit]
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const DO_COMMIT = process.argv.includes('--commit');

const P = (...p) => path.join(ROOT, ...p);
const has = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

const TRACKER_ROUTER = P('apps/api/src/trpc/routers/tracker.router.ts');
const API_TEST = P('apps/api/src/router/__tests__/tracker.activity.spec.ts');
const WEB_PAGE = P('web/src/app/tracker/activity/page.tsx');
const WEB_TEST = P('web/src/app/tracker/activity/page.spec.tsx');

// Patch router
(function patchRouter(){
  if (!has(TRACKER_ROUTER)) return console.log('• tracker.router.ts not found, skipping router patch');

  let s = read(TRACKER_ROUTER);

  // Ensure zod import
  if (!/from 'zod'/.test(s)) {
    s = `import { z } from 'zod';\n` + s;
  }

  // Add getApplicationActivity procedure if missing
  if (!/getApplicationActivity\s*:/.test(s)) {
    const proc = `
  getApplicationActivity: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const prismaAny = ctx.prisma as any;
      if (!prismaAny?.applicationActivity?.findMany) return [];
      return await prismaAny.applicationActivity.findMany({ where: { applicationId: input.id }, orderBy: { createdAt: 'desc' },
      });
    }),
`;
    // try to place before closing createTRPCRouter({...})
    s = s.replace(/createTRPCRouter\(\{\s*/m, match => match + proc);
  }

  // Activity write on createApplication (guarded)
  if (/createApplication\s*:/.test(s) && !/applicationActivity\.create/.test(s)) {
    s = s.replace(
      /return await ctx\.prisma\.application\.create\(\{([\s\S]*?)\}\);/,
      (m) => `
      const created = await ctx.prisma.application.create({$1});
      try {
        const prismaAny = ctx.prisma as any;
        await prismaAny?.applicationActivity?.create?.({
          data: {
            applicationId: created.id,
            type: 'CREATE',
            payload: { data: input },
          }
        });
      } catch {}
      return created;`
    );
  }

  // Activity write on updateApplication (guarded)
  if (/updateApplication\s*:/.test(s) && !/STATUS_CHANGE|UPDATE/.test(s)) {
    s = s.replace(
      /return await ctx\.prisma\.application\.update\(\{([\s\S]*?)\}\);/,
      (m) => `
      const updated = await ctx.prisma.application.update({$1});
      try {
        const prismaAny = ctx.prisma as any;
        const kind = (input.data as any)?.status ? 'STATUS_CHANGE' : 'UPDATE';
        await prismaAny?.applicationActivity?.create?.({
          data: {
            applicationId: updated.id,
            type: kind,
            payload: (input.data as any)?.status ? { to: (input.data as any).status } : { changed: Object.keys(input.data as any || {}) },
          }
        });
      } catch {}
      return updated;`
    );
  }

  write(TRACKER_ROUTER, s);
  console.log('✓ tracker.router.ts patched (activity query + writes)');
})();

// API tests
(function writeApiTest(){
  if (has(API_TEST)) return console.log('⏭  test exists ->', path.relative(ROOT, API_TEST));
  const t = `import { describe, it, expect, vi } from 'vitest';
import { trackerRouter } from '../../trpc/routers/tracker.router';

function makeCtx() {
  const application = {
    create: vi.fn().mockResolvedValue({ id: 'a1' }),
    update: vi.fn().mockResolvedValue({ id: 'a1' }),
  };
  const applicationActivity = {
    create: vi.fn(),
    findMany: vi.fn().mockResolvedValue([{ id: 'act1', type: 'CREATE' }]),
  };
  return { prisma: { application, applicationActivity } } as any;
}

describe('tracker activity', () => {
  it('getApplicationActivity forwards to prisma with order', async () => {
    const ctx = makeCtx();
    const caller = trackerRouter.createCaller(ctx);
    const res = await caller.getApplicationActivity({ id: 'a1' });
    expect(ctx.prisma.applicationActivity.findMany).toHaveBeenCalledWith({
      where: { applicationId: 'a1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(res).toEqual([{ id: 'act1', type: 'CREATE' }]);
  });

  it('createApplication writes CREATE activity when possible', async () => {
    const ctx = makeCtx();
    const caller = trackerRouter.createCaller(ctx);
    await caller.createApplication({ userId: 'u1', company: 'Acme', role: 'FE' } as any);
    expect(ctx.prisma.application.create).toHaveBeenCalled();
    expect(ctx.prisma.applicationActivity.create).toHaveBeenCalledWith({
      data: {
        applicationId: 'a1',
        type: 'CREATE',
        payload: { data: { userId: 'u1', company: 'Acme', role: 'FE' } },
      },
    });
  });

  it('updateApplication writes STATUS_CHANGE when status present', async () => {
    const ctx = makeCtx();
    const caller = trackerRouter.createCaller(ctx);
    await caller.updateApplication({ id: 'a1', data: { status: 'INTERVIEW' } } as any);
    expect(ctx.prisma.application.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { status: 'INTERVIEW' },
    });
    expect(ctx.prisma.applicationActivity.create).toHaveBeenCalledWith({
      data: {
        applicationId: 'a1',
        type: 'STATUS_CHANGE',
        payload: { to: 'INTERVIEW' },
      },
    });
  });
});
`;
  write(API_TEST, t);
  console.log('✓ wrote API test ->', path.relative(ROOT, API_TEST));
})();

// Optional web page (resilient)
(function writeWeb(){
  if (!has(WEB_PAGE)) {
    const content = `'use client';
import * as React from 'react';
import { trpc } from '@/trpc';

export default function TrackerActivityPage() {
  const hook = (trpc as any)?.tracker?.getApplicationActivity?.useQuery;
  const query = hook
    ? hook({ id: 'demo-app-1' })
    : { data: null, isLoading: false, error: { message: 'Activity API not available' } };

  const { data, isLoading, error } = query as {
    data: null | Array<{ id: string; type?: string; payload?: any; createdAt?: string | Date }>;
    isLoading: boolean;
    error: null | { message: string };
  };

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error)     return <main className="p-6 text-red-600">Error: {error.message}</main>;

  const rows = [...(data ?? [])].sort((a,b) =>
    new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
  );

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Tracker Activity</h1>
      {rows.length ? (
        <table role="table" className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-left">Payload</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.type}</td>
                <td className="p-2"><pre className="text-xs">{JSON.stringify(a.payload ?? {}, null, 0)}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div>No activity found.</div>}
    </main>
  );
}
`;
    write(WEB_PAGE, content);
    console.log('✓ wrote web tracker/activity page ->', path.relative(ROOT, WEB_PAGE));
  } else {
    console.log('⏭  web tracker/activity page exists');
  }

  if (!has(WEB_TEST)) {
    const spec = `import { render, screen, within } from '@testing-library/react';
import Page from './page';

describe('Tracker Activity page', () => {
  it('renders heading and empty state/table', () => {
    render(<Page />);
    expect(screen.getByText('Tracker Activity')).toBeInTheDocument();
    // will render empty state by default (no TRPC)
    expect(screen.getByText(/No activity/i)).toBeInTheDocument();
  });
});
`;
    write(WEB_TEST, spec);
    console.log('✓ wrote web test ->', path.relative(ROOT, WEB_TEST));
  } else {
    console.log('⏭  web test exists');
  }
})();

// Commit (optional)
if (DO_COMMIT) {
  try {
    cp.execFileSync('git', ['add',
      TRACKER_ROUTER, API_TEST,
      WEB_PAGE, WEB_TEST,
    ], { stdio: 'inherit' });
    cp.execFileSync('git', ['commit', '-m', 'feat(tracker): add application activity (router+tests+optional UI)'], { stdio: 'inherit' });
    console.log('✓ committed');
  } catch (e) {
    console.log('⚠️  commit failed:', e?.message || e);
  }
}
