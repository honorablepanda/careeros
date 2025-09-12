import { summaryRouter } from '../router/summary';
import { router } from './trpc';
import { trackerRouter } from './routers/tracker.router';
import { applicationsRouter } from './routers/applications.router';
export const appRouter = router({ 
  applications: applicationsRouter, tracker: trackerRouter });
export type AppRouter = typeof appRouter;
export { createContext } from './context';
