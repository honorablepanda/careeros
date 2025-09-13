import { describe, it, expect, vi } from 'vitest';
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
