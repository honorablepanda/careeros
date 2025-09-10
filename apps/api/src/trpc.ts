// apps/api/src/trpc.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
// If you add auth later, export middleware here and switch to protected procedures.
