import React from 'react';

export default async function TrackerActivityPage({ searchParams }: { searchParams: { id?: string } }) {
  const id = searchParams?.id;
  return (
    <main style={{ padding: 24 }}>
      <h1>Tracker Activity</h1>
      <p>Activity API not available — <strong>No activity</strong></p>
      {!id ? (
        <p style={{ marginTop: 12, opacity: 0.7 }}>
          Provide <code>?id=&lt;application-id&gt;</code> or use <code>/tracker/[id]/activity</code>.
        </p>
      ) : (
        <p style={{ marginTop: 12, opacity: 0.7 }}>Application ID: <code>{id}</code></p>
      )}
    </main>
  );
}
