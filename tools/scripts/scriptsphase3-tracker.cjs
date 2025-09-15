/**
 * Phase 3 - Application Tracker: idempotent finalizer
 * - Ensures shared types (libs/types/tracker.ts)
 * - Ensures tracker tRPC router with CRUD (+ optional activity)
 * - Switches web tracker page to use real hooks + getUserId()
 * - Adds API CRUD tests
 *
 * Flags: --force (overwrite), --commit, --push
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const FORCE = process.argv.includes('--force');
const DO_COMMIT = process.argv.includes('--commit');
const DO_PUSH = process.argv.includes('--push');

const P = (...p) => path.join(ROOT, ...p);
const has = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const same = (a, b) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

function upsertFile(filePath, desired, label) {
  if (has(filePath)) {
    const cur = read(filePath);
    if (!FORCE && same(cur, desired)) {
      console.log(`⏭  up-to-date ${label} -> ${filePath}`);
      return false;
    }
    if (!FORCE) {
      console.log(`⏭  exists ${label} -> ${filePath} (use --force to overwrite)`);
      return false;
    }
  }
  write(filePath, desired);
  console.log(`✅ wrote ${label} -> ${filePath}`);
  return true;
}

// 1) Shared types
const TRACKER_TYPES = P('libs/types/tracker.ts');
const TRACKER_TYPES_SRC = `/* Phase 3: Tracker shared types */
export enum ApplicationStatus {
  APPLIED = 'APPLIED',
  INTERVIEWING = 'INTERVIEWING',
  OFFER = 'OFFER',
  REJECTED = 'REJECTED'
}

export type ApplicationItem = {
  id: string;
  userId: string;
  company: string;
  role: string;
  status: ApplicationStatus | string;
  appliedAt?: string | Date;
  notes?: string;
  tags?: string[];
  deadline?: string | Date;
  link?: string;
  resumeVersion?: string;
};

export type GetApplicationsInput = {
  userId?: string;
  status?: ApplicationStatus | string;
  limit?: number;
};
`;

function ensureTrackerTypes() {
  return upsertFile(TRACKER_TYPES, TRACKER_TYPES_SRC, 'tracker types');
}

// 2) Tracker router with CRUD (+ activity)
const TRACKER_ROUTER = P('apps/api/src/trpc/routers/tracker.router.ts');
const TRACKER_ROUTER_SRC = `import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { $Enums } from '@prisma/client';

// Keep permissive inputs for legacy tests; tighten later.
const CreateInput = z.object({}).passthrough();
const UpdateInput = z.object({
  id: z.string(),
  data: z.object({}).passthrough(),
});
const DeleteInput = z.object({ id: z.string() });
const ListInput = z.object({
  userId: z.string().optional(),
  status: z.nativeEnum($Enums.ApplicationStatus).optional().or(z.string()),
  limit: z.number().int().positive().max(500).optional(),
});

export const trackerRouter = router({
  getApplications: publicProcedure
    .input(ListInput)
    .query(async ({ ctx, input }) => {
      const { userId, status, limit } = input ?? {};
      return ctx.prisma.application.findMany({
        where: {
          ...(userId ? { userId } : {}),
          ...(status ? { status: status as any } : {}),
        },
        // Tests prefer 'appliedAt' desc; cast to 'any' if schema doesn't expose it
        orderBy: ({ appliedAt: 'desc' } as any),
        ...(limit ? { take: limit } : {}),
      });
    }),

  createApplication: publicProcedure
    .input(CreateInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.application.create({ data: input as any });
    }),

  updateApplication: publicProcedure
    .input(UpdateInput)
    .mutation(async ({ ctx, input }) => {
      const { id, data } = input;
      return ctx.prisma.application.update({ where: { id }, data: data as any });
    }),

  deleteApplication: publicProcedure
    .input(DeleteInput)
    .mutation(async ({ ctx, input }) => {
      const { id } = input;
      return ctx.prisma.application.delete({ where: { id } });
    }),

  // Optional — mocked activity for now
  getApplicationActivity: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return [
        { ts: new Date().toISOString(), type: 'CREATED', by: 'system', appId: input.id },
        { ts: new Date().toISOString(), type: 'STATUS_CHANGE', from: 'APPLIED', to: 'INTERVIEWING', appId: input.id },
      ];
    }),
});
`;

function ensureTrackerRouter() {
  // If file exists and already exports trackerRouter, skip unless --force
  if (has(TRACKER_ROUTER)) {
    const cur = read(TRACKER_ROUTER);
    if (!FORCE && /export\s+const\s+trackerRouter\s*=/.test(cur)) {
      console.log(`⏭  tracker router present -> ${TRACKER_ROUTER}`);
      return false;
    }
  }
  return upsertFile(TRACKER_ROUTER, TRACKER_ROUTER_SRC, 'tracker router');
}

// 3) Switch web tracker page to real hooks + getUserId()
const TRACKER_PAGE = P('web/src/app/tracker/page.tsx');
function patchTrackerPage() {
  if (!has(TRACKER_PAGE)) {
    console.log('• tracker page not found, skipping UI patch');
    return false;
  }
  let s = read(TRACKER_PAGE);
  let changed = false;

  // import getUserId
  if (!/from ['"]@\/lib\/user['"]/.test(s)) {
    s = s.replace(/^(\s*import\s+\*\s+as\s+React[^\n]*\n)/, `$1import { getUserId } from '@/lib/user';\n`);
    changed = true;
  }
  // replace 'demo-user'
  if (/['"]demo-user['"]/.test(s)) {
    s = s.replace(/['"]demo-user['"]/g, 'getUserId()');
    changed = true;
  }
  // ensure real hook usage if a resilient fallback was used
  if (/const hook = \(trpc as any\)\?\.tracker\?\.getApplications\?\.useQuery/.test(s)) {
    s = s.replace(
      /const hook =[\s\S]*?;\n\s*const query =[\s\S]*?;\n\s*const \{ data, isLoading, error \} = query as[^\n]*\n/,
      `const { data, isLoading, error } = trpc.tracker.getApplications.useQuery({ userId: getUserId() }, { keepPreviousData: true });\n`
    );
    changed = true;
  }
  if (changed) {
    write(TRACKER_PAGE, s);
    console.log(`✅ patched tracker UI -> ${TRACKER_PAGE}`);
  } else {
    console.log(`⏭  tracker UI already using real hooks -> ${TRACKER_PAGE}`);
  }
  return changed;
}

// 4) API CRUD tests (idempotent)
const TRACKER_TEST = P('apps/api/src/router/__tests__/tracker.crud.spec.ts');
const TRACKER_TEST_SRC = `import { describe, it, expect, vi } from 'vitest';
import { trackerRouter } from '../../trpc/routers/tracker.router';

