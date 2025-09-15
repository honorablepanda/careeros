'use client';
import React from 'react';
import { trpc } from '@/trpc/react';

export default function Page() {
  const hook = (trpc as any)?.tracker?.getApplicationActivity?.useQuery;
  let data: any[] = [];
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
            <tr><th align="left">When</th><th align="left">Type</th><th align="left">Details</th></tr>
          </thead>
          <tbody>
            {data.map((row:any, i:number) => (
              <tr key={i}>
                <td>{row.createdAt || row.ts || ''}</td>
                <td>{row.type}</td>
                <td>{row.details || row.by || row.to || ''}</td>
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
