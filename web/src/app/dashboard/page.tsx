'use client';
import * as React from 'react';
import { trpc } from '@/trpc';

export default function DashboardPage() {
  const userId = 'demo-user'; // TODO: replace with session user id
  const { data: apps, isLoading, error } = trpc.tracker.getApplications.useQuery({ userId });

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error) return <main className="p-6 text-red-600">Error: {error.message}</main>;
  if (!apps?.length) return <main className="p-6">No applications yet.</main>;

  const byStatus = apps.reduce<Record<string, number>>((acc, a) => {
    const k = String(a.status); acc[k] = (acc[k] ?? 0) + 1; return acc;
  }, {});
  const total = apps.length;
  const offers = byStatus['OFFER'] ?? 0;
  const rejections = byStatus['REJECTED'] ?? 0;
  const interviewing = (byStatus['INTERVIEWING'] ?? 0) + (byStatus['INTERVIEW'] ?? 0); // tolerate either
  const last5 = apps.slice(0,5);

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Total" value={total} />
        <Kpi label="Interviewing" value={interviewing} />
        <Kpi label="Offers" value={offers} />
        <Kpi label="Rejections" value={rejections} />
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-2">Recent Applications</h2>
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
            {last5.map(r => (
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
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-4 rounded-xl border shadow-sm">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
