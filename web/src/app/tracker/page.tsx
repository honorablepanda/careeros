'use client';

import React from 'react';
import Link from 'next/link';
import { trpc } from '@careeros/trpc';
import { ApplicationItem } from '@careeros/types';

function Column({ title, items }: { title: string; items: ApplicationItem[] }) {
  return (
    <div style={{ flex: 1, minWidth: 240, padding: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((a) => (
          <div key={a.id} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
            <div style={{ fontWeight: 600 }}>{a.title}</div>
            <div style={{ color: '#6b7280' }}>{a.company}</div>
            {a.url && <a href={a.url} target="_blank" rel="noreferrer">Job link</a>}
            {a.tags?.length ? <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>#{a.tags.join(' #')}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TrackerPage() {
  // NOTE: replace the userId with the actual logged-in user (from your auth context)
  const userId = 'demo-user';
  const { data } = trpc.tracker.getApplications.useQuery({ userId });

  const apps = data ?? [];
  const grouped = {
    APPLIED: apps.filter(a => a.status === 'APPLIED'),
    INTERVIEWING: apps.filter(a => a.status === 'INTERVIEWING'),
    OFFER: apps.filter(a => a.status === 'OFFER'),
    REJECTED: apps.filter(a => a.status === 'REJECTED'),
  };

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Application Tracker</h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Column title="Applied" items={grouped.APPLIED} />
        <Column title="Interviewing" items={grouped.INTERVIEWING} />
        <Column title="Offer" items={grouped.OFFER} />
        <Column title="Rejected" items={grouped.REJECTED} />
      </div>
      <div style={{ marginTop: 16 }}>
        <Link href="/">← Back</Link>
      </div>
    </main>
  );
}
