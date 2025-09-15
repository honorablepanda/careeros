'use client';
import * as React from 'react';
import { getUserId } from '@/lib/user';
import { trpc } from '@/trpc';

export default function ProfilePage() {
  const userId = getUserId(); // TODO: replace with session user id

  // Be resilient if profile router shape differs — compile-safe & runtime-safe.
  const hook = (trpc as any)?.profile?.get?.useQuery;
  const query = hook
    ? hook({ userId })
    : { data: null, isLoading: false, error: { message: 'Profile API not available' } };

  const { data, isLoading, error } = query as {
    data: null | {
      name?: string;
      email?: string;
      headline?: string;
      location?: string;
      avatarUrl?: string;
    };
    isLoading: boolean;
    error: null | { message: string };
  };

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error) return <main className="p-6 text-red-600">Error: {error.message}</main>;

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>

      {data ? (
        <section className="rounded-xl border p-4 grid grid-cols-[64px_1fr] gap-4 items-center">
          <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden">
            {data.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.avatarUrl} alt={data.name || 'avatar'} className="w-full h-full object-cover" />
            ) : null}
          </div>
          <div className="space-y-1">
            <div className="text-lg font-medium">{data.name ?? 'Unnamed'}</div>
            <div className="text-sm text-gray-600">{data.email ?? '—'}</div>
            <div className="text-sm">{data.headline ?? '—'}</div>
            <div className="text-sm text-gray-600">{data.location ?? '—'}</div>
          </div>
        </section>
      ) : (
        <div>No profile data.</div>
      )}
    </main>
  );
}
