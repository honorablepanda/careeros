// apps/api/src/trpc/routers/tracker.router.ts
import { router, procedure } from '../trpc';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { $Enums  } from '@prisma/client';

const GetApplicationsInput = z.object({ userId: z.string() }).strict();

const CreateApplicationInput = z
  .object({
    userId: z.string(),
    company: z.string().min(1),
    role: z.string().min(1),

    // Accept Prisma enum OR legacy "INTERVIEWING"
    status: z
      .union([z.nativeEnum($Enums.ApplicationStatus), z.literal('INTERVIEWING')])
      .default($Enums.ApplicationStatus.APPLIED),

    source: z.nativeEnum($Enums.ApplicationSource).optional(),

    location: z.string().nullable().optional(),
    url: z.string().url().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

const UpdateApplicationInput = z
  .object({
    id: z.string(),
    data: z
      .object({
        company: z.string().min(1).optional(),
        role: z.string().min(1).optional(),
        status: z
          .union([z.nativeEnum($Enums.ApplicationStatus), z.literal('INTERVIEWING')])
          .optional(),
        source: z.nativeEnum($Enums.ApplicationSource).optional(),
        location: z.string().nullable().optional(),
        url: z.string().url().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .strict(),
  })
  .strict();

function normalizeStatus(
  status: $Enums.ApplicationStatus | 'INTERVIEWING',
): $Enums.ApplicationStatus {
  return status === "INTERVIEWING" ? $Enums.ApplicationStatus.INTERVIEW : status;
}

export const trackerRouter = router({
  getApplications: procedure
    .input(GetApplicationsInput)
    .query(async ({ ctx, input }) => {
      return ctx.prisma.application.findMany({
        where: { userId: input.userId },
        orderBy: { createdAt: 'desc' },
      });
    }),

  createApplication: procedure
    .input(CreateApplicationInput)
    .mutation(async ({ ctx, input }) => {
      const { status, ...rest } = input;
      return ctx.prisma.application.create({
        data: { ...rest, status: normalizeStatus(status) },
      });
    }),

  updateApplication: procedure
    .input(UpdateApplicationInput)
    .mutation(async ({ ctx, input }) => {
      const { id, data } = input;
      const { status, ...rest } = data;
      return ctx.prisma.application.update({
        where: { id },
        data: {
          ...rest,
          ...(status ? { status: normalizeStatus(status) } : {}),
        },
      });
    }),

  deleteApplication: procedure
    .input(z.object({ id: z.string() }).strict())
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.application.delete({ where: { id: input.id } });
    }),
});

export type TrackerRouter = typeof trackerRouter;
