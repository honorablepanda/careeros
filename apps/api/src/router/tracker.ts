// apps/api/src/router/tracker.ts
import { z } from 'zod';
import { prisma } from '../server/db';
import { router, publicProcedure } from '../trpc';

const Status = z.enum([
  'APPLIED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
  'HIRED',
]);

const Source = z.enum([
  'JOB_BOARD',
  'REFERRAL',
  'COMPANY_WEBSITE',
  'RECRUITER',
  'OTHER',
]);

export const trackerRouter = router({
  getApplications: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ input }) =>
      prisma.application.findMany({
        where: { userId: input.userId },
        orderBy: { createdAt: 'desc' },
      })
    ),

  createApplication: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        company: z.string(),
        role: z.string(),
        location: z.string().optional(),
        status: Status.default('APPLIED'),
        source: Source.default('OTHER'),
        notes: z.string().optional(),
      })
    )
    .mutation(({ input }) => prisma.application.create({ data: input })),

  updateApplication: publicProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          company: z.string().optional(),
          role: z.string().optional(),
          location: z.string().optional(),
          status: Status.optional(),
          source: Source.optional(),
          notes: z.string().optional(),
        }),
      })
    )
    .mutation(({ input }) =>
      prisma.application.update({
        where: { id: input.id },
        data: input.data,
      })
    ),

  deleteApplication: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      prisma.application.delete({ where: { id: input.id } })
    ),
});
