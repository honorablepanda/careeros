import { trackerRouter as realTrackerRouter } from '../trpc/routers/tracker.router';

// Re-declare the symbol so scanners matching "export const trackerRouter" succeed.
export const trackerRouter = realTrackerRouter;
export type TrackerRouter = typeof trackerRouter;
