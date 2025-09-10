import { summaryRouter } from '../router/summary';
import { router } from './trpc';
import { trackerRouter } from './routers/tracker.router';
export const appRouter = router({ 
  summary: summaryRouter,
tracker: trackerRouter });
export type AppRouter = typeof appRouter;
export { createContext } from './context';
