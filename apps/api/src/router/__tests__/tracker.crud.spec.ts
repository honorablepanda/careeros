import { describe, it, expect, vi } from 'vitest';
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
