'use client';
import * as React from 'react';
import { trpc } from '@/trpc';

type Row = { [k: string]: any };

export default function PlannerPage() {
  const userId = 'demo-user'; // TODO: replace with session user id

  const hook = (trpc as any)?.planner?.list?.useQuery;
  const query = hook
    ? hook({ userId })
    : { data: null, isLoading: false, error: { message: 'Planner API not available' } };

  const { data, isLoading, error } = query as {
    data: null | Row[];
    isLoading: boolean;
    error: null | { message: string };
  };

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error)     return <main className="p-6 text-red-600">Error: {error.message}</main>;
  if (!data?.length) return <main className="p-6">No tasks scheduled.</main>;

  const rows = [...(data ?? [])].sort((a,b) => new Date(b.dueDate ?? 0).getTime() - new Date(a.dueDate ?? 0).getTime());

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Planner</h1>
      <table className="w-full text-sm border" role="table">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left">Task</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id ?? Math.random())} className="border-t">
                <td className="p-2">{String(r.task ?? '—')}</td>
                <td className="p-2">{String(r.status ?? '—')}</td>
                <td className="p-2">{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
