'use client';
import * as React from 'react';
import { trpc } from '@/trpc';

export default function SummaryPage() {
  // TODO: replace with real userId from your auth/session
  const userId = 'demo-user';
  const { data: apps, isLoading, error } = trpc.tracker.getApplications.useQuery({ userId });

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error.message}</div>;
  if (!apps?.length) return <div className="p-6">No applications yet.</div>;

  const byStatus = apps.reduce<Record<string, number>>((acc, a) => {
    const k = String(a.status);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const last30 = new Date(); last30.setDate(last30.getDate() - 30);
  const recent = apps.filter(a => new Date(a.createdAt) >= last30).length;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Summary</h1>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(byStatus).map(([status, count]) => (
          <div key={status} className="rounded-xl border p-4">
            <div className="text-sm text-gray-500">{status}</div>
            <div className="text-2xl font-bold">{count}</div>
          </div>
        ))}
        <div className="rounded-xl border p-4">
          <div className="text-sm text-gray-500">Last 30 days</div>
          <div className="text-2xl font-bold">{recent}</div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Latest</h2>
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Company</th>
              <th className="p-2 text-left">Role</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {apps.slice(0, 5).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.company}</td>
                <td className="p-2">{r.role}</td>
                <td className="p-2">{String(r.status)}</td>
                <td className="p-2">{new Date(r.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
