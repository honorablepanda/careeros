// apps/api/src/router/tracker.ts
// Minimal tRPC router shape for Tracker. Adjust to your trpc helper names if different.
import { z } from 'zod';
import { prisma } from '../server/db';

// If your project exports helpers like router/publicProcedure from ../trpc, use them.
// To keep this idempotent in unknown setups, we export a plain object with the expected keys.
// Replace with your actual tRPC router wiring when convenient.

export const trackerRouter = {
  // Expected shape: trpc.procedure.query(({ input }) => prisma.application.findMany(...))
  getApplications: {
    // placeholder to avoid runtime errors in tests; your web tests mock this anyway
    useQuery: undefined,
  },
  // These are placeholders so the symbol exists; wire up real mutations in your API as needed.
  createApplication: {},
  updateApplication: {},
  deleteApplication: {},
} as any;

// Tip: When you wire real tRPC, replace this file with something like:
//
// import { router, publicProcedure } from '../trpc';
// export const trackerRouter = router({
//   getApplications: publicProcedure
//     .input(z.object({ userId: z.string() }))
//     .query(({ input }) => prisma.application.findMany({ where: { userId: input.userId } })),
//   createApplication: publicProcedure
//     .input(z.object({ userId: z.string(), company: z.string(), role: z.string(),
//                       location: z.string().optional(),
//                       status: z.enum(['APPLIED','INTERVIEW','OFFER','REJECTED','WITHDRAWN','HIRED']).default('APPLIED'),
//                       source: z.enum(['JOB_BOARD','REFERRAL','COMPANY_WEBSITE','RECRUITER','OTHER']).default('OTHER'),
//                       notes: z.string().optional(), }))
//     .mutation(({ input }) => prisma.application.create({ data: input })),
//   updateApplication: publicProcedure
//     .input(z.object({ id: z.string(), data: z.object({
//       company: z.string().optional(), role: z.string().optional(), location: z.string().optional(),
//       status: z.enum(['APPLIED','INTERVIEW','OFFER','REJECTED','WITHDRAWN','HIRED']).optional(),
//       source: z.enum(['JOB_BOARD','REFERRAL','COMPANY_WEBSITE','RECRUITER','OTHER']).optional(),
//       notes: z.string().optional(), }) }))
//     .mutation(({ input }) => prisma.application.update({ where: { id: input.id }, data: input.data })),
//   deleteApplication: publicProcedure
//     .input(z.object({ id: z.string() }))
//     .mutation(({ input }) => prisma.application.delete({ where: { id: input.id } })),
// });
