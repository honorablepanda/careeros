import { vi, describe, it, expect } from 'vitest';
import { router } from '../../trpc/trpc';
import { applicationsRouter, ApplicationInput } from '../applications';
import { $Enums } from '@prisma/client';

describe('applications router', () => {
  it('create calls prisma.application.create with input', async () => {
    const create = vi.fn(async ({ data }) => ({ id: '1', ...data }));
    const r = router({ applications: applicationsRouter });
    const caller = r.createCaller({
      prisma: { application: { create } },
    } as any);

    const input = {
      title: 'FE Engineer',
      company: 'Acme',
      status: $Enums.ApplicationStatus.APPLIED,
    } as any; // zod will enforce at runtime; TS not strict here

    const res = await caller.applications.create(input);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ data: input });
    expect(res).toEqual({ id: '1', ...input });
  });

  it('list forwards filters to prisma.application.findMany', async () => {
    const rows = [{ id: '1' }, { id: '2' }];
    const findMany = vi.fn(async () => rows);
    const r = router({ applications: applicationsRouter });
    const caller = r.createCaller({
      prisma: { application: { findMany } },
    } as any);

    const res = await caller.applications.list({
      status: $Enums.ApplicationStatus.APPLIED,
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ status: $Enums.ApplicationStatus.APPLIED });
    expect(arg.orderBy).toEqual({ appliedAt: 'desc' });
    expect(res).toBe(rows);
  });
});
