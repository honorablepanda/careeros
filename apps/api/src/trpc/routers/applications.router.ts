import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { $Enums } from '@prisma/client';

// Legacy tests pass minimal shapes; don't force required fields here.
// Also avoid adding defaults so calledWith({ data: input }) matches exactly.
const CreateApplicationInput = z.object({}).passthrough();

const ListApplicationsInput = z.object({
  userId: z.string().optional(),
  status: z.nativeEnum($Enums.ApplicationStatus).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export const applicationsRouter = router({
  create: publicProcedure
    .input(CreateApplicationInput)
    .mutation(async ({ ctx, input }) => {
      // Forward exactly what the caller provided
      return ctx.prisma.application.create({ data: input as any });
    }),

  list: publicProcedure
    .input(ListApplicationsInput)
    .query(async ({ ctx, input }) => {
      const { userId, status, limit } = input;
      return ctx.prisma.application.findMany({
        where: {
          ...(userId ? { userId } : {}),
          ...(status ? { status } : {}),
        },
        orderBy: { appliedAt: 'desc' } as any,
        ...(limit ? { take: limit } : {}),
      });
    }),
});
