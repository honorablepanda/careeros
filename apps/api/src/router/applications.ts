import { router, publicProcedure } from '../trpc/trpc';
import { z } from 'zod';
import { $Enums } from '@prisma/client';

// Minimal application schema for create/list
export const ApplicationInput = z.object({
  title: z.string().min(1, 'title required'),
  company: z.string().min(1, 'company required'),
  url: z.string().url().optional(),
  status: z.nativeEnum($Enums.ApplicationStatus).default($Enums.ApplicationStatus.APPLIED),
  source: z.nativeEnum($Enums.ApplicationSource).optional(),
  appliedAt: z.date().optional(),
});

export const applicationsRouter = router({
  create: publicProcedure
    .input(ApplicationInput)
    .mutation(async ({ ctx, input }) => {
      const created = await (ctx as any).prisma?.application?.create?.({ data: input });
      return created ?? { id: 'mock-id', ...input };
    }),

  list: publicProcedure
    .input(z.object({
      status: z.nativeEnum($Enums.ApplicationStatus).optional(),
      source: z.nativeEnum($Enums.ApplicationSource).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const where: any = {};
      if (input?.status) where.status = input.status;
      if (input?.source) where.source = input.source;

      const rows = await (ctx as any).prisma?.application?.findMany?.({
        where: Object.keys(where).length ? where : undefined,
        orderBy: { appliedAt: 'desc' },
      });
      return rows ?? [];
    }),
});
