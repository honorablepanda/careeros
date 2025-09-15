'use client';
import * as React from 'react';
import { getUserId } from '@/lib/user';
import { trpc } from '@/trpc';

export default function GoalsPage() {
  const userId = getUserId(); // TODO: replace with session user id
  const [status, setStatus] = React.useState<string | undefined>(undefined);

  const hook = (trpc as any)?.goals?.list?.useQuery;
  const query = hook
    ? hook({ userId, status })
    : { data: null, isLoading: false, error: { message: 'Goals API not available' } };

  const { data, isLoading, error } = query as {
    data: null | Array<{ id: string; title: string; status?: string; dueDate?: string | Date }>;
    isLoading: boolean;
    error: null | { message: string };
  };

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Goals</h1>

      <div className="flex items-center gap-3">
        <label className="text-sm">Filter status:</label>
        <select
          className="border rounded-md px-2 py-1 text-sm"
          value={status ?? ''}
          onChange={(e) => setStatus(e.target.value || undefined)}
        >
          <option value="">All</option>
          <option value="PLANNED">PLANNED</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="DONE">DONE</option>
        </select>
      </div>

      {isLoading && <div>Loading…</div>}
      {error && <div className="text-red-600">Error: {error.message}</div>}

      {data?.length ? (
        <table className="w-full text-sm border" role="table">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Title</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Due</th>
            </tr>
          </thead>
          <tbody>
            {data.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="p-2">{g.title}</td>
                <td className="p-2">{g.status ?? '—'}</td>
                <td className="p-2">
                  {g.dueDate ? new Date(g.dueDate).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : !isLoading ? (
        <div>No goals yet.</div>
      ) : null}
    </main>
  );
}
