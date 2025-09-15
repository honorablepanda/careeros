'use client';
import * as React from 'react';
import { getUserId } from '@/lib/user';
import { trpc } from '@/trpc';

type Settings = {
  emailNotifications?: boolean;
  theme?: 'light' | 'dark' | 'system' | string;
  timezone?: string;
};

export default function SettingsPage() {
  const userId = getUserId(); // TODO: wire session user id

  const hook = (trpc as any)?.settings?.get?.useQuery;
  const query = hook
    ? hook({ userId })
    : { data: null, isLoading: false, error: { message: 'Settings API not available' } };

  const { data, isLoading, error } = query as {
    data: Settings | null;
    isLoading: boolean;
    error: null | { message: string };
  };

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error) return <main className="p-6 text-red-600">Error: {error.message}</main>;

  const s = data ?? {};

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="rounded-xl border divide-y">
        <div className="p-4 flex items-center justify-between">
          <div>
            <div className="font-medium">Email notifications</div>
            <div className="text-sm text-gray-600">Receive updates about your applications and goals</div>
          </div>
          <div className="text-sm">{s.emailNotifications ? 'On' : 'Off'}</div>
        </div>

        <div className="p-4 flex items-center justify-between">
          <div>
            <div className="font-medium">Theme</div>
            <div className="text-sm text-gray-600">Appearance preference</div>
          </div>
          <div className="text-sm capitalize">{s.theme ?? 'system'}</div>
        </div>

        <div className="p-4 flex items-center justify-between">
          <div>
            <div className="font-medium">Time zone</div>
            <div className="text-sm text-gray-600">Used for reminders and due dates</div>
          </div>
          <div className="text-sm">{s.timezone ?? '—'}</div>
        </div>
      </section>

      {/* TODO: follow-up — wire mutations (update.useMutation) with optimistic UI */}
    </main>
  );
}
