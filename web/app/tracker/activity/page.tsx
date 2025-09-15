import React from 'react';
import Link from 'next/link';
import { prisma } from '../../../lib/prisma';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ id?: string | string[] }> };

export default async function ActivityByQueryPage({ searchParams }: Props) {
  const sp = await searchParams;
  const idRaw = sp?.id;
  const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
  const idTrim = id?.toString().trim();

  if (!idTrim) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Tracker Activity</h1>
        <p style={{ marginBottom: 12 }}>Provide an <code>?id=...</code> in the URL.</p>
        <p>Example: <code>/tracker/activity?id=YOUR_APP_ID</code></p>
      </main>
    );
  }

  const [app, activity] = await Promise.all([
    prisma.application.findUnique({
      where: { id: idTrim },
      select: { id: true, company: true, role: true, status: true },
    }),
    prisma.applicationActivity.findMany({
      where: { applicationId: idTrim },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, payload: true, createdAt: true },
    }),
  ]);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Tracker Activity</h1>
      <p style={{ marginBottom: 20, color: '#666' }}>Querystring id: <code>{idTrim}</code></p>

      <p style={{ marginBottom: 16 }}>
        Also try the dynamic route:{' '}
        <Link href={`/tracker/${idTrim}/activity`} style={{ color: '#06f' }}>
          /tracker/{'{'}id{'}'}/activity
        </Link>
      </p>

      {!app ? (
        <p style={{ color: '#b00' }}>No application found for this id.</p>
      ) : (
        <section>
          <div style={{ marginBottom: 16 }}>
            <div><strong>Company:</strong> {app.company}</div>
            <div><strong>Role:</strong> {app.role}</div>
            <div><strong>Status:</strong> {app.status}</div>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Activity</h2>
          {activity.length === 0 ? (
            <p>— No activity yet —</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {activity.map((a) => (
                <li key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                  <div>
                    <strong>{a.type}</strong>{' '}
                    <time suppressHydrationWarning dateTime={new Date(a.createdAt).toISOString()}>
                      {new Date(a.createdAt).toLocaleString()}
                    </time>
                  </div>
                  {a.payload && (
                    <pre style={{ margin: '6px 0 0', background: '#fafafa', padding: 8, border: '1px solid #eee', borderRadius: 6, overflowX: 'auto' }}>
                      {JSON.stringify(a.payload, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
