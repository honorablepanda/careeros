// tools/scripts/scaffold-activity-ui.cjs
const fs = require('fs');
const path = require('path');

function ensure(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✓ created', filePath);
  } else {
    const cur = fs.readFileSync(filePath, 'utf8');
    if (cur.trim() !== content.trim()) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('✓ updated', filePath);
    } else {
      console.log('• exists (ok)', filePath);
    }
  }
}

function tryPatchNav(filePath) {
  if (!fs.existsSync(filePath)) return console.log('• nav not found (skip)', filePath);
  const src = fs.readFileSync(filePath, 'utf8');
  if (src.includes('/tracker/activity')) return console.log('• nav already has link (ok)');
  // naive insert: before the first </ul> or </nav>
  const li = `\n  <li><a href="/tracker/activity">Activity</a></li>\n`;
  let patched = null;
  if (src.includes('</ul>')) patched = src.replace('</ul>', `${li}</ul>`);
  else if (src.includes('</nav>')) patched = src.replace('</nav>', `${li}</nav>`);
  if (patched && patched !== src) {
    fs.writeFileSync(filePath, patched, 'utf8');
    console.log('✓ added Activity link to', filePath);
  } else {
    console.log('• nav pattern not matched, leaving as-is');
  }
}

// 1) Real Activity page
ensure(
  path.join('apps', 'web', 'app', 'tracker', 'activity', 'page.tsx'),
  `\'use client\';

import * as React from 'react';
import { trpc } from '@/trpc';
import { Skeleton } from '@/components/ui/skeleton';

function ActivityRow({ item }: { item: any }) {
  const createdAt = item?.createdAt ? new Date(item.createdAt) : null;

  return (
    <li className="grid grid-cols-[auto_1fr] gap-3 items-start">
      <div className="mt-1 h-2 w-2 rounded-full bg-current" />
      <div className="space-y-1">
        <div className="text-sm font-medium">
          {item.type === 'CREATE' && 'Application created'}
          {item.type === 'STATUS_CHANGE' && (
            <>Status changed to <span className="font-semibold">{item?.payload?.to}</span></>
          )}
          {!['CREATE','STATUS_CHANGE'].includes(item?.type) && item?.type}
        </div>
        {createdAt && (
          <div className="text-xs text-muted-foreground">
            {createdAt.toLocaleString()}
          </div>
        )}
        {item?.type === 'CREATE' && item?.payload?.data && (
          <pre className="text-xs bg-muted/40 rounded p-2 overflow-auto max-h-40">
            {JSON.stringify(item.payload.data, null, 2)}
          </pre>
        )}
      </div>
    </li>
  );
}

export default function ActivityPage() {
  const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const appId = search?.get('id') ?? '';

  const enabled = Boolean(appId);
  const { data, isLoading } = trpc.tracker.getApplicationActivity.useQuery(
    { id: appId },
    { enabled }
  );

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Tracker Activity</h1>

      {!appId && (
        <p className="text-sm text-muted-foreground">
          Provide an application id via <code>?id=</code> to view its activity.
        </p>
      )}

      {enabled && isLoading && (
        <ul className="space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-6 w-80" />
          <Skeleton className="h-24 w-full" />
        </ul>
      )}

      {enabled && !isLoading && (!data || data.length === 0) && <p>No activity</p>}

      {enabled && !!data?.length && (
        <ol className="space-y-4 border-l pl-4">
          {data.map((item: any) => (
            <ActivityRow key={item.id ?? item.createdAt ?? Math.random()} item={item} />
          ))}
        </ol>
      )}
    </main>
  );
}
`
);

// 2) Ensure @/trpc re-export exists
const trpcIdx = path.join('apps', 'web', 'src', 'trpc', 'index.ts');
ensure(
  trpcIdx,
  `export { trpc } from './react';
export * from './react';
`
);

// 3) Try to add a nav link (optional; safe best-effort)
[
  path.join('apps', 'web', 'src', 'components', 'site-nav.tsx'),
  path.join('apps', 'web', 'src', 'components', 'SiteNav.tsx'),
  path.join('apps', 'web', 'src', 'components', 'nav.tsx'),
].forEach(tryPatchNav);

console.log('Done.');
