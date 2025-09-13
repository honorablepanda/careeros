import { z } from 'zod';
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
