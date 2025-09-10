// apps/api/src/router/summary.ts
import { z } from 'zod';
import { prisma } from '../prisma'; // adjust if your prisma client path differs
import { t, publicProcedure } from '../trpc/trpc'; // adjust import to your trpc helpers
 // or your workspace alias to shared types

const InputSchema = z.object({
  userId: z.string().min(1),
});

export const summaryRouter = t.router({
  overview: publicProcedure
    .input(InputSchema)
    
    .query(async ({ input }) => {
      const { userId } = input;

      // 1) Status counts
      const statusGrp = await prisma.application.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      });
      const statusCounts = statusGrp.map((g) => ({
        status: g.status as unknown as string,
        count: g._count._all,
      }));

      // 2) Source counts
      const sourceGrp = await prisma.application.groupBy({
        by: ['source'],
        where: { userId },
        _count: { _all: true },
      });
      const sourceCounts = sourceGrp.map((g) => ({
        source: g.source as unknown as string,
        count: g._count._all,
      }));

      // 3) Recent 30-day trend (bucket by day in JS)
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recent = await prisma.application.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { createdAt: true },
      });
      const trendMap = new Map<string, number>();
      for (const r of recent) {
        const d = r.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
        trendMap.set(d, (trendMap.get(d) ?? 0) + 1);
      }
      // fill missing days with 0 so the UI can render a continuous list if desired
      const days: string[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        days.push(d);
      }
      const recentTrend = days.map((d) => ({ date: d, count: trendMap.get(d) ?? 0 }));

      // 4) Latest 5
      const latestRaw = await prisma.application.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          company: true,
          role: true,
          status: true,
          createdAt: true,
        },
      });
      const latest = latestRaw.map((a) => ({
        ...a,
        status: a.status as unknown as string,
      }));

      return { statusCounts, sourceCounts, recentTrend, latest };
    }),
});
