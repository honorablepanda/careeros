'use client';

import React from 'react';
import { trpc } from '@/trpc/react';

type StatusCount = { status: string; count: number };
type LatestItem = {
  id: string | number;
  company?: string | null;
  title?: string | null;
  status: string | null;
  updatedAt: string | Date;
};

export default function DashboardPage() {
  const { data, isLoading, error } = trpc.summary.get.useQuery();

  if (isLoading) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
        <p className="text-slate-600">Loading…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
        <p className="text-red-600">Failed to load dashboard data.</p>
      </main>
    );
  }

  const statusCounts: StatusCount[] = data.statusCounts ?? [];
  const latest: LatestItem[] = data.latest ?? [];

  return (
    <main className="p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* KPIs */}
      <section>
        <h2 className="text-lg font-medium mb-3">Application Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {statusCounts.length === 0 ? (
            <div className="text-slate-600">No status data yet.</div>
          ) : (
            statusCounts.map((s) => (
              <div
                key={s.status}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="text-sm text-slate-500">{s.status}</div>
                <div className="text-2xl font-semibold">{s.count}</div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Latest applications */}
      <section>
        <h2 className="text-lg font-medium mb-3">Latest Applications</h2>
        {latest.length === 0 ? (
          <div className="text-slate-600">No recent applications.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-2 font-semibold text-slate-700">Company</th>
                  <th className="p-2 font-semibold text-slate-700">Title</th>
                  <th className="p-2 font-semibold text-slate-700">Status</th>
                  <th className="p-2 font-semibold text-slate-700">Updated</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {latest.map((r) => (
                  <tr key={String(r.id)} className="border-t">
                    <td className="p-2">{r.company ?? '—'}</td>
                    <td className="p-2">{r.title ?? '—'}</td>
                    <td className="p-2">{r.status ?? '—'}</td>
                    <td className="p-2">
                      {new Date(r.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
