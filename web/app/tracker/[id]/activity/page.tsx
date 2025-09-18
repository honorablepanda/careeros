// web/app/tracker/[id]/activity/page.tsx
import React from 'react';
import { prisma } from '../../../../lib/prisma';

export const dynamic = 'force-dynamic';

export default async function ActivityByIdPage({ params }: any) {
  // Next 15 may type `params` as a Promise in the generated .next/types.
  // Awaiting keeps us compatible with those types across versions.
  const { id } = await params;

  const [app, activity] = await Promise.all([
    prisma.application.findUnique({
      where: { id },
      select: { id: true, company: true, status: true },
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
        Dynamic id: <code>{id}</code>
      </p>

      {!app ? (
        <p style={{ color: '#b00' }}>No application found for this id.</p>
      ) : (
        <section>
          <div style={{ marginBottom: 16 }}>
            <div>
              <strong>Company:</strong> {app.company}
            </div>
            {/* role removed (not in schema) */}
            <div>
              <strong>Status:</strong> {app.status}
            </div>
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
