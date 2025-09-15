'use client';
import * as React from 'react';
import { getUserId } from '@/lib/user';
import { trpc } from '@/trpc';

type CalEvent = {
  id: string;
  title: string;
  startsAt?: string | Date;
  endsAt?: string | Date;
  location?: string;
};

export default function CalendarPage() {
  const userId = getUserId(); // TODO: replace with session user id
  const hook = (trpc as any)?.calendar?.list?.useQuery;
  const query = hook
    ? hook({ userId })
    : { data: null, isLoading: false, error: { message: 'Calendar API not available' } };

  const { data, isLoading, error } = query as {
    data: CalEvent[] | null; isLoading: boolean; error: null | { message: string }
  };

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error)     return <main className="p-6 text-red-600">Error: {error.message}</main>;

  const rows = [...(data ?? [])].sort((a,b) =>
    new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()
  );

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Calendar</h1>
      {rows.length ? (
        <ul className="space-y-2" role="list">
          {rows.map(ev => (
            <li key={ev.id} className="rounded-lg border p-3">
              <div className="text-sm font-medium">{ev.title}</div>
              <div className="text-xs text-gray-500">
                {ev.startsAt ? new Date(ev.startsAt).toLocaleString() : '—'}
                {ev.endsAt ? ` → ${new Date(ev.endsAt).toLocaleString()}` : ''}
                {ev.location ? ` • ${ev.location}` : ''}
              </div>
            </li>
          ))}
        </ul>
      ) : <div>No upcoming events.</div>}
    </main>
  );
}
