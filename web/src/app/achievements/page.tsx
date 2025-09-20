'use client';
import { dateValue, formatDate } from '@/lib/dates';
import * as React from 'react';
import { getUserId } from '@/lib/user';
import { trpc } from '@/trpc';

type Row = { [k: string]: unknown };

export default function AchievementsPage() {
  const userId = getUserId(); // TODO: replace with session user id

  const hook = trpc?.achievements?.list?.useQuery;
  const query = hook
    ? hook({ userId })
    : { data: null, isLoading: false, error: { message: 'Achievements API not available' } };

  const { data, isLoading, error } = query as {
    data: null | Row[];
    isLoading: boolean;
    error: null | { message: string };
  };

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error)     return <main className="p-6 text-red-600">Error: {error.message}</main>;
  if (!data?.length) return <main className="p-6">No achievements yet.</main>;

  const rows = [...(data ?? [])].sort((a,b) => dateValue(b.awardedAt) - dateValue(a.awardedAt));

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Achievements</h1>
      <table className="w-full text-sm border" role="table">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left">Title</th>
            <th className="p-2 text-left">Category</th>
            <th className="p-2 text-left">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id ?? Math.random())} className="border-t">
                <td className="p-2">{String(r.title ?? '—')}</td>
                <td className="p-2">{String(r.category ?? '—')}</td>
                <td className="p-2">{r.awardedAt ? formatDate(r.awardedAt) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
