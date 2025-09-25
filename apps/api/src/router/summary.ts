// apps/api/src/router/summary.ts

// Flexible import so this works with either createTRPCRouter/publicProcedure
// or t.router/t.procedure style TRPC setups.
import * as TRPC from '../trpc';

type StatusCount = { status: string; count: number };
type LatestItem = {
  id: string | number;
  status: string | null;
  updatedAt: Date;
};

// Resolve router/procedure constructors defensively (v10/v11 style or "t.*").
const ROUTER: any =
  (TRPC as any).createTRPCRouter ??
  (TRPC as any).router ??
  (TRPC as any).t?.router;

const PROC: any =
  (TRPC as any).publicProcedure ??
  (TRPC as any).procedure ??
  (TRPC as any).t?.procedure;

if (!ROUTER || !PROC) {
  throw new Error(
    'TRPC bootstrap not found: expected createTRPCRouter/publicProcedure or t.router/t.procedure in "../trpc".'
  );
}

export const summaryRouter = ROUTER({
  /**
   * Returns status aggregates and the latest 10 applications for the current user.
   * Implementation avoids Prisma `groupBy` to sidestep TS circular mapped type issues.
   */
  overview: PROC.query(
    async ({
      ctx,
    }): Promise<{
      statusCounts: StatusCount[];
      latest: LatestItem[];
    }> => {
      const userId =
        ctx?.session?.user?.id ?? ctx?.user?.id ?? (ctx as any)?.userId ?? null;

      if (!userId) {
        return { statusCounts: [], latest: [] };
      }

      // 1) Status counts (safe findMany + reduce; no TS generics on reduce)
      const statuses = await ctx.prisma.application.findMany({
        where: { userId },
        select: { status: true },
      });

      const statusMap = statuses.reduce(
        (acc: Record<string, number>, row: { status: unknown }) => {
          const key =
            (row.status as string | null | undefined) ??
            /* fallback */ 'UNKNOWN';
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const statusCounts: StatusCount[] = Object.keys(statusMap).map(
        (status) => ({
          status,
          count: statusMap[status] ?? 0,
        })
      );

      // 2) Latest 10 apps
      const latestRows = await ctx.prisma.application.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, status: true, updatedAt: true },
      });

      const latest: LatestItem[] = latestRows.map((r) => ({
        id: r.id,
        status: (r.status as string | null | undefined) ?? null,
        updatedAt: r.updatedAt,
      }));

      return { statusCounts, latest };
    }
  ),
});

export type SummaryRouter = typeof summaryRouter;
