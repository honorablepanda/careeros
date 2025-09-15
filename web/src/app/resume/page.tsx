'use client';
import * as React from 'react';
import { getUserId } from '@/lib/user';
import { trpc } from '@/trpc';

type Row = { [k: string]: any };

export default function ResumePage() {
  const userId = getUserId(); // TODO: replace with session user id

  const hook = (trpc as any)?.resume?.list?.useQuery;
  const query = hook
    ? hook({ userId })
    : { data: null, isLoading: false, error: { message: 'Resume API not available' } };

  const { data, isLoading, error } = query as {
    data: null | Row[];
    isLoading: boolean;
    error: null | { message: string };
  };

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error)     return <main className="p-6 text-red-600">Error: {error.message}</main>;
  if (!data?.length) return <main className="p-6">No resume entries.</main>;

  const rows = [...(data ?? [])].sort((a,b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Resume</h1>
      <table className="w-full text-sm border" role="table">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left">Section</th>
            <th className="p-2 text-left">Value</th>
            <th className="p-2 text-left">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id ?? Math.random())} className="border-t">
                <td className="p-2">{String(r.section ?? '—')}</td>
                <td className="p-2">{String(r.value ?? '—')}</td>
                <td className="p-2">{r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
