'use client';

import React from 'react';
import Link from 'next/link';
import { trpc } from '../../trpc';
import type { ApplicationItem } from '@careeros/types';

function Column({ title, items }: { title: string; items: ApplicationItem[] }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 240,
        padding: 12,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#fff',
      }}
    >
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((a) => (
          <div
            key={a.id}
            style={{
              padding: 12,
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              background: '#fff',
            }}
          >
            <div style={{ fontWeight: 600 }}>{a.role}</div>
            <div style={{ color: '#6b7280' }}>{a.company}</div>
          </div>
        ))}
        {!items.length && (
          <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>No items</div>
        )}
      </div>
    </div>
  );
}

export default function TrackerPage() {
  const userId = 'demo-user'; // TODO: replace with real auth-derived user id
  const { data, isLoading, error } =
    trpc.tracker.getApplications.useQuery({ userId });

  if (isLoading) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
          Application Tracker
        </h1>
        <div>Loading…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
          Application Tracker
        </h1>
        <div style={{ color: '#b91c1c' }}>
          Failed to load applications: {String(error.message || error)}
        </div>
        <div style={{ marginTop: 16 }}>
          <Link href="/">← Back</Link>
        </div>
      </main>
    );
  }

  const apps = data ?? [];
  const grouped = {
    APPLIED: apps.filter((a) => String(a.status) === 'APPLIED'),
    INTERVIEW: apps.filter((a) => String(a.status) === 'INTERVIEW'),
    OFFER: apps.filter((a) => String(a.status) === 'OFFER'),
    REJECTED: apps.filter((a) => String(a.status) === 'REJECTED'),
  };

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        Application Tracker
      </h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Column title="Applied" items={grouped.APPLIED} />
        <Column title="Interview" items={grouped.INTERVIEW} />
        <Column title="Offer" items={grouped.OFFER} />
        <Column title="Rejected" items={grouped.REJECTED} />
      </div>
      <div style={{ marginTop: 16 }}>
        <Link href="/">← Back</Link>
      </div>
    </main>
  );
}
