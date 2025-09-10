// shared/types/src/summary.ts
import { z } from 'zod';

export const StatusCountSchema = z.object({
  status: z.string(),          // keep string here to avoid enum coupling
  count: z.number().int().nonnegative(),
});
export type StatusCount = z.infer<typeof StatusCountSchema>;

export const SourceCountSchema = z.object({
  source: z.string(),
  count: z.number().int().nonnegative(),
});
export type SourceCount = z.infer<typeof SourceCountSchema>;

export const TrendPointSchema = z.object({
  // YYYY-MM-DD (UTC)
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
});
export type TrendPoint = z.infer<typeof TrendPointSchema>;

export const LatestAppSchema = z.object({
  id: z.string(),
  company: z.string(),
  role: z.string(),
  status: z.string(),
  createdAt: z.date(),
});
export type LatestApp = z.infer<typeof LatestAppSchema>;

export const SummaryOverviewSchema = z.object({
  statusCounts: z.array(StatusCountSchema),
  sourceCounts: z.array(SourceCountSchema),
  recentTrend: z.array(TrendPointSchema),
  latest: z.array(LatestAppSchema),
});
export type SummaryOverview = z.infer<typeof SummaryOverviewSchema>;
