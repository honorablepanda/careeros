/* eslint-disable no-console */
const SuperJSON = require('superjson').default;

const BASE = process.env.TRPC_URL || 'http://localhost:3000/api/trpc';

async function read(res) {
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return { parseError: txt };
  }
}
const sjs = (v) => SuperJSON.serialize(v);

/** GET query: /path?input=<SuperJSON JSON> */
async function queryGET(path, input) {
  const url = `${BASE}/${path}?input=${encodeURIComponent(
    JSON.stringify(sjs(input ?? {}))
  )}`;
  const res = await fetch(url, { method: 'GET' });
  return { url, status: res.status, json: await read(res) };
}

/** POST mutation: body is SuperJSON envelope */
async function mutatePOST(path, input) {
  const url = `${BASE}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sjs(input ?? {})),
  });
  return { url, status: res.status, json: await read(res) };
}

(async () => {
  console.log('→ QUERY tracker.getApplications (GET)');
  console.log(
    await queryGET('tracker.getApplications', { userId: 'demo-user' })
  );

  console.log('→ MUTATION tracker.createApplication (POST)');
  console.log(
    await mutatePOST('tracker.createApplication', {
      userId: 'demo-user',
      company: 'ACME',
      role: 'SWE',
      status: 'APPLIED',
      source: 'OTHER',
    })
  );

  console.log('→ QUERY tracker.getApplications (GET) after insert');
  console.log(
    await queryGET('tracker.getApplications', { userId: 'demo-user' })
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
