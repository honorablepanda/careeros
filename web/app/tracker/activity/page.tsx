// web/app/tracker/activity/page.tsx
import React from 'react';
import { prisma } from '../../../lib/prisma';

export const dynamic = 'force-dynamic';

export default async function ActivityPage(props: any) {
  // Next 15 can type searchParams as a Promise in generated types.
  const sp = props?.searchParams && typeof props.searchParams.then === 'function'
    ? await props.searchParams
    : props?.searchParams;

  const idRaw: unknown = sp?.id;
  const id = typeof idRaw === 'string' ? idRaw.trim() : '';

  // If no id provided via ?id=..., just show a friendly message or recent activity.
  if (!id) {
    const recent = await prisma.applicationActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, type: true, payload: true, createdAt: true },
    });

    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
          Tracker Activity
        </h1>
        <p style={{ marginBottom: 16, color: '#666' }}>
          Provide an <code>?id=...</code> query parameter to view a specific application’s activity.
        </p>

        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Recent Activity</h2>
        {recent.length === 0 ? (
          <p>— No recent activity —</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {recent.map((a) => (
              <li
                key={a.id}
                style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}
              >
                <div>
                  <strong>{a.type}</strong>{' '}
                  <time
                    suppressHydrationWarning
                    dateTime={new Date(a.createdAt).toISOString()}
                  >
                    {new Date(a.createdAt).toLocaleString()}
                  </time>
                </div>
                {a.payload && (
                  <pre
                    style={{
                      margin: '6px 0 0',
                      background: '#fafafa',
                      padding: 8,
                      border: '1px solid #eee',
                      borderRadius: 6,
                      overflowX: 'auto',
                    }}
                  >
                    {JSON.stringify(a.payload, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  // If an id is present, show that application and its activity.
  const [app, activity] = await Promise.all([
    prisma.application.findUnique({
      where: { id },
      select: { id: true, company: true, status: true }, // no 'role' – not in schema
    }),
    prisma.applicationActivity.findMany({
      where: { applicationId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, payload: true, createdAt: true },
    }),
  ]);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
        Tracker Activity
      </h1>
      <p style={{ marginBottom: 20, color: '#666' }}>
        Application id: <code>{id}</code>
      </p>

      {!app ? (
        <p style={{ color: '#b00' }}>No application found for this id.</p>
      ) : (
        <section>
          <div style={{ marginBottom: 16 }}>
            <div><strong>Company:</strong> {app.company}</div>
            <div><strong>Status:</strong> {app.status}</div>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Activity
          </h2>
          {activity.length === 0 ? (
            <p>— No activity yet —</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {activity.map((a) => (
                <li
                  key={a.id}
                  style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}
                >
                  <div>
                    <strong>{a.type}</strong>{' '}
                    <time
                      suppressHydrationWarning
                      dateTime={new Date(a.createdAt).toISOString()}
                    >
                      {new Date(a.createdAt).toLocaleString()}
                    </time>
                  </div>
                  {a.payload && (
                    <pre
                      style={{
                        margin: '6px 0 0',
                        background: '#fafafa',
                        padding: 8,
                        border: '1px solid #eee',
                        borderRadius: 6,
                        overflowX: 'auto',
                      }}
                    >
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
