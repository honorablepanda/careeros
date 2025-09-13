'use client';
import * as React from 'react';
import { trpc } from '@/trpc';

export default function TrackerActivityPage() {
  const hook = (trpc as any)?.tracker?.getApplicationActivity?.useQuery;
  const query = hook
    ? hook({ id: 'demo-app-1' })
    : { data: null, isLoading: false, error: { message: 'Activity API not available' } };

  const { data, isLoading, error } = query as {
    data: null | Array<{ id: string; type?: string; payload?: any; createdAt?: string | Date }>;
    isLoading: boolean;
    error: null | { message: string };
  };

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error)     return <main className="p-6 text-red-600">Error: {error.message}</main>;

  const rows = [...(data ?? [])].sort((a,b) =>
    new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
  );

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Tracker Activity</h1>
      {rows.length ? (
        <table role="table" className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-left">Payload</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.type}</td>
                <td className="p-2"><pre className="text-xs">{JSON.stringify(a.payload ?? {}, null, 0)}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div>No activity found.</div>}
    </main>
  );
}