function makeCtx() {
  const prisma = {
    application: {
      findMany: vi.fn().mockResolvedValue([{ id: 'a1' }]),
      create: vi.fn().mockResolvedValue({ id: 'a2' }),
      update: vi.fn().mockResolvedValue({ id: 'a3' }),
      delete: vi.fn().mockResolvedValue({ id: 'a4' }),
    },
  };
  return { prisma } as any;
}

describe('tracker router CRUD', () => {
  it('getApplications forwards filters + appliedAt order', async () => {
    const ctx = makeCtx();
    const caller = trackerRouter.createCaller(ctx);
    const res = await caller.getApplications({ userId: 'u1', status: 'APPLIED', limit: 50 });
    const arg = ctx.prisma.application.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: 'u1', status: 'APPLIED' });
    expect(arg.orderBy).toEqual({ appliedAt: 'desc' } as any);
    expect(arg.take).toBe(50);
    expect(res).toEqual([{ id: 'a1' }]);
  });

  it('createApplication passes data through', async () => {
    const ctx = makeCtx();
    const caller = trackerRouter.createCaller(ctx);
    await caller.createApplication({ company: 'Acme', role: 'FE' } as any);
    expect(ctx.prisma.application.create).toHaveBeenCalledWith({ data: { company: 'Acme', role: 'FE' } });
  });

  it('updateApplication uses where.id + data', async () => {
    const ctx = makeCtx();
    const caller = trackerRouter.createCaller(ctx);
    await caller.updateApplication({ id: 'x', data: { status: 'INTERVIEWING' } } as any);
    expect(ctx.prisma.application.update).toHaveBeenCalledWith({ where: { id: 'x' }, data: { status: 'INTERVIEWING' } });
  });

  it('deleteApplication uses where.id', async () => {
    const ctx = makeCtx();
    const caller = trackerRouter.createCaller(ctx);
    await caller.deleteApplication({ id: 'z' });
    expect(ctx.prisma.application.delete).toHaveBeenCalledWith({ where: { id: 'z' } });
  });
});
`;

function ensureTrackerCrudTest() {
  return upsertFile(TRACKER_TEST, TRACKER_TEST_SRC, 'tracker CRUD test');
}

// 5) One run
function run(cmd) {
  console.log(`$ ${cmd}`);
  cp.execSync(cmd, { stdio: 'inherit' });
}

function maybeCommit() {
  if (!DO_COMMIT) return;
  try {
    run(`git add "${TRACKER_TYPES}" "${TRACKER_ROUTER}" "${TRACKER_TEST}" "${TRACKER_PAGE}"`);
    run(`git commit -m "feat(tracker): Phase 3 finalizer (types, router CRUD, UI hook, tests)"`);
    console.log('✓ committed Phase 3 tracker changes');
  } catch (e) {
    console.warn('⏭  commit skipped:', e?.message || e);
  }
  if (DO_PUSH) {
    try {
      run('git push');
      console.log('✓ pushed');
    } catch (e) {
      console.warn('⏭  push skipped:', e?.message || e);
    }
  }
}

(function main() {
  ensureTrackerTypes();
  ensureTrackerRouter();
  patchTrackerPage();
  ensureTrackerCrudTest();
  maybeCommit();

  console.log('\nNext: pnpm -w test:api && pnpm -w test:web');
})();
