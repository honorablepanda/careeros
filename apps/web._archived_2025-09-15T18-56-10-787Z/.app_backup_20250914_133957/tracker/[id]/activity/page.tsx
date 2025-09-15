import React from 'react';

export default async function TrackerActivityByIdPage({ params }: { params: { id: string } }) {
  return (
    <main style={{ padding: 24 }}>
      <h1>Tracker Activity</h1>
      <p>Activity API not available — <strong>No activity</strong></p>
      <p style={{ marginTop: 12, opacity: 0.7 }}>Application ID: <code>{params.id}</code></p>
    </main>
  );
}
