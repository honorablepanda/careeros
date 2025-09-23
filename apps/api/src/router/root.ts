import { appRouter as realAppRouter } from '../trpc/root';

export const appRouter = realAppRouter;
export type AppRouter = typeof appRouter;
