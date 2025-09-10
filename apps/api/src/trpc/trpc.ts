import { initTRPC } from '@trpc/server';
import type { Context } from './context';
import superjson from 'superjson';

export const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

// Export helpers for routers
export const router = t.router;
export const publicProcedure = t.procedure;

// (Optional) temp alias if routers still import `procedure`
export const procedure = t.procedure;
