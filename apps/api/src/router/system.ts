import { router, publicProcedure } from '../trpc/trpc';

export const systemRouter = router({
  ping: publicProcedure.query(() => ({ ok: true, ts: Date.now() })),
});
