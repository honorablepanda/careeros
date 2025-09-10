#!/usr/bin/env node
/* eslint-disable no-console */
const { createTRPCProxyClient, httpBatchLink } = require('@trpc/client');
const SuperJSON = require('superjson').default;

const BASE = process.env.TRPC_URL || 'http://localhost:3000/api/trpc';

// Build a proper tRPC client so we don't have to guess HTTP shapes
const client = createTRPCProxyClient({
  transformer: SuperJSON,
  links: [httpBatchLink({ url: BASE })],
});

(async () => {
  console.log('→ QUERY tracker.getApplications');
  const r1 = await client.tracker.getApplications.query({ userId: 'demo-user' });
  console.log(JSON.stringify(r1, null, 2));

  console.log('→ MUTATION tracker.createApplication');
  // Use a valid enum value for `source`
  const m = await client.tracker.createApplication.mutate({
    userId: 'demo-user',
    company: 'ACME',
    role: 'SWE',
    status: 'APPLIED',
    source: 'JOB_BOARD',
  });
  console.log(JSON.stringify(m, null, 2));

  console.log('→ QUERY tracker.getApplications (after insert)');
  const r2 = await client.tracker.getApplications.query({ userId: 'demo-user' });
  console.log(JSON.stringify(r2, null, 2));
})().catch((e) => {
  console.error('Smoke test failed:', e?.response?.json ?? e);
  process.exit(1);
});
