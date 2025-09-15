'use client';
import * as React from 'react';
import { getUserId } from '@/lib/user';
import { trpc } from '@/trpc';

export default function ApplicationsPage() {
  const userId = getUserId(); // TODO: replace with session user id
  const [status, setStatus] = React.useState<string | undefined>(undefined);

  const { data, isLoading, error } = trpc.applications.list.useQuery(
    { userId, status: status as any },
    { keepPreviousData: true }
  );

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Applications</h1>

      <div className="flex items-center gap-3">
        <label className="text-sm">Filter status:</label>
        <select
          className="border rounded-md px-2 py-1 text-sm"
          value={status ?? ''}
          onChange={(e) => setStatus(e.target.value || undefined)}
        >
          <option value="">All</option>
          <option value="APPLIED">APPLIED</option>
          <option value="INTERVIEWING">INTERVIEWING</option>
          <option value="INTERVIEW">INTERVIEW</option>
          <option value="REJECTED">REJECTED</option>
          <option value="OFFER">OFFER</option>
        </select>
      </div>

      {isLoading && <div>Loading…</div>}
      {error && <div className="text-red-600">Error: {error.message}</div>}

      {data?.length ? (
        <table className="w-full text-sm border" role="table">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Company</th>
              <th className="p-2 text-left">Role</th>
              <th className="p-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a: any) => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.company}</td>
                <td className="p-2">{a.role}</td>
                <td className="p-2">{String(a.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : !isLoading ? (
        <div>No applications found.</div>
      ) : null}
    </main>
  );
}
