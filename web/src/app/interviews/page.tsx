'use client';
import { dateValue } from '@/lib/dates';
import * as React from 'react';
import { getUserId } from '@/lib/user';
import { trpc } from '@/trpc';

type Interview = {
  id: string;
  company?: string;
  role?: string;
  stage?: string; // e.g., SCREEN, ONSITE
  scheduledAt?: string | Date;
  notes?: string;
};

export default function InterviewsPage() {
  const userId = getUserId(); // TODO: replace with session user id
  const hook = (trpc as any)?.interviews?.list?.useQuery;
  const query = hook
    ? hook({ userId })
    : {
        data: null,
        isLoading: false,
        error: { message: 'Interviews API not available' },
      };

  const { data, isLoading, error } = query as {
    data: Interview[] | null;
    isLoading: boolean;
    error: null | { message: string };
  };

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error)
    return <main className="p-6 text-red-600">Error: {error.message}</main>;

  const rows = [...(data ?? [])].sort(
    (a, b) => dateValue(a.scheduledAt) - dateValue(b.scheduledAt)
  );

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Interviews</h1>
      {rows.length ? (
        <table className="w-full text-sm border" role="table">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Company</th>
              <th className="p-2 text-left">Role</th>
              <th className="p-2 text-left">Stage</th>
              <th className="p-2 text-left">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((iv) => (
              <tr key={iv.id} className="border-t">
                <td className="p-2">{iv.company ?? '—'}</td>
                <td className="p-2">{iv.stage ?? '—'}</td>
                <td className="p-2">
                  {iv.scheduledAt
                    ? new Date(iv.scheduledAt).toLocaleString()
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>No interviews scheduled.</div>
      )}
    </main>
  );
}
