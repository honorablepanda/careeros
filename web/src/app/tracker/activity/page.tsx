'use client';
import { formatDateTime } from '@/lib/dates';
import React from 'react';
type ActivityRow = {
  createdAt?: unknown;
  ts?: unknown;
  type?: string;
  details?: string;
  by?: string;
  to?: string;
};

import { trpc } from '@/trpc';

export default function Page() {
  const hook = trpc?.tracker?.getApplicationActivity?.useQuery;
  let data: unknown[] = [];
  let isLoading = false;
  let error: null | { message: string } = null;

  if (hook) {
    try {
      const q = hook({ id: 'demo-app-1' });
      data = q?.data ?? [];
      isLoading = !!q?.isLoading;
      error = q?.error ?? null;
    } catch {
      error = { message: 'Activity API not available' };
    }
  } else {
    error = { message: 'Activity API not available' };
  }

  return (
    <main className="p-6">
      <h1>Tracker Activity</h1>
      {error ? (
        <p>Activity API not available — No activity</p>
      ) : isLoading ? (
        <p>Loading…</p>
      ) : data?.length ? (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr>
              <th align="left">When</th>
              <th align="left">Type</th>
              <th align="left">Details</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row: ActivityRow, i: number) => (
              <tr key={i}>
                <td>{formatDateTime(row.createdAt ?? row.ts)}</td>
                <td>{row.type ?? ''}</td>
                <td>{row.details ?? row.by ?? row.to ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No activity</p>
      )}
    </main>
  );
}
