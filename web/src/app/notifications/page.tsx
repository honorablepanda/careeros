'use client';
import { formatDate } from '@/lib/dates';
import * as React from 'react';
import { getUserId } from '@/lib/user';
import { trpc } from '@/trpc';

type Noti = {
  id: string;
  type?: string;
  message: string;
  createdAt?: string | Date;
  read?: boolean;
};

export default function NotificationsPage() {
  const userId = getUserId(); // TODO: replace with session user id

  const hook = trpc?.notifications?.list?.useQuery;
  const query = hook
    ? hook({ userId })
    : { data: null, isLoading: false, error: { message: 'Notifications API not available' } };

  const { data, isLoading, error } = query as {
    data: Noti[] | null;
    isLoading: boolean;
    error: null | { message: string };
  };

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error) return <main className="p-6 text-red-600">Error: {error.message}</main>;

  const rows = data ?? [];
  const unread = rows.filter(n => !n.read).length;

  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <div className="text-sm text-gray-600">{unread} unread</div>
      </div>

      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id} className="rounded-lg border p-3 flex items-start gap-3">
              <div
                aria-label={n.read ? 'read' : 'unread'}
                className={`mt-1 h-2 w-2 rounded-full ${n.read ? 'bg-gray-300' : 'bg-blue-600'}`}
              />
              <div className="flex-1">
                <div className="text-sm">{n.message}</div>
                <div className="text-xs text-gray-500">
                  {n.type ? `${n.type} • ` : ''}{n.createdAt ? formatDate(n.createdAt) : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div>No notifications.</div>
      )}
    </main>
  );
}
