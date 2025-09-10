import { router, publicProcedure } from '../trpc/trpc';
import { z } from 'zod';

export const DemoRouter = router({
  ping: publicProcedure.query(() => ({ ok: true })),
  // example input → echo
  echo: publicProcedure
    .input(z.object({ msg: z.string() }))
    .mutation(({ input }) => ({ msg: input.msg })),
});
